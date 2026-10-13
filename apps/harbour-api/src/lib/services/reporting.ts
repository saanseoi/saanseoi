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
  metaResourceReleaseDetails,
  normaliseJsonField,
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
      releaseCode: metaResourceReleaseDetails.code,
      resourceReleaseId: metaResourceReleaseDetails.id,
      runId: processingRuns.runId,
      cohortKey: metaResourceReleaseDetails.cohortKey,
      source: metaPublishers.code,
      startedAt: processingRuns.startedAt,
      results: processingRuns.results,
      status: processingRuns.status,
      resourceType: metaResourceReleaseDetails.resourceType,
    })
    .from(processingRuns)
    .innerJoin(
      metaResourceReleaseDetails,
      eq(processingRuns.resourceReleaseId, metaResourceReleaseDetails.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleaseDetails.datasetId, metaDatasets.id))
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
              .where(
                and(
                  whereClause,
                  inArray(metaResourceReleaseDetails.id, releaseIdBatch),
                ),
              )
              .all()
          : query.where(inArray(metaResourceReleaseDetails.id, releaseIdBatch)).all(),
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
      releaseCode: metaResourceReleaseDetails.code,
      resourceReleaseId: metaResourceReleaseDetails.id,
      source: metaPublishers.code,
      resourceType: metaResourceReleaseDetails.resourceType,
      updatedAt: stats.updatedAt,
      value: stats.value,
    })
    .from(stats)
    .innerJoin(
      metaResourceReleaseDetails,
      eq(stats.resourceReleaseId, metaResourceReleaseDetails.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleaseDetails.datasetId, metaDatasets.id))
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

export async function listReleases(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  options: ReportFilters,
): Promise<ReleaseReportRow[]> {
  const query = db
    .select({
      createdAt: metaResourceReleaseDetails.createdAt,
      datasetCode: metaDatasets.code,
      datasetId: metaDatasets.id,
      ingestedAt: metaResourceReleaseDetails.ingestedAt,
      publicationDate: metaResourceReleaseDetails.publicationDate,
      hasStatisticsSnapshot: sql<boolean>`EXISTS (
        SELECT 1 FROM ${metaSnapshotResourceReleases}
        JOIN ${metaSnapshots} ON ${metaSnapshots.id} = ${metaSnapshotResourceReleases.snapshotId}
        WHERE ${metaSnapshotResourceReleases.resourceReleaseId} = ${metaResourceReleaseDetails.id}
          AND ${metaSnapshotResourceReleases.role} <> 'lookup'
          AND ${metaSnapshots.resourceType} = 'divisionStatistic'
          AND ${metaSnapshots.status} IN ('draft', 'published')
      )`.mapWith(Boolean),
      regionCode: metaDatasets.regionCode,
      releaseCode: metaResourceReleaseDetails.code,
      resourceReleaseId: metaResourceReleaseDetails.id,
      revocationReason: metaResourceReleaseDetails.revocationReason,
      revokedAt: metaResourceReleaseDetails.revokedAt,
      cohortKey: metaResourceReleaseDetails.cohortKey,
      source: metaPublishers.code,
      sourceUrl: metaDatasets.sourceUrl,
      sourceVersion: metaResourceReleaseDetails.sourceVersion,
      status: metaResourceReleaseDetails.status,
      supersededByResourceReleaseId:
        metaResourceReleaseDetails.supersededByResourceReleaseId,
      resourceType: metaResourceReleaseDetails.resourceType,
      updatedAt: metaResourceReleaseDetails.updatedAt,
    })
    .from(metaResourceReleaseDetails)
    .innerJoin(metaDatasets, eq(metaResourceReleaseDetails.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .orderBy(
      desc(metaResourceReleaseDetails.ingestedAt),
      desc(metaResourceReleaseDetails.createdAt),
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
    publicationDate: row.publicationDate,
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
      resourceReleaseId: metaResourceReleaseDetails.id,
    })
    .from(metaResourceReleaseDetails)
    .innerJoin(
      processingRuns,
      eq(processingRuns.resourceReleaseId, metaResourceReleaseDetails.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleaseDetails.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(
      metaResourceReleaseDetails.id,
      metaResourceReleaseDetails.ingestedAt,
      metaResourceReleaseDetails.createdAt,
    )
    .orderBy(
      desc(metaResourceReleaseDetails.ingestedAt),
      desc(latestStartedAt),
      desc(latestCreatedAt),
      desc(metaResourceReleaseDetails.createdAt),
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
      resourceReleaseId: metaResourceReleaseDetails.id,
      updatedAt: latestUpdatedAt,
    })
    .from(stats)
    .innerJoin(
      metaResourceReleaseDetails,
      eq(stats.resourceReleaseId, metaResourceReleaseDetails.id),
    )
    .innerJoin(metaDatasets, eq(metaResourceReleaseDetails.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .groupBy(
      metaResourceReleaseDetails.id,
      metaResourceReleaseDetails.ingestedAt,
      metaResourceReleaseDetails.createdAt,
    )
    .orderBy(
      desc(metaResourceReleaseDetails.ingestedAt),
      desc(latestCreatedAt),
      desc(latestUpdatedAt),
      desc(metaResourceReleaseDetails.createdAt),
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
  ListStatsOptions,
  ReleaseReportRow,
} from './reportingTypes.ts'
