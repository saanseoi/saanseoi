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
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause ? await query.where(whereClause).all() : await query.all()
  ) as IngestRunReportRow[]
  const selectedReleaseIds = new Set<string>()
  const releaseLimit = options.limit ?? 10

  for (const row of rows) {
    selectedReleaseIds.add(row.releaseId)

    if (selectedReleaseIds.size >= releaseLimit) {
      break
    }
  }

  return rows
    .filter(row => selectedReleaseIds.has(row.releaseId))
    .map(row => ({
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

  return Promise.all(
    rows.map(async row => ({
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
      rowCounts: await listReleaseRowCounts(db, bindings, environment, row),
      snapshotMonth: row.snapshotMonth,
      source: row.source,
      sourceVersion: row.sourceVersion,
      status: row.status,
      supersededByReleaseId: row.supersededByReleaseId,
      type: row.type,
      updatedAt: toIsoString(row.updatedAt) ?? '',
    })),
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

async function listReleaseRowCounts(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  release: ReleaseContext,
): Promise<ReportRowCount[]> {
  const [historyCounts, sourceCounts] = await Promise.all([
    listHistoryRowCounts(db, bindings, environment, release),
    listSourceRowCounts(db, bindings, environment, release),
  ])

  return [...sourceCounts, ...historyCounts]
}

async function listHistoryRowCounts(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  release: ReleaseContext,
) {
  const year = resolveReleaseYear(release)
  const assignedHistoryBinding = await db
    .select({
      bindingName: metaDataShards.bindingName,
    })
    .from(metaReleaseShardAssignments)
    .innerJoin(
      metaDataShards,
      eq(metaReleaseShardAssignments.dataShardId, metaDataShards.id),
    )
    .where(
      and(
        eq(metaReleaseShardAssignments.releaseId, release.releaseId),
        eq(metaDataShards.kind, 'history'),
        eq(metaDataShards.environment, environment),
        eq(metaDataShards.status, 'active'),
      ),
    )
    .limit(1)
    .all()
  const fallbackHistoryShard =
    assignedHistoryBinding[0] ??
    (year
      ? await resolveShardForKindRegionYear(
          db,
          'history',
          environment,
          release.regionCode,
          year,
        )
      : null)

  if (!fallbackHistoryShard) {
    return []
  }

  const historyBinding = resolveD1Binding(bindings, fallbackHistoryShard.bindingName)
  const historyCountSpecs = resolveHistoryCountSpecs(release.type)

  return collectCountRows(
    historyBinding,
    historyCountSpecs,
    release.releaseId,
    'history',
  )
}

async function listSourceRowCounts(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  release: ReleaseContext,
) {
  const year = resolveReleaseYear(release)

  if (!year) {
    return []
  }

  const sourceShard = await resolveShardForKindRegionYear(
    db,
    'source',
    environment,
    release.regionCode,
    year,
  )

  if (!sourceShard) {
    return []
  }

  const sourceBinding = resolveD1Binding(bindings, sourceShard.bindingName)
  const sourceCountSpecs = resolveSourceCountSpecs(release)

  return collectCountRows(sourceBinding, sourceCountSpecs, release.releaseId, 'source')
}

async function collectCountRows(
  binding: D1Database | undefined,
  specs: CountSpec[],
  releaseId: string,
  kind: 'history' | 'source',
): Promise<ReportRowCount[]> {
  if (!binding || specs.length === 0) {
    return []
  }

  return Promise.all(
    specs.map(async spec => ({
      kind,
      label: spec.label,
      rowCount: await countReleaseRows(binding, spec, releaseId),
      tableName: spec.tableName,
    })),
  )
}

async function countReleaseRows(
  binding: D1Database,
  spec: CountSpec,
  releaseId: string,
) {
  const query =
    spec.strategy === 'direct'
      ? `SELECT COUNT(*) AS count FROM "${spec.tableName}" WHERE "releaseId" = ?1`
      : `SELECT COUNT(*) AS count
         FROM "${spec.tableName}" child
         INNER JOIN "${spec.parentTableName}" parent
           ON parent."${spec.parentKey}" = child."${spec.relationshipKey}"
         WHERE parent."releaseId" = ?1`

  const row = await binding
    .prepare(query)
    .bind(releaseId)
    .first<{ count: number | string }>()
  return Number(row?.count ?? 0)
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
