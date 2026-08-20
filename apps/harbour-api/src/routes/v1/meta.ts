import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { computeVersionHash, toIsoTimestamp } from '@repo/db'

import { HealthResponseSchema } from '../../schema'
import { withPrimarySession } from '../../lib/d1'
import type { AppEnv } from '../../types'

const ApiReleaseSetDocsRowSchema = z
  .object({
    id: z.string(),
    apiFamily: z.string(),
    apiVersion: z.string(),
    code: z.string(),
    status: z.string(),
    schemaVersion: z.string(),
    rulesetVersion: z.string(),
    publishedAt: z.string().nullable(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    sources: z
      .array(
        z.object({
          datasetCode: z.string(),
          datasetI18n: z.array(z.object({ locale: z.string(), name: z.string() })),
          publisherCode: z.string(),
          publisherI18n: z.array(z.object({ locale: z.string(), name: z.string() })),
          releaseCode: z.string(),
          resourceType: z.string(),
          role: z.enum(['primary', 'supporting']),
          sourceVersion: z.string(),
          variant: z.string(),
        }),
      )
      .optional(),
  })
  .openapi('HarbourApiReleaseSetDocsRow')

const ApiReleaseSetDocsListResponseSchema = z
  .object({
    rows: z.array(ApiReleaseSetDocsRowSchema),
  })
  .openapi('HarbourApiReleaseSetDocsListResponse')

const ApiReleaseSetDocsUpdateRequestSchema = z
  .object({
    notes: z.string().nullable(),
  })
  .openapi('HarbourApiReleaseSetDocsUpdateRequest')

const ApiReleaseSetDocsUpdateResponseSchema = z
  .object({
    row: ApiReleaseSetDocsRowSchema,
  })
  .openapi('HarbourApiReleaseSetDocsUpdateResponse')

const ApiReleaseSetDocsParamSchema = z.object({
  code: z.string().min(1),
})

const ReleaseDocsRowSchema = z
  .object({
    id: z.string(),
    datasetId: z.string(),
    datasetCode: z.string(),
    regionCode: z.string(),
    theme: z.string(),
    type: z.string(),
    source: z.string(),
    code: z.string(),
    sourceVersion: z.string(),
    sourceSchemaVersion: z.string().nullable(),
    cohortKey: z.string().nullable(),
    publicationDate: z.string().nullable(),
    status: z.string(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('HarbourReleaseDocsRow')

const ReleaseDocsListResponseSchema = z
  .object({
    rows: z.array(ReleaseDocsRowSchema),
  })
  .openapi('HarbourReleaseDocsListResponse')

const ReleaseDocsUpdateRequestSchema = z
  .object({
    notes: z.string().nullable(),
  })
  .openapi('HarbourReleaseDocsUpdateRequest')

const ReleaseDocsUpdateResponseSchema = z
  .object({
    row: ReleaseDocsRowSchema,
  })
  .openapi('HarbourReleaseDocsUpdateResponse')

const ReleaseDocsParamSchema = z.object({
  code: z.string().min(1),
})

const healthRouteConfig = createRoute({
  method: 'get',
  path: '/v1/meta/health',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
      description: 'Health check status.',
    },
  },
})

const apiReleaseSetDocsListRouteConfig = createRoute({
  method: 'get',
  path: '/api/v1/meta/docs/apiReleaseSets',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiReleaseSetDocsListResponseSchema,
        },
      },
      description: 'API release sets with editable documentation notes.',
    },
  },
})

const apiReleaseSetDocsUpdateRouteConfig = createRoute({
  method: 'put',
  path: '/api/v1/meta/docs/apiReleaseSets/{code}',
  tags: ['Meta'],
  request: {
    params: ApiReleaseSetDocsParamSchema,
    body: {
      content: {
        'application/json': {
          schema: ApiReleaseSetDocsUpdateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiReleaseSetDocsUpdateResponseSchema,
        },
      },
      description: 'Updated API release set documentation notes.',
    },
    404: {
      description: 'API release set not found.',
    },
  },
})

const releaseDocsListRouteConfig = createRoute({
  method: 'get',
  path: '/api/v1/meta/docs/releases',
  tags: ['Meta'],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReleaseDocsListResponseSchema,
        },
      },
      description: 'Dataset releases with editable compatibility and usage notes.',
    },
  },
})

const releaseDocsUpdateRouteConfig = createRoute({
  method: 'put',
  path: '/api/v1/meta/docs/releases/{code}',
  tags: ['Meta'],
  request: {
    params: ReleaseDocsParamSchema,
    body: {
      content: {
        'application/json': {
          schema: ReleaseDocsUpdateRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReleaseDocsUpdateResponseSchema,
        },
      },
      description: 'Updated dataset release compatibility and usage notes.',
    },
    404: {
      description: 'Release not found.',
    },
  },
})

export const healthRoute = defineOpenAPIRoute<typeof healthRouteConfig, AppEnv>({
  route: healthRouteConfig,
  handler: async c => {
    const db = withPrimarySession(c.env.DB_META)
    const ping = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    const datasetCount = await db
      .prepare('SELECT COUNT(*) AS "count" FROM "datasets"')
      .first<{ count: number }>()

    return c.json(
      {
        ok: ping?.ok === 1,
        datasetCount: Number(datasetCount?.count ?? 0),
      },
      200,
    )
  },
})

type ApiReleaseSetDocsRow = z.infer<typeof ApiReleaseSetDocsRowSchema>
type ApiReleaseSetSourceDocsRow = NonNullable<ApiReleaseSetDocsRow['sources']>[number]
type ReleaseDocsRow = z.infer<typeof ReleaseDocsRowSchema>

export const apiReleaseSetDocsListRoute = defineOpenAPIRoute<
  typeof apiReleaseSetDocsListRouteConfig,
  AppEnv
>({
  route: apiReleaseSetDocsListRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    return c.json(
      {
        rows: await withApiReleaseSetSources(c.env.DB_META),
      },
      200,
    )
  },
})

export const apiReleaseSetDocsUpdateRoute = defineOpenAPIRoute<
  typeof apiReleaseSetDocsUpdateRouteConfig,
  AppEnv
>({
  route: apiReleaseSetDocsUpdateRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    const { code } = c.req.valid('param')
    const { notes } = c.req.valid('json')
    const db = withPrimarySession(c.env.DB_META)
    const existing = await db
      .prepare(
        `
        SELECT
          ars.id,
          av.familyType AS apiFamily,
          av.code AS apiVersion,
          ars.code,
          ars.status,
          ars.schemaVersion,
          ars.rulesetVersion,
          ars.publishedAt,
          ars.validFrom,
          ars.validTo,
          ars.notes,
          ars.createdAt,
          ars.updatedAt
        FROM apiReleaseSets ars
        INNER JOIN apiVersions av ON av.id = ars.apiVersionId
        WHERE ars.code = ?
        LIMIT 1
        `,
      )
      .bind(code)
      .first<ApiReleaseSetDocsRow>()

    if (!existing) {
      return c.json(
        {
          httpStatus: 404,
          error: 'not_found',
          message: `API release set not found: ${code}`,
        },
        404,
      )
    }

    const updatedAt = toIsoTimestamp()
    const parsedReleaseSetCode = parseReleaseSetCode(existing.code)
    const versionHash = computeVersionHash({
      apiVersion: existing.apiVersion,
      releaseSetCode: existing.code,
      cohortKey: parsedReleaseSetCode?.cohortKey ?? null,
      schemaVersion: existing.schemaVersion,
      rulesetVersion: existing.rulesetVersion,
      status: existing.status,
      publishedAt: existing.publishedAt,
      validFrom: existing.validFrom,
      validTo: existing.validTo,
      notes,
    })

    await db
      .prepare(
        `
        UPDATE apiReleaseSets
        SET notes = ?, versionHash = ?, updatedAt = ?
        WHERE code = ?
        `,
      )
      .bind(notes, versionHash, updatedAt, code)
      .run()

    return c.json(
      {
        row: {
          ...existing,
          notes,
          updatedAt,
        },
      },
      200,
    )
  },
})

export const releaseDocsListRoute = defineOpenAPIRoute<
  typeof releaseDocsListRouteConfig,
  AppEnv
>({
  route: releaseDocsListRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    return c.json(
      {
        rows: await listReleaseDocsRows(c.env.DB_META),
      },
      200,
    )
  },
})

export const releaseDocsUpdateRoute = defineOpenAPIRoute<
  typeof releaseDocsUpdateRouteConfig,
  AppEnv
>({
  route: releaseDocsUpdateRouteConfig,
  handler: async c => {
    c.header('cache-control', 'no-store')

    const { code } = c.req.valid('param')
    const { notes } = c.req.valid('json')
    const db = withPrimarySession(c.env.DB_META)
    const existing = await findReleaseDocsRow(db, code)

    if (!existing) {
      return c.json(
        {
          httpStatus: 404,
          error: 'not_found',
          message: `Release not found: ${code}`,
        },
        404,
      )
    }

    const updatedAt = toIsoTimestamp()

    await db
      .prepare(
        `
        UPDATE releases
        SET notes = ?, updatedAt = ?
        WHERE code = ?
        `,
      )
      .bind(notes, updatedAt, code)
      .run()

    return c.json(
      {
        row: {
          ...existing,
          notes,
          updatedAt,
        },
      },
      200,
    )
  },
})

async function listApiReleaseSetDocsRows(dbBinding: D1Database) {
  const db = withPrimarySession(dbBinding)
  const result = await db
    .prepare(
      `
      SELECT
        ars.id,
        av.familyType AS apiFamily,
        av.code AS apiVersion,
        ars.code,
        ars.status,
        ars.schemaVersion,
        ars.rulesetVersion,
        ars.publishedAt,
        ars.validFrom,
        ars.validTo,
        ars.notes,
        ars.createdAt,
        ars.updatedAt
      FROM apiReleaseSets ars
      INNER JOIN apiVersions av ON av.id = ars.apiVersionId
      ORDER BY av.familyType, ars.publishedAt, ars.createdAt, ars.code
      `,
    )
    .all<ApiReleaseSetDocsRow>()

  return result.results ?? []
}

async function withApiReleaseSetSources(dbBinding: D1Database) {
  const rows = await listApiReleaseSetDocsRows(dbBinding)
  const sourcesByReleaseSetId = await listApiReleaseSetSources(dbBinding)

  return rows.map(row => ({
    ...row,
    sources: sourcesByReleaseSetId.get(row.id) ?? [],
  }))
}

type ApiReleaseSetSourceQueryRow = {
  apiReleaseSetId: string
  datasetCode: string
  datasetId: string
  publisherCode: string
  publisherId: string
  releaseCode: string
  resourceType: string
  role: string
  resourceReleaseCode: string
  sourceReleaseId: string
  sourceVersion: string
  variant: string
}

type LocalisedDocsNameRow = {
  id: string
  locale: string
  name: string
}

async function listApiReleaseSetSources(dbBinding: D1Database) {
  const db = withPrimarySession(dbBinding)
  const [sourceResult, datasetI18nResult, publisherI18nResult] = await Promise.all([
    db
      .prepare(
        `
        SELECT
          arss.apiReleaseSetId,
          d.code AS datasetCode,
          d.id AS datasetId,
          p.code AS publisherCode,
          p.id AS publisherId,
          sr.code AS releaseCode,
          s.resourceType,
          CASE
            WHEN arss.role = 'primary' AND ss.role = 'primary' THEN 'primary'
            ELSE 'supporting'
          END AS role,
          r.code AS resourceReleaseCode,
          ss.sourceReleaseId,
          r.sourceVersion,
          arss.variant
        FROM apiReleaseSetSnapshots arss
        INNER JOIN snapshots s ON s.id = arss.snapshotId
        INNER JOIN snapshotSources ss ON ss.snapshotId = arss.snapshotId
        INNER JOIN releases r ON r.id = ss.sourceReleaseId
        INNER JOIN sourceReleases sr ON sr.id = r.sourceReleaseId
        INNER JOIN datasets d ON d.id = ss.datasetId
        INNER JOIN publishers p ON p.id = d.publisherId
        WHERE ss.role <> 'lookup'
        ORDER BY arss.apiReleaseSetId, role, s.resourceType, r.code
        `,
      )
      .all<ApiReleaseSetSourceQueryRow>(),
    db
      .prepare('SELECT datasetId AS id, locale, name FROM datasetI18n')
      .all<LocalisedDocsNameRow>(),
    db
      .prepare('SELECT publisherId AS id, locale, name FROM publisherI18n')
      .all<LocalisedDocsNameRow>(),
  ])

  const datasetI18nById = groupLocalisedDocsNames(datasetI18nResult.results ?? [])
  const publisherI18nById = groupLocalisedDocsNames(publisherI18nResult.results ?? [])
  const sourcesByReleaseSetId = new Map<string, ApiReleaseSetSourceDocsRow[]>()

  for (const source of sourceResult.results ?? []) {
    const sources = sourcesByReleaseSetId.get(source.apiReleaseSetId) ?? []
    const existingIndex = sources.findIndex(
      candidate =>
        candidate.releaseCode === source.releaseCode &&
        candidate.resourceType === source.resourceType &&
        candidate.variant === source.variant,
    )
    const next: ApiReleaseSetSourceDocsRow = {
      datasetCode: source.datasetCode,
      datasetI18n: datasetI18nById.get(source.datasetId) ?? [],
      publisherCode: source.publisherCode,
      publisherI18n: publisherI18nById.get(source.publisherId) ?? [],
      releaseCode: source.releaseCode,
      resourceType: source.resourceType,
      role: source.role === 'primary' ? 'primary' : 'supporting',
      sourceVersion: source.sourceVersion,
      variant: source.variant,
    }

    if (existingIndex === -1) {
      sources.push(next)
    } else if (
      sources[existingIndex]?.role === 'supporting' &&
      next.role === 'primary'
    ) {
      sources[existingIndex] = next
    }

    sourcesByReleaseSetId.set(source.apiReleaseSetId, sources)
  }

  return sourcesByReleaseSetId
}

function groupLocalisedDocsNames(rows: LocalisedDocsNameRow[]) {
  const grouped = new Map<string, Array<{ locale: string; name: string }>>()

  for (const row of rows) {
    grouped.set(row.id, [
      ...(grouped.get(row.id) ?? []),
      { locale: row.locale, name: row.name },
    ])
  }

  return grouped
}

async function listReleaseDocsRows(dbBinding: D1Database) {
  const db = withPrimarySession(dbBinding)
  const result = await db
    .prepare(
      `
      SELECT
        r.id,
        d.id AS datasetId,
        d.code AS datasetCode,
        d.regionCode,
        d.theme,
        r.resourceType AS type,
        p.code AS source,
        r.code,
        r.sourceVersion,
        r.sourceSchemaVersion,
        r.cohortKey,
        r.publicationDate,
        r.status,
        r.notes,
        r.createdAt,
        r.updatedAt
      FROM releases r
      INNER JOIN datasets d ON d.id = r.datasetId
      INNER JOIN publishers p ON p.id = d.publisherId
      ORDER BY d.code, r.sourceVersion, r.cohortKey, r.createdAt, r.code
      `,
    )
    .all<ReleaseDocsRow>()

  return result.results ?? []
}

async function findReleaseDocsRow(db: D1Database, code: string) {
  return db
    .prepare(
      `
      SELECT
        r.id,
        d.id AS datasetId,
        d.code AS datasetCode,
        d.regionCode,
        d.theme,
        r.resourceType AS type,
        p.code AS source,
        r.code,
        r.sourceVersion,
        r.sourceSchemaVersion,
        r.cohortKey,
        r.publicationDate,
        r.status,
        r.notes,
        r.createdAt,
        r.updatedAt
      FROM releases r
      INNER JOIN datasets d ON d.id = r.datasetId
      INNER JOIN publishers p ON p.id = d.publisherId
      WHERE r.code = ?
      LIMIT 1
      `,
    )
    .bind(code)
    .first<ReleaseDocsRow>()
}

function parseReleaseSetCode(code: string) {
  const match = /^data-[a-z0-9]+-[a-z]+-(.+)-\d+$/.exec(code)

  return match?.[1] ? { cohortKey: match[1] } : null
}

export const metaRoutes = [
  healthRoute,
  apiReleaseSetDocsListRoute,
  apiReleaseSetDocsUpdateRoute,
  releaseDocsListRoute,
  releaseDocsUpdateRoute,
] as const
