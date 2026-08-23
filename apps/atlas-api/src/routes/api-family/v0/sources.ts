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
  listSourceReleases,
  SourceRecordRequestError,
  streamSourceRecordsNdjson,
  type SourceFamily,
} from '../../../services/sourceRecords'
import type { AppEnv } from '../../../types'
import type { AccessAttribution } from '../../../services/accessAnalytics'

const SOURCE_FAMILIES = [
  {
    family: 'addresses',
    label: 'Address',
    sourceLabel: 'address',
  },
  {
    family: 'divisions',
    label: 'Division',
    sourceLabel: 'division',
  },
  {
    family: 'stats',
    label: 'Statistic',
    sourceLabel: 'statistics',
  },
] as const satisfies ReadonlyArray<{
  family: SourceFamily
  label: string
  sourceLabel: string
}>

const SOURCE_API_VERSIONS = ['v0', 'v0.1'] as const

type SourceApiVersion = (typeof SOURCE_API_VERSIONS)[number]

function sourceReleasesRouteConfig(
  { family, label, sourceLabel }: (typeof SOURCE_FAMILIES)[number],
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
        description: `List source releases contributing to a ${sourceLabel} API release.`,
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function sourceRecordsRouteConfig(
  { family, label, sourceLabel }: (typeof SOURCE_FAMILIES)[number],
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
              description: 'A newline-delimited stream of source records.',
            }),
          },
        },
        description:
          'List source records for one exact source release, or stream them as NDJSON.',
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: `Source release is unavailable for ${sourceLabel} source-record access.`,
      },
      422: {
        content: {
          'application/json': {
            schema: z.union([ErrorResponseSchema, ValidationErrorResponseSchema]),
          },
        },
        description: 'Request validation failed, including an invalid source cursor.',
      },
    },
  })
}

function sourceRoutesForFamily(familyDefinition: (typeof SOURCE_FAMILIES)[number]) {
  return SOURCE_API_VERSIONS.flatMap(version => {
    const sourceReleasesConfig = sourceReleasesRouteConfig(familyDefinition, version)
    const sourceRecordsConfig = sourceRecordsRouteConfig(familyDefinition, version)

    return [
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
            includeGeometry: query.include === 'geometry',
            metaDb: c.var.metaDb,
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
  try {
    const stream = await streamSourceRecordsNdjson({
      cursor: query.cursor,
      env: c.env,
      family,
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
