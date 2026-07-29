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
} from '../../schema'
import {
  listSourceRecords,
  listSourceReleases,
  SourceRecordRequestError,
  streamSourceRecordsNdjson,
} from '../../services/sourceRecords'
import type { AppEnv } from '../../types'

const sourceReleasesRouteConfig = createRoute({
  method: 'get',
  path: '/v0.1/divisions/source-releases',
  operationId: 'listDivisionSourceReleasesV01',
  tags: ['Divisions'],
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
      description: 'List source releases contributing to a divisions API release.',
    },
    422: ValidationErrorOpenAPIResponse,
  },
})

const sourceRecordsRouteConfig = createRoute({
  method: 'get',
  path: '/v0.1/divisions/sources',
  operationId: 'listDivisionSourceRecordsV01',
  tags: ['Divisions'],
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
      description: 'Source release is unavailable for division source-record access.',
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

export const sourceReleasesRoute = defineOpenAPIRoute<
  typeof sourceReleasesRouteConfig,
  AppEnv
>({
  route: sourceReleasesRouteConfig,
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
      family: 'divisions',
      metaDb: c.var.metaDb,
      selector,
    })

    return c.json({ sourceReleases }, 200)
  },
})

export const sourceRecordsRoute = defineOpenAPIRoute<
  typeof sourceRecordsRouteConfig,
  AppEnv
>({
  route: sourceRecordsRouteConfig,
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
      family: 'divisions' as const,
      includeGeometry: query.include === 'geometry',
      metaDb: c.var.metaDb,
      sourceReleaseCode: query.sourceRelease,
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
})

export async function streamSourceRecordsMiddleware(c: Context<AppEnv>, next: Next) {
  if (c.req.query('format') !== 'ndjson') return next()

  const parsed = SourceRecordsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return c.json(
      {
        details: parsed.error.issues.map(issue => ({
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
      family: 'divisions',
      includeGeometry: query.include === 'geometry',
      metaDb: c.var.metaDb,
      sourceReleaseCode: query.sourceRelease,
    })
    if (!stream) return sourceRecordsUnavailable(c)

    const headers = new Headers({
      'content-type': 'application/x-ndjson; charset=utf-8',
    })
    if (query.download === '1') {
      headers.set(
        'content-disposition',
        `attachment; filename="${query.sourceRelease}.ndjson"`,
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

export const sourceRoutes = [sourceReleasesRoute, sourceRecordsRoute] as const
