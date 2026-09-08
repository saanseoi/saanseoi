import { and, desc, eq, metaSnapshots, metaSnapshotSources } from '@repo/db'
import { inArray, sql } from 'drizzle-orm'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'
import {
  buildReleaseCountPlans,
  buildReportFilterWhereClause,
  buildReportRowCounts,
  collectCountRowsByRelease,
  ingestRuns,
  metaDatasets,
  metaPublishers,
  metaReleases,
  normaliseJsonField,
  releaseProcessingActions,
  stats,
  toIsoString,
  type ReleaseContext,
  type ReportBindings,
  type ReportFilters,
  type ReportRowCount,
} from './reportingRows.ts'
import type {
  IngestRunReportRow,
  ListStatsOptions,
  ProcessingActionReportRow,
  ReleaseQueryRow,
  ReleaseReportRow,
  StatQueryRow,
  StatReportRow,
} from './reportingTypes.ts'

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
      cohortKey: metaReleases.cohortKey,
      source: metaPublishers.code,
      startedAt: ingestRuns.startedAt,
      stats: ingestRuns.stats,
      status: ingestRuns.status,
      type: metaReleases.resourceType,
    })
    .from(ingestRuns)
    .innerJoin(metaReleases, eq(ingestRuns.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(ingestRuns.startedAt), desc(ingestRuns.createdAt))
  const releaseIds = await listLatestIngestRunReleaseIds(db, {
    datasetCode: options.datasetCode,
    limit: options.limit ?? 10,
    source: options.source,
    type: options.type,
  })

  if (releaseIds.length === 0) {
    return []
  }

  const whereClause = buildReportFilterWhereClause(options)
  const releaseIdBatches = chunkArray(
    releaseIds,
    getMaxItemsPerInClause(1, countReportFilterVariables(options)),
  )
  const rows = (
    await Promise.all(
      releaseIdBatches.map(releaseIdBatch =>
        whereClause
          ? query
              .where(and(whereClause, inArray(metaReleases.id, releaseIdBatch)))
              .all()
          : query.where(inArray(metaReleases.id, releaseIdBatch)).all(),
      ),
    )
  ).flat() as IngestRunReportRow[]

  return rows.map(row => ({
    ...row,
    error: normaliseJsonField(row.error),
    stats: normaliseJsonField(row.stats),
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
      type: metaReleases.resourceType,
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
    .all()) as StatQueryRow[]

  return rows.map(row => ({
    ...row,
    createdAt: toIsoString(row.createdAt) ?? '',
    updatedAt: toIsoString(row.updatedAt) ?? '',
  }))
}

export async function listProcessingActions(
  db: HarbourReadableDb,
  options: ReportFilters,
): Promise<ProcessingActionReportRow[]> {
  const query = db
    .select({
      ...auditSummarySelection,
      datasetCode: metaDatasets.code,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      source: metaPublishers.code,
      type: metaReleases.resourceType,
      updatedAt: releaseProcessingActions.updatedAt,
    })
    .from(releaseProcessingActions)
    .innerJoin(metaReleases, eq(releaseProcessingActions.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(
      desc(releaseProcessingActions.createdAt),
      desc(releaseProcessingActions.id),
    )
  const releaseIds = options.releaseId
    ? [options.releaseId]
    : await listLatestStatsReleaseIds(db, {
        limit: options.limit ?? 1,
        source: options.source,
        type: options.type,
      })

  if (releaseIds.length === 0) return []

  const whereClause = buildReportFilterWhereClause(options)
  const releaseIdBatches = chunkArray(
    releaseIds,
    getMaxItemsPerInClause(1, countReportFilterVariables(options)),
  )
  const rows = (
    await Promise.all(
      releaseIdBatches.map(releaseIdBatch =>
        whereClause
          ? query
              .where(and(whereClause, inArray(metaReleases.id, releaseIdBatch)))
              .all()
          : query.where(inArray(metaReleases.id, releaseIdBatch)).all(),
      ),
    )
  ).flat()

  return (await readAuditPages(db, rows)).map(row => ({
    ...row,
    createdAt: toIsoString(row.createdAt) ?? '',
    evidence: normaliseJsonField(row.evidence),
    mode: row.mode === 'manual' ? 'manual' : 'automatic',
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
      notes: metaReleases.notes,
      originalFileName: metaReleases.originalFileName,
      publicationDate: metaReleases.publicationDate,
      rawObjectKey: metaReleases.rawObjectKey,
      hasStatisticsSnapshot: sql<boolean>`EXISTS (
        SELECT 1 FROM ${metaSnapshotSources}
        JOIN ${metaSnapshots} ON ${metaSnapshots.id} = ${metaSnapshotSources.snapshotId}
        WHERE ${metaSnapshotSources.resourceReleaseId} = ${metaReleases.id}
          AND ${metaSnapshotSources.role} <> 'lookup'
          AND ${metaSnapshots.resourceType} = 'divisionStatistic'
          AND ${metaSnapshots.status} IN ('draft', 'published')
      )`.mapWith(Boolean),
      regionCode: metaDatasets.regionCode,
      releaseCode: metaReleases.code,
      releaseId: metaReleases.id,
      revocationReason: metaReleases.revocationReason,
      revokedAt: metaReleases.revokedAt,
      cohortKey: metaReleases.cohortKey,
      source: metaPublishers.code,
      sourceUrl: metaDatasets.sourceUrl,
      sourceVersion: metaReleases.sourceVersion,
      status: metaReleases.status,
      supersededByReleaseId: metaReleases.supersededByReleaseId,
      type: metaReleases.resourceType,
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
    notes: row.notes,
    originalFileName: row.originalFileName,
    publicationDate: row.publicationDate,
    rawObjectKey: row.rawObjectKey,
    releaseCode: row.releaseCode,
    releaseId: row.releaseId,
    revocationReason: row.revocationReason,
    revokedAt: toIsoString(row.revokedAt),
    rowCounts: rowCountsByReleaseId.get(row.releaseId) ?? [],
    hasStatisticsSnapshot: row.hasStatisticsSnapshot,
    cohortKey: row.cohortKey,
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
  const latestCreatedAt = sql<string>`max(${ingestRuns.createdAt})`
  const query = db
    .select({
      releaseId: metaReleases.id,
    })
    .from(metaReleases)
    .innerJoin(ingestRuns, eq(ingestRuns.releaseId, metaReleases.id))
    .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(metaReleases.id, metaReleases.ingestedAt, metaReleases.createdAt)
    .orderBy(
      desc(metaReleases.ingestedAt),
      desc(latestStartedAt),
      desc(latestCreatedAt),
      desc(metaReleases.createdAt),
    )
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

function countReportFilterVariables(options: ReportFilters) {
  return [
    options.datasetCode,
    options.releaseCode,
    options.releaseId,
    options.source,
    options.type,
  ].filter(value => value !== undefined).length
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
  const latestCreatedAt = sql<string>`max(${stats.createdAt})`
  const latestUpdatedAt = sql<string>`max(${stats.updatedAt})`
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

export type {
  ReportBindings,
  ReportRowCount,
  ReportFilters,
} from './reportingRows.ts'

export type {
  IngestRunReportRow,
  StatReportRow,
  ProcessingActionReportRow,
  ListStatsOptions,
  ReleaseReportRow,
} from './reportingTypes.ts'
import {
  auditSummarySelection,
  readAuditPages,
} from '@repo/core/pipeline/db/processingActionStorage'
