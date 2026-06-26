import { and, desc, eq, metaSchema } from '@repo/db'
import { inArray, sql } from 'drizzle-orm'
import { resolveShardForKindRegionYear } from '@repo/core/db/meta-repository'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { DatasetType } from '@repo/db'

const {
  ingestRuns,
  metaDataShards,
  metaDatasets,
  metaPublishers,
  metaReleaseShardAssignments,
  metaReleases,
  stats,
} = metaSchema

export type ReportBindings = Record<string, unknown>

export type ReportRowCount = {
  kind: 'history' | 'source'
  label: string
  rowCount: number
  tableName: string
}

export type IngestRunReportRow = {
  datasetCode: string
  error: unknown
  finishedAt: string | null
  phase: string
  releaseCode: string
  releaseId: string
  runId: string
  snapshotMonth: string | null
  source: string
  startedAt: string
  stats: unknown
  status: string
  type: string
}

export type StatReportRow = {
  createdAt: string
  datasetCode: string
  dimension: string
  groupBy: string | null
  groupValue: string | null
  id: string
  metric: string
  metricUnit: string
  releaseCode: string
  releaseId: string
  source: string
  type: string
  updatedAt: string
  value: number
}

export type ReportFilters = {
  limit?: number
  source?: string
  type?: DatasetType
}

export type ListStatsOptions = ReportFilters & {
  releaseId?: string
}

export type ReleaseReportRow = {
  createdAt: string
  datasetCode: string
  datasetId: string
  ingestedAt: string | null
  originalFileName: string | null
  publicationDate: string | null
  rawObjectKey: string | null
  releaseCode: string
  releaseId: string
  revocationReason: string | null
  revokedAt: string | null
  rowCounts: ReportRowCount[]
  snapshotMonth: string | null
  source: string
  sourceVersion: string
  status: string
  supersededByReleaseId: string | null
  type: string
  updatedAt: string
}

type ReleaseContext = {
  regionCode: string
  releaseId: string
  source: string
  sourceUrl: string
  sourceVersion: string
  snapshotMonth: string | null
  type: string
}

type ReleaseQueryRow = Omit<ReleaseReportRow, 'rowCounts'> & {
  regionCode: string
  sourceUrl: string
}

type CountSpec = {
  label: string
  tableName: string
} & (
  | {
      parentTableName?: never
      parentKey?: never
      relationshipKey?: never
      strategy: 'direct'
    }
  | {
      parentKey: string
      parentTableName: string
      relationshipKey: string
      strategy: 'join'
    }
)

export async function listIngestRuns(
  db: HarbourReadableDb,
  options: ReportFilters,
): Promise<IngestRunReportRow[]> {
  const query = db
    .select({
      datasetCode: metaDatasets.code,
      error: ingestRuns.error,
      finishedAt: ingestRuns.finishedAt,
      phase: ingestRuns.phase,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      runId: ingestRuns.runId,
      snapshotMonth: metaReleases.snapshotMonth,
      source: metaPublishers.code,
      startedAt: ingestRuns.startedAt,
      stats: ingestRuns.stats,
      status: ingestRuns.status,
      type: metaDatasets.type,
    })
    .from(ingestRuns)
    .innerJoin(metaReleases, eq(ingestRuns.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(ingestRuns.startedAt), desc(ingestRuns.createdAt))
  const releaseIds = await listLatestIngestRunReleaseIds(db, {
    limit: options.limit ?? 10,
    source: options.source,
    type: options.type,
  })

  if (releaseIds.length === 0) {
    return []
  }

  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(and(whereClause, inArray(ingestRuns.releaseId, releaseIds)))
          .all()
      : await query.where(inArray(ingestRuns.releaseId, releaseIds)).all()
  ) as IngestRunReportRow[]

  return rows.map(row => ({
    ...row,
    error: normalizeJsonField(row.error),
    stats: normalizeJsonField(row.stats),
  }))
}

export async function listStats(
  db: HarbourReadableDb,
  options: ListStatsOptions,
): Promise<StatReportRow[]> {
  const query = db
    .select({
      createdAt: stats.createdAt,
      datasetCode: metaDatasets.code,
      dimension: stats.dimension,
      groupBy: stats.groupBy,
      groupValue: stats.groupValue,
      id: stats.id,
      metric: stats.metric,
      metricUnit: stats.metricUnit,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      source: metaPublishers.code,
      type: metaDatasets.type,
      updatedAt: stats.updatedAt,
      value: stats.value,
    })
    .from(stats)
    .innerJoin(metaReleases, eq(stats.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(stats.createdAt), desc(stats.updatedAt))

  const releaseIds = options.releaseId
    ? [options.releaseId]
    : await listLatestStatsReleaseIds(db, {
        limit: options.limit ?? 1,
        source: options.source,
        type: options.type,
      })

  if (releaseIds.length === 0) {
    return []
  }

  const rows = (await query
    .where(inArray(stats.releaseId, releaseIds))
    .all()) as StatReportRow[]

  return rows.map(row => ({
    ...row,
    createdAt: toIsoString(row.createdAt) ?? '',
    updatedAt: toIsoString(row.updatedAt) ?? '',
  }))
}

export async function listReleases(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  options: ReportFilters,
): Promise<ReleaseReportRow[]> {
  const query = db
    .select({
      createdAt: metaReleases.createdAt,
      datasetCode: metaDatasets.code,
      datasetId: metaDatasets.id,
      ingestedAt: metaReleases.ingestedAt,
      originalFileName: metaReleases.originalFileName,
      publicationDate: metaReleases.publicationDate,
      rawObjectKey: metaReleases.rawObjectKey,
      regionCode: metaDatasets.regionCode,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      revocationReason: metaReleases.revocationReason,
      revokedAt: metaReleases.revokedAt,
      snapshotMonth: metaReleases.snapshotMonth,
      source: metaPublishers.code,
      sourceUrl: metaDatasets.sourceUrl,
      sourceVersion: metaReleases.sourceVersion,
      status: metaReleases.status,
      supersededByReleaseId: metaReleases.supersededByReleaseId,
      type: metaDatasets.type,
      updatedAt: metaReleases.updatedAt,
    })
    .from(metaReleases)
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(metaReleases.ingestedAt), desc(metaReleases.createdAt))
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(whereClause)
          .limit(options.limit ?? 10)
          .all()
      : await query.limit(options.limit ?? 10).all()
  ) as ReleaseQueryRow[]
  const rowCountsByReleaseId = await listReleaseRowCounts(
    db,
    bindings,
    environment,
    rows,
  )

  return rows.map(row => ({
    createdAt: toIsoString(row.createdAt) ?? '',
    datasetCode: row.datasetCode,
    datasetId: row.datasetId,
    ingestedAt: toIsoString(row.ingestedAt),
    originalFileName: row.originalFileName,
    publicationDate: row.publicationDate,
    rawObjectKey: row.rawObjectKey,
    releaseCode: row.releaseCode,
    releaseId: row.releaseId,
    revocationReason: row.revocationReason,
    revokedAt: toIsoString(row.revokedAt),
    rowCounts: rowCountsByReleaseId.get(row.releaseId) ?? [],
    snapshotMonth: row.snapshotMonth,
    source: row.source,
    sourceVersion: row.sourceVersion,
    status: row.status,
    supersededByReleaseId: row.supersededByReleaseId,
    type: row.type,
    updatedAt: toIsoString(row.updatedAt) ?? '',
  }))
}

async function listLatestIngestRunReleaseIds(
  db: HarbourReadableDb,
  options: ReportFilters,
) {
  const latestStartedAt = sql<string>`max(${ingestRuns.startedAt})`
  const latestCreatedAt = sql<number>`max(${ingestRuns.createdAt})`
  const query = db
    .select({
      createdAt: latestCreatedAt,
      releaseCreatedAt: metaReleases.createdAt,
      releaseId: metaReleases.id,
      startedAt: latestStartedAt,
    })
    .from(ingestRuns)
    .innerJoin(metaReleases, eq(ingestRuns.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(metaReleases.id, metaReleases.createdAt)
    .orderBy(desc(latestStartedAt), desc(latestCreatedAt), desc(metaReleases.createdAt))
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(whereClause)
          .limit(options.limit ?? 10)
          .all()
      : await query.limit(options.limit ?? 10).all()
  ) as Array<{ releaseId: string }>

  return rows.map(row => row.releaseId)
}

type CountTarget = {
  binding: D1Database | undefined
  kind: 'history' | 'source'
  releaseId: string
  specs: CountSpec[]
}

type ReleaseCountPlan = {
  history: CountTarget | null
  releaseId: string
  source: CountTarget | null
}

async function listReleaseRowCounts(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
): Promise<Map<string, ReportRowCount[]>> {
  if (releases.length === 0) {
    return new Map()
  }

  const plans = await buildReleaseCountPlans(db, bindings, environment, releases)
  const countsByReleaseSpec = await collectCountRowsByRelease(plans)

  return new Map(
    plans.map(plan => [
      plan.releaseId,
      [
        ...buildReportRowCounts(plan.source, countsByReleaseSpec),
        ...buildReportRowCounts(plan.history, countsByReleaseSpec),
      ],
    ]),
  )
}

async function listLatestStatsReleaseIds(
  db: HarbourReadableDb,
  options: ReportFilters,
) {
  const latestCreatedAt = sql<number>`max(${stats.createdAt})`
  const latestUpdatedAt = sql<number>`max(${stats.updatedAt})`
  const query = db
    .select({
      createdAt: latestCreatedAt,
      releaseId: metaReleases.id,
      updatedAt: latestUpdatedAt,
    })
    .from(stats)
    .innerJoin(metaReleases, eq(stats.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(metaReleases.id, metaReleases.ingestedAt, metaReleases.createdAt)
    .orderBy(
      desc(metaReleases.ingestedAt),
      desc(latestCreatedAt),
      desc(latestUpdatedAt),
      desc(metaReleases.createdAt),
    )
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(whereClause)
          .limit(options.limit ?? 1)
          .all()
      : await query.limit(options.limit ?? 1).all()
  ) as Array<{ releaseId: string }>

  return rows.map(row => row.releaseId)
}

function buildReportFilterWhereClause(options: ReportFilters) {
  const conditions = []

  if (options.source) {
    conditions.push(eq(metaPublishers.code, options.source))
  }

  if (options.type) {
    conditions.push(eq(metaDatasets.type, options.type))
  }

  if (conditions.length === 0) {
    return undefined
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

async function buildReleaseCountPlans(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const [historyPlans, sourcePlans] = await Promise.all([
    buildHistoryCountTargets(db, bindings, environment, releases),
    buildSourceCountTargets(db, bindings, environment, releases),
  ])

  return releases.map(release => ({
    history: historyPlans.get(release.releaseId) ?? null,
    releaseId: release.releaseId,
    source: sourcePlans.get(release.releaseId) ?? null,
  }))
}

async function buildHistoryCountTargets(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const releaseIds = releases.map(release => release.releaseId)
  const assignedHistoryBindings = releaseIds.length
    ? ((await db
        .select({
          bindingName: metaDataShards.bindingName,
          releaseId: metaReleaseShardAssignments.releaseId,
        })
        .from(metaReleaseShardAssignments)
        .innerJoin(
          metaDataShards,
          eq(metaReleaseShardAssignments.dataShardId, metaDataShards.id),
        )
        .where(
          and(
            inArray(metaReleaseShardAssignments.releaseId, releaseIds),
            eq(metaDataShards.kind, 'history'),
            eq(metaDataShards.environment, environment),
            eq(metaDataShards.status, 'active'),
          ),
        )
        .all()) as Array<{ bindingName: string; releaseId: string }>)
    : []
  const assignedHistoryBindingsByReleaseId = new Map(
    assignedHistoryBindings.map(row => [row.releaseId, row.bindingName]),
  )
  const fallbackShards = await resolveFallbackShardsByRelease(
    db,
    'history',
    environment,
    releases.filter(release => {
      return !assignedHistoryBindingsByReleaseId.has(release.releaseId)
    }),
  )

  return new Map(
    releases.map(release => {
      const bindingName =
        assignedHistoryBindingsByReleaseId.get(release.releaseId) ??
        fallbackShards.get(release.releaseId)?.bindingName

      return [
        release.releaseId,
        {
          binding: bindingName ? resolveD1Binding(bindings, bindingName) : undefined,
          kind: 'history',
          releaseId: release.releaseId,
          specs: resolveHistoryCountSpecs(release.type),
        } satisfies CountTarget,
      ]
    }),
  )
}

async function buildSourceCountTargets(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const sourceShards = await resolveFallbackShardsByRelease(
    db,
    'source',
    environment,
    releases,
  )

  return new Map(
    releases.map(release => {
      const sourceShard = sourceShards.get(release.releaseId)

      return [
        release.releaseId,
        {
          binding: sourceShard
            ? resolveD1Binding(bindings, sourceShard.bindingName)
            : undefined,
          kind: 'source',
          releaseId: release.releaseId,
          specs: resolveSourceCountSpecs(release),
        } satisfies CountTarget,
      ]
    }),
  )
}

async function resolveFallbackShardsByRelease(
  db: HarbourReadableDb,
  kind: 'history' | 'source',
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const uniqueShardKeys = new Map<string, { regionCode: string; year: string }>()

  for (const release of releases) {
    const year = resolveReleaseYear(release)

    if (!year) {
      continue
    }

    const key = `${release.regionCode}:${year}`

    if (!uniqueShardKeys.has(key)) {
      uniqueShardKeys.set(key, {
        regionCode: release.regionCode,
        year,
      })
    }
  }

  const resolvedShards = await Promise.all(
    [...uniqueShardKeys.entries()].map(async ([key, value]) => [
      key,
      await resolveShardForKindRegionYear(
        db,
        kind,
        environment,
        value.regionCode,
        value.year,
      ),
    ]),
  )
  const shardsByKey = new Map(resolvedShards)

  return new Map(
    releases.map(release => {
      const year = resolveReleaseYear(release)
      const shard = !year
        ? null
        : (shardsByKey.get(`${release.regionCode}:${year}`) ?? null)

      return [release.releaseId, shard]
    }),
  )
}

async function collectCountRowsByRelease(plans: ReleaseCountPlan[]) {
  const countTargets = plans.flatMap(plan =>
    [plan.source, plan.history].filter(Boolean),
  )
  const queryGroups = new Map<D1Database, Map<string, CountQueryGroup>>()

  for (const target of countTargets) {
    if (!target?.binding || target.specs.length === 0) {
      continue
    }

    let bindingGroups = queryGroups.get(target.binding)

    if (!bindingGroups) {
      bindingGroups = new Map()
      queryGroups.set(target.binding, bindingGroups)
    }

    for (const spec of target.specs) {
      const key = buildCountSpecKey(spec)
      const existingGroup = bindingGroups.get(key)

      if (existingGroup) {
        existingGroup.releaseIds.add(target.releaseId)
        continue
      }

      bindingGroups.set(key, {
        kind: target.kind,
        releaseIds: new Set([target.releaseId]),
        spec,
      })
    }
  }

  const countsByReleaseSpec = new Map<string, number>()

  for (const [binding, bindingGroups] of queryGroups) {
    for (const group of bindingGroups.values()) {
      const counts = await countReleaseRowsByReleaseIds(binding, group.spec, [
        ...group.releaseIds,
      ])

      for (const [releaseId, count] of counts) {
        countsByReleaseSpec.set(
          buildReleaseSpecKey(releaseId, group.kind, group.spec),
          count,
        )
      }
    }
  }

  return countsByReleaseSpec
}

type CountQueryGroup = {
  kind: 'history' | 'source'
  releaseIds: Set<string>
  spec: CountSpec
}

function buildReportRowCounts(
  target: CountTarget | null,
  countsByReleaseSpec: Map<string, number>,
) {
  if (!target?.binding || target.specs.length === 0) {
    return []
  }

  return target.specs.map(spec => ({
    kind: target.kind,
    label: spec.label,
    rowCount:
      countsByReleaseSpec.get(
        buildReleaseSpecKey(target.releaseId, target.kind, spec),
      ) ?? 0,
    tableName: spec.tableName,
  }))
}

async function countReleaseRowsByReleaseIds(
  binding: D1Database,
  spec: CountSpec,
  releaseIds: string[],
) {
  if (releaseIds.length === 0) {
    return new Map<string, number>()
  }

  const placeholders = releaseIds.map((_, index) => `?${index + 1}`).join(', ')
  const query =
    spec.strategy === 'direct'
      ? `SELECT "releaseId" AS releaseId, COUNT(*) AS count
         FROM "${spec.tableName}"
         WHERE "releaseId" IN (${placeholders})
         GROUP BY "releaseId"`
      : `SELECT parent."releaseId" AS releaseId, COUNT(*) AS count
         FROM "${spec.tableName}" child
         INNER JOIN "${spec.parentTableName}" parent
           ON parent."${spec.parentKey}" = child."${spec.relationshipKey}"
         WHERE parent."releaseId" IN (${placeholders})
         GROUP BY parent."releaseId"`
  const result = await binding
    .prepare(query)
    .bind(...releaseIds)
    .all<{
      count: number | string
      releaseId: string
    }>()
  const rows = normalizeCountRows(result)

  return new Map(
    releaseIds.map(releaseId => {
      const row = rows.find(candidate => candidate.releaseId === releaseId)
      return [releaseId, Number(row?.count ?? 0)]
    }),
  )
}

function normalizeCountRows(
  result:
    | Array<{
        count: number | string
        releaseId: string
      }>
    | {
        results?: Array<{
          count: number | string
          releaseId: string
        }> | null
      },
) {
  return Array.isArray(result) ? result : (result.results ?? [])
}

function buildCountSpecKey(spec: CountSpec) {
  return spec.strategy === 'direct'
    ? `${spec.label}:${spec.strategy}:${spec.tableName}`
    : [
        spec.label,
        spec.strategy,
        spec.tableName,
        spec.parentTableName,
        spec.parentKey,
        spec.relationshipKey,
      ].join(':')
}

function buildReleaseSpecKey(
  releaseId: string,
  kind: 'history' | 'source',
  spec: CountSpec,
) {
  return `${releaseId}:${kind}:${buildCountSpecKey(spec)}`
}

function resolveSourceCountSpecs(release: ReleaseContext): CountSpec[] {
  const sourceFamily = resolveSourceFamily(release)

  switch (sourceFamily) {
    case 'hkgov-als':
      return [
        {
          label: 'source',
          strategy: 'direct',
          tableName: 'sourceHkgovAlsAddresses2d',
        },
        {
          label: 'sourceI18n',
          parentKey: 'sourceRecordId',
          parentTableName: 'sourceHkgovAlsAddresses2d',
          relationshipKey: 'sourceRecordId',
          strategy: 'join',
          tableName: 'sourceHkgovAlsAddress2dI18n',
        },
        {
          label: 'sourceVersions',
          strategy: 'direct',
          tableName: 'sourceHkgovAlsAddresses2dVersions',
        },
        {
          label: 'sourceI18nVersions',
          strategy: 'direct',
          tableName: 'sourceHkgovAlsAddress2dI18nVersions',
        },
      ]
    case 'overture':
      switch (release.type) {
        case 'address':
          return [
            {
              label: 'source',
              strategy: 'direct',
              tableName: 'sourceOvertureAddresses2d',
            },
            {
              label: 'sourceI18n',
              parentKey: 'sourceRecordId',
              parentTableName: 'sourceOvertureAddresses2d',
              relationshipKey: 'sourceRecordId',
              strategy: 'join',
              tableName: 'sourceOvertureAddress2dI18n',
            },
            {
              label: 'sourceVersions',
              strategy: 'direct',
              tableName: 'sourceOvertureAddresses2dVersions',
            },
            {
              label: 'sourceI18nVersions',
              strategy: 'direct',
              tableName: 'sourceOvertureAddress2dI18nVersions',
            },
          ]
        case 'division':
          return [
            {
              label: 'source',
              strategy: 'direct',
              tableName: 'sourceOvertureDivisions',
            },
            {
              label: 'sourceI18n',
              parentKey: 'sourceRecordId',
              parentTableName: 'sourceOvertureDivisions',
              relationshipKey: 'sourceRecordId',
              strategy: 'join',
              tableName: 'sourceOvertureDivisionI18n',
            },
            {
              label: 'sourceVersions',
              strategy: 'direct',
              tableName: 'sourceOvertureDivisionsVersions',
            },
            {
              label: 'sourceI18nVersions',
              strategy: 'direct',
              tableName: 'sourceOvertureDivisionI18nVersions',
            },
          ]
        case 'place':
          return [
            {
              label: 'source',
              strategy: 'direct',
              tableName: 'sourceOverturePlaces',
            },
            {
              label: 'sourceI18n',
              parentKey: 'sourceRecordId',
              parentTableName: 'sourceOverturePlaces',
              relationshipKey: 'sourceRecordId',
              strategy: 'join',
              tableName: 'sourceOverturePlaceI18n',
            },
            {
              label: 'sourceVersions',
              strategy: 'direct',
              tableName: 'sourceOverturePlacesVersions',
            },
            {
              label: 'sourceI18nVersions',
              strategy: 'direct',
              tableName: 'sourceOverturePlaceI18nVersions',
            },
          ]
        default:
          return []
      }
    default:
      return []
  }
}

function resolveHistoryCountSpecs(type: string): CountSpec[] {
  switch (type) {
    case 'address':
      return [
        {
          label: 'history2dVersions',
          strategy: 'direct',
          tableName: 'address2dVersions',
        },
        {
          label: 'history2dI18nVersions',
          strategy: 'direct',
          tableName: 'address2dVersionsI18n',
        },
        {
          label: 'history3dVersions',
          strategy: 'direct',
          tableName: 'address3dVersions',
        },
        {
          label: 'history3dI18nVersions',
          strategy: 'direct',
          tableName: 'address3dVersionsI18n',
        },
      ]
    case 'division':
      return [
        {
          label: 'historyVersions',
          strategy: 'direct',
          tableName: 'divisionsVersions',
        },
        {
          label: 'historyI18nVersions',
          strategy: 'direct',
          tableName: 'divisionsVersionsI18n',
        },
      ]
    case 'place':
      return [
        {
          label: 'historyVersions',
          strategy: 'direct',
          tableName: 'placesVersions',
        },
        {
          label: 'historyI18nVersions',
          strategy: 'direct',
          tableName: 'placesVersionsI18n',
        },
      ]
    case 'street':
      return [
        {
          label: 'historyVersions',
          strategy: 'direct',
          tableName: 'streetsVersions',
        },
        {
          label: 'historyI18nVersions',
          strategy: 'direct',
          tableName: 'streetsVersionsI18n',
        },
      ]
    default:
      return []
  }
}

function resolveSourceFamily(release: ReleaseContext) {
  const normalizedSource = release.source.trim().toLowerCase()
  const normalizedSourceUrl = release.sourceUrl.trim().toLowerCase()

  if (normalizedSource === 'overture') {
    return 'overture'
  }

  if (normalizedSource === 'hkgov' && normalizedSourceUrl.includes('als')) {
    return 'hkgov-als'
  }

  return normalizedSource
}

function resolveReleaseYear(release: ReleaseContext) {
  const sourceYear = release.sourceVersion.slice(0, 4)

  if (/^\d{4}$/.test(sourceYear)) {
    return sourceYear
  }

  const snapshotYear = release.snapshotMonth?.slice(0, 4)
  return snapshotYear && /^\d{4}$/.test(snapshotYear) ? snapshotYear : null
}

function normalizeJsonField(value: unknown) {
  if (typeof value !== 'string') {
    return value ?? null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function resolveD1Binding(bindings: ReportBindings, bindingName: string) {
  const binding = bindings[bindingName]

  return binding &&
    typeof binding === 'object' &&
    'prepare' in binding &&
    typeof binding.prepare === 'function'
    ? (binding as D1Database)
    : undefined
}

function toIsoString(value: Date | number | string | null | undefined) {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString()
  }

  return value
}
