import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import type { Context, Next } from 'hono'

import {
  ErrorResponseSchema,
  SourceRecordsQuerySchema,
  SourceRecordsResponseSchema,
  SourceReleasesQuerySchema,
  SourceReleasesResponseSchema,
  ValidationErrorOpenAPIResponse,
  ValidationErrorResponseSchema,
} from '../../../schema'
import {
  listSourceRecords,
  getSourceRecordSchema,
  listSourceReleases,
  SourceRecordRequestError,
  streamSourceRecordsNdjson,
  type SourceFamily,
} from '../../../services/sourceRecords'
import type { AppEnv } from '../../../types'
import type { AccessAttribution } from '../../../services/accessAnalytics'
import { openApiText } from '../../../lib/openapi-i18n'

const SOURCE_FAMILIES = [
  {
    family: 'streets',
    label: 'Street',
    sourceReleasesDescription: 'Published source releases contributing to Streets.',
    sourceReleaseUnavailableDescription:
      'Source release is unavailable for street source-record access.',
  },
  {
    family: 'places',
    label: 'Place',
    sourceReleasesDescription: openApiText(
      'openapi_place_source_releases_list_description',
    ),
    sourceReleaseUnavailableDescription: openApiText(
      'openapi_place_source_release_unavailable_description',
    ),
  },
  {
    family: 'addresses',
    label: 'Address',
    sourceReleasesDescription: openApiText(
      'openapi_address_source_releases_list_description',
    ),
    sourceReleaseUnavailableDescription: openApiText(
      'openapi_address_source_release_unavailable_description',
    ),
  },
  {
    family: 'divisions',
    label: 'Division',
    sourceReleasesDescription: openApiText(
      'openapi_division_source_releases_list_description',
    ),
    sourceReleaseUnavailableDescription: openApiText(
      'openapi_division_source_release_unavailable_description',
    ),
  },
  {
    family: 'stats',
    label: 'Statistic',
    sourceReleasesDescription: openApiText(
      'openapi_statistics_source_releases_list_description',
    ),
    sourceReleaseUnavailableDescription: openApiText(
      'openapi_statistics_source_release_unavailable_description',
    ),
  },
] as const satisfies ReadonlyArray<{
  family: SourceFamily
  label: string
  sourceReleaseUnavailableDescription: string
  sourceReleasesDescription: string
}>

const SOURCE_API_VERSIONS = ['v0', 'v0.1'] as const

type SourceApiVersion = (typeof SOURCE_API_VERSIONS)[number]

function sourceReleasesRouteConfig(
  { family, label, sourceReleasesDescription }: (typeof SOURCE_FAMILIES)[number],
  version: SourceApiVersion,
) {
  return createRoute({
    method: 'get',
    path: `/${family}/${version}/source-releases`,
    operationId: `list${label}SourceReleases${version === 'v0' ? 'V0' : 'V01'}`,
    tags: ['Sources'],
    request: {
      query: SourceReleasesQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SourceReleasesResponseSchema,
          },
        },
        description: sourceReleasesDescription,
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function sourceRecordsRouteConfig(
  {
    family,
    label,
    sourceReleaseUnavailableDescription,
  }: (typeof SOURCE_FAMILIES)[number],
  version: SourceApiVersion,
) {
  return createRoute({
    method: 'get',
    path: `/${family}/${version}/sources`,
    operationId: `list${label}SourceRecords${version === 'v0' ? 'V0' : 'V01'}`,
    tags: ['Sources'],
    request: {
      query: SourceRecordsQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: SourceRecordsResponseSchema,
          },
          'application/x-ndjson': {
            schema: z.string().openapi({
              description: openApiText('openapi_source_records_ndjson_description'),
            }),
          },
        },
        description: openApiText('openapi_source_records_list_description'),
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: sourceReleaseUnavailableDescription,
      },
      422: {
        content: {
          'application/json': {
            schema: z.union([ErrorResponseSchema, ValidationErrorResponseSchema]),
          },
        },
        description: openApiText(
          'openapi_source_records_validation_failed_description',
        ),
      },
    },
  })
}

function sourceRoutesForFamily(familyDefinition: (typeof SOURCE_FAMILIES)[number]) {
  // Streets forwards its entire major alias to v0.1; registering only part of
  // that alias would hide the canonical Street paths from its OpenAPI document.
  const versions =
    familyDefinition.family === 'streets' ? (['v0.1'] as const) : SOURCE_API_VERSIONS
  return versions.flatMap(version => {
    const sourceReleasesConfig = sourceReleasesRouteConfig(familyDefinition, version)
    const sourceRecordsConfig = sourceRecordsRouteConfig(familyDefinition, version)
    const sourceSchemaConfig = createRoute({
      method: 'get',
      path: `/${familyDefinition.family}/${version}/source-schema`,
      operationId: `get${familyDefinition.label}SourceSchema${version === 'v0' ? 'V0' : 'V01'}`,
      tags: ['Sources'],
      request: {
        query: SourceRecordsQuerySchema.pick({ sourceRelease: true, region: true }),
      },
      responses: {
        200: {
          description:
            'Field types present in all retained publisher records for the selected source release. This inventory is not an upstream validation specification.',
          content: {
            'application/json': {
              schema: z.object({
                type: z.literal('object'),
                additionalProperties: z.boolean(),
                properties: z.record(z.string(), z.unknown()),
              }),
            },
          },
        },
        404: sourceRecordsConfig.responses[404],
        422: ValidationErrorOpenAPIResponse,
      },
    })

    return [
      defineOpenAPIRoute<typeof sourceSchemaConfig, AppEnv>({
        route: sourceSchemaConfig,
        handler: async c => {
          const query = c.req.valid('query')
          const schema = await getSourceRecordSchema({
            env: c.env,
            family: familyDefinition.family,
            metaDb: c.var.metaDb,
            region: query.region,
            sourceReleaseCode: query.sourceRelease,
          })
          if (!schema) return sourceRecordsUnavailable(c)
          return c.json(schema, 200)
        },
      }),
      defineOpenAPIRoute<typeof sourceReleasesConfig, AppEnv>({
        route: sourceReleasesConfig,
        handler: async c => {
          const query = c.req.valid('query')
          const selector = query.releaseSet
            ? { kind: 'releaseSet' as const, value: query.releaseSet }
            : query.snapshot
              ? { kind: 'snapshot' as const, value: query.snapshot }
              : query.cohort
                ? { kind: 'cohort' as const, value: query.cohort }
                : undefined
          const sourceReleases = await listSourceReleases({
            datasetCode: query.dataset,
            family: familyDefinition.family,
            region: query.region,
            metaDb: c.var.metaDb,
            selector,
          })

          return c.json({ sourceReleases }, 200)
        },
      }),
      defineOpenAPIRoute<typeof sourceRecordsConfig, AppEnv>({
        route: sourceRecordsConfig,
        handler: async c => {
          const query = c.req.valid('query')
          if (query.format === 'ndjson') {
            throw new Error(
              'NDJSON source requests must be handled before the OpenAPI route.',
            )
          }
          const args = {
            cursor: query.cursor,
            env: c.env,
            family: familyDefinition.family,
            region: query.region,
            includeGeometry: query.include === 'geometry',
            metaDb: c.var.metaDb,
            sample: query.sample,
            sourceReleaseCode: query.sourceRelease,
            onResolved: (attribution: AccessAttribution) =>
              c.set('accessAttribution', attribution),
          }

          try {
            const result = await listSourceRecords({ ...args, limit: query.limit })
            if (!result) return sourceRecordsUnavailable(c)
            return c.json(result, 200)
          } catch (error) {
            if (error instanceof SourceRecordRequestError) {
              return c.json(
                {
                  httpStatus: 422,
                  error: error.code,
                  message: error.message,
                },
                422,
              )
            }

            throw error
          }
        },
      }),
    ]
  })
}

export async function streamSourceRecordsMiddleware(
  family: SourceFamily,
  c: Context<AppEnv>,
  next: Next,
) {
  if (c.req.query('format') !== 'ndjson') return next()

  const parsed = SourceRecordsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return c.json(
      {
        details: parsed.error.issues.map((issue: z.ZodIssue) => ({
          code: issue.code,
          message: issue.message,
          path: issue.path.join('.'),
        })),
        error: 'validation_error',
        message: 'Request validation failed.',
        target: 'query',
      },
      422,
    )
  }

  const query = parsed.data
  if (query.sample) {
    return c.json(
      {
        httpStatus: 422,
        error: 'random_sample_not_streamable',
        message: 'Random source-record samples are available only as JSON.',
      },
      422,
    )
  }
  try {
    const stream = await streamSourceRecordsNdjson({
      cursor: query.cursor,
      env: c.env,
      family,
      region: query.region,
      includeGeometry: query.include === 'geometry',
      metaDb: c.var.metaDb,
      sourceReleaseCode: query.sourceRelease,
      onResolved: (attribution: AccessAttribution) =>
        c.set('accessAttribution', attribution),
    })
    if (!stream) return sourceRecordsUnavailable(c)

    const headers = new Headers({
      'content-type': 'application/x-ndjson; charset=utf-8',
    })
    if (query.download === '1') {
      headers.set(
        'content-disposition',
        `attachment; filename="${sourceRecordsFilename(query.sourceRelease)}"`,
      )
    }

    return new Response(stream, { headers })
  } catch (error) {
    if (error instanceof SourceRecordRequestError) {
      return c.json(
        {
          httpStatus: 422,
          error: error.code,
          message: error.message,
        },
        422,
      )
    }

    throw error
  }
}

function sourceRecordsFilename(sourceReleaseCode: string) {
  const safeCode = sourceReleaseCode.replaceAll(/[^A-Za-z0-9._-]/g, '_')
  return `${safeCode || 'source-records'}.ndjson`
}

function sourceRecordsUnavailable(c: Context<AppEnv>) {
  return c.json(
    {
      httpStatus: 404,
      error: 'source_records_not_available',
      message: 'Source records are not available for this source release.',
    },
    404,
  )
}

export const sourceRoutes = SOURCE_FAMILIES.flatMap(sourceRoutesForFamily)
