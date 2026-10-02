import { and, desc, eq, metaSnapshots, metaSnapshotResourceReleases } from '@repo/db'
import { inArray, sql } from 'drizzle-orm'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'
import {
  buildReleaseCountPlans,
  buildReportFilterWhereClause,
  buildReportRowCounts,
  collectCountRowsByRelease,
  processingRuns,
  metaDatasets,
  metaPublishers,
  metaResourceReleases,
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
  ProcessingRunReportRow,
  ListStatsOptions,
  ProcessingActionReportRow,
  ReleaseQueryRow,
  ReleaseReportRow,
  StatQueryRow,
  StatReportRow,
} from './reportingTypes.ts'

export async function listProcessingRuns(
  db: HarbourReadableDb,
  options: ReportFilters,
): Promise<ProcessingRunReportRow[]> {
  const query = db
    .select({
      datasetCode: metaDatasets.code,
      error: processingRuns.error,
      finishedAt: processingRuns.finishedAt,
      phase: processingRuns.phase,
      releaseCode: metaResourceReleases.code,
      resourceReleaseId: metaResourceReleases.id,
      runId: processingRuns.runId,
      cohortKey: metaResourceReleases.cohortKey,
      source: metaPublishers.code,
      startedAt: processingRuns.startedAt,
      results: processingRuns.results,
      status: processingRuns.status,
      resourceType: metaResourceReleases.resourceType,
    })
    .from(processingRuns)
    .innerJoin(
      metaResourceReleases,
      eq(processingRuns.resourceReleaseId, metaResourceReleases.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(processingRuns.startedAt), desc(processingRuns.createdAt))
  const releaseIds = await listLatestProcessingRunReleaseIds(db, {
    datasetCode: options.datasetCode,
    limit: options.limit ?? 10,
    source: options.source,
    resourceType: options.resourceType,
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
              .where(and(whereClause, inArray(metaResourceReleases.id, releaseIdBatch)))
              .all()
          : query.where(inArray(metaResourceReleases.id, releaseIdBatch)).all(),
      ),
    )
  ).flat() as ProcessingRunReportRow[]

  return rows.map(row => ({
    ...row,
    error: normaliseJsonField(row.error),
    results: normaliseJsonField(row.results),
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
      category: stats.category,
      dimension: stats.dimension,
      dimensionValue: stats.dimensionValue,
      id: stats.id,
      measure: stats.measure,
      unit: stats.unit,
      releaseCode: metaResourceReleases.code,
      resourceReleaseId: metaResourceReleases.id,
      source: metaPublishers.code,
      resourceType: metaResourceReleases.resourceType,
      updatedAt: stats.updatedAt,
      value: stats.value,
    })
    .from(stats)
    .innerJoin(
      metaResourceReleases,
      eq(stats.resourceReleaseId, metaResourceReleases.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(desc(stats.createdAt), desc(stats.updatedAt))

  const releaseIds = options.resourceReleaseId
    ? [options.resourceReleaseId]
    : await listLatestStatsReleaseIds(db, {
        limit: options.limit ?? 1,
        source: options.source,
        resourceType: options.resourceType,
      })

  if (releaseIds.length === 0) {
    return []
  }

  const rows = (await query
    .where(inArray(stats.resourceReleaseId, releaseIds))
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
      releaseCode: metaResourceReleases.code,
      resourceReleaseId: metaResourceReleases.id,
      source: metaPublishers.code,
      resourceType: metaResourceReleases.resourceType,
      updatedAt: releaseProcessingActions.updatedAt,
    })
    .from(releaseProcessingActions)
    .innerJoin(
      metaResourceReleases,
      eq(releaseProcessingActions.resourceReleaseId, metaResourceReleases.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(
      desc(releaseProcessingActions.createdAt),
      desc(releaseProcessingActions.id),
    )
  const releaseIds = options.resourceReleaseId
    ? [options.resourceReleaseId]
    : await listLatestStatsReleaseIds(db, {
        limit: options.limit ?? 1,
        source: options.source,
        resourceType: options.resourceType,
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
              .where(and(whereClause, inArray(metaResourceReleases.id, releaseIdBatch)))
              .all()
          : query.where(inArray(metaResourceReleases.id, releaseIdBatch)).all(),
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
      createdAt: metaResourceReleases.createdAt,
      datasetCode: metaDatasets.code,
      datasetId: metaDatasets.id,
      ingestedAt: metaResourceReleases.ingestedAt,
      notes: metaResourceReleases.notes,
      originalFileName: metaResourceReleases.originalFileName,
      publicationDate: metaResourceReleases.publicationDate,
      rawObjectKey: metaResourceReleases.rawObjectKey,
      hasStatisticsSnapshot: sql<boolean>`EXISTS (
        SELECT 1 FROM ${metaSnapshotResourceReleases}
        JOIN ${metaSnapshots} ON ${metaSnapshots.id} = ${metaSnapshotResourceReleases.snapshotId}
        WHERE ${metaSnapshotResourceReleases.resourceReleaseId} = ${metaResourceReleases.id}
          AND ${metaSnapshotResourceReleases.role} <> 'lookup'
          AND ${metaSnapshots.resourceType} = 'divisionStatistic'
          AND ${metaSnapshots.status} IN ('draft', 'published')
      )`.mapWith(Boolean),
      regionCode: metaDatasets.regionCode,
      releaseCode: metaResourceReleases.code,
      resourceReleaseId: metaResourceReleases.id,
      revocationReason: metaResourceReleases.revocationReason,
      revokedAt: metaResourceReleases.revokedAt,
      cohortKey: metaResourceReleases.cohortKey,
      source: metaPublishers.code,
      sourceUrl: metaDatasets.sourceUrl,
      sourceVersion: metaResourceReleases.sourceVersion,
      status: metaResourceReleases.status,
      supersededByResourceReleaseId: metaResourceReleases.supersededByResourceReleaseId,
      resourceType: metaResourceReleases.resourceType,
      updatedAt: metaResourceReleases.updatedAt,
    })
    .from(metaResourceReleases)
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(
      desc(metaResourceReleases.ingestedAt),
      desc(metaResourceReleases.createdAt),
    )
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
    resourceReleaseId: row.resourceReleaseId,
    revocationReason: row.revocationReason,
    revokedAt: toIsoString(row.revokedAt),
    rowCounts: rowCountsByReleaseId.get(row.resourceReleaseId) ?? [],
    hasStatisticsSnapshot: row.hasStatisticsSnapshot,
    cohortKey: row.cohortKey,
    source: row.source,
    sourceVersion: row.sourceVersion,
    status: row.status,
    supersededByResourceReleaseId: row.supersededByResourceReleaseId,
    resourceType: row.resourceType,
    updatedAt: toIsoString(row.updatedAt) ?? '',
  }))
}

async function listLatestProcessingRunReleaseIds(
  db: HarbourReadableDb,
  options: ReportFilters,
) {
  const latestStartedAt = sql<string>`max(${processingRuns.startedAt})`
  const latestCreatedAt = sql<string>`max(${processingRuns.createdAt})`
  const query = db
    .select({
      resourceReleaseId: metaResourceReleases.id,
    })
    .from(metaResourceReleases)
    .innerJoin(
      processingRuns,
      eq(processingRuns.resourceReleaseId, metaResourceReleases.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(
      metaResourceReleases.id,
      metaResourceReleases.ingestedAt,
      metaResourceReleases.createdAt,
    )
    .orderBy(
      desc(metaResourceReleases.ingestedAt),
      desc(latestStartedAt),
      desc(latestCreatedAt),
      desc(metaResourceReleases.createdAt),
    )
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(whereClause)
          .limit(options.limit ?? 10)
          .all()
      : await query.limit(options.limit ?? 10).all()
  ) as Array<{ resourceReleaseId: string }>

  return rows.map(row => row.resourceReleaseId)
}

function countReportFilterVariables(options: ReportFilters) {
  return [
    options.datasetCode,
    options.releaseCode,
    options.resourceReleaseId,
    options.source,
    options.resourceType,
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
      plan.resourceReleaseId,
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
      resourceReleaseId: metaResourceReleases.id,
      updatedAt: latestUpdatedAt,
    })
    .from(stats)
    .innerJoin(
      metaResourceReleases,
      eq(stats.resourceReleaseId, metaResourceReleases.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleases.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(
      metaResourceReleases.id,
      metaResourceReleases.ingestedAt,
      metaResourceReleases.createdAt,
    )
    .orderBy(
      desc(metaResourceReleases.ingestedAt),
      desc(latestCreatedAt),
      desc(latestUpdatedAt),
      desc(metaResourceReleases.createdAt),
    )
  const whereClause = buildReportFilterWhereClause(options)
  const rows = (
    whereClause
      ? await query
          .where(whereClause)
          .limit(options.limit ?? 1)
          .all()
      : await query.limit(options.limit ?? 1).all()
  ) as Array<{ resourceReleaseId: string }>

  return rows.map(row => row.resourceReleaseId)
}

export type {
  ReportBindings,
  ReportRowCount,
  ReportFilters,
} from './reportingRows.ts'

export type {
  ProcessingRunReportRow,
  StatReportRow,
  ProcessingActionReportRow,
  ListStatsOptions,
  ReleaseReportRow,
} from './reportingTypes.ts'
import {
  auditSummarySelection,
  readAuditPages,
} from '@repo/core/pipeline/db/processingActionStorage'
