import { and, desc, eq, ne } from 'drizzle-orm'

import { datasets, ingestRuns } from '@repo/db/schema'

import type { DatasetRecord, RegionCode, SupportedType, UploadPlan } from '../../types'

export type HarbourReadableDb = {
  select: (...args: any[]) => any
}

export type HarbourWritableDb = {
  delete: (...args: any[]) => any
  insert: (...args: any[]) => any
  update: (...args: any[]) => any
}

type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
  supersedesDatasetId: string | null
}

/**
 * Returns the most recent non-failed dataset for a region/source/type tuple and
 * the current dataset id that a new upload should supersede, if any.
 */
export async function getLatestDatasetForRegionSourceType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  source: string,
  type: SupportedType,
): Promise<LatestDatasetLookup> {
  const latestDataset =
    ((await db
      .select()
      .from(datasets)
      .where(
        and(
          eq(datasets.regionCode, regionCode),
          eq(datasets.source, source),
          eq(datasets.type, type),
          ne(datasets.status, 'failed'),
          ne(datasets.status, 'uploading'),
        ),
      )
      .orderBy(desc(datasets.sourceVersion), desc(datasets.ingestedAt))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  const currentDataset =
    ((await db
      .select({
        datasetId: datasets.datasetId,
      })
      .from(datasets)
      .where(
        and(
          eq(datasets.regionCode, regionCode),
          eq(datasets.source, source),
          eq(datasets.type, type),
          eq(datasets.status, 'current'),
        ),
      )
      .limit(1)
      .get()) as { datasetId: string } | undefined) ?? null

  if (!latestDataset) {
    return {
      latestDataset: null,
      supersedesDatasetId: null,
    }
  }

  return {
    latestDataset,
    supersedesDatasetId: currentDataset?.datasetId ?? null,
  }
}

export async function hasDatasetForSnapshotMonthSourceType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  snapshotMonth: string,
  source: string,
  type: SupportedType,
) {
  const existing =
    ((await db
      .select({
        datasetId: datasets.datasetId,
      })
      .from(datasets)
      .where(
        and(
          eq(datasets.regionCode, regionCode),
          eq(datasets.snapshotMonth, snapshotMonth),
          eq(datasets.source, source),
          eq(datasets.type, type),
          ne(datasets.status, 'failed'),
          ne(datasets.status, 'uploading'),
        ),
      )
      .limit(1)
      .get()) as { datasetId: string } | undefined) ?? null

  return existing
}

/**
 * Looks up a dataset by id so the service can reject duplicate registrations
 * before staging files and writing ingest metadata.
 */
export async function getDatasetById(db: HarbourReadableDb, datasetId: string) {
  return (
    (await db
      .select({
        id: datasets.id,
        datasetId: datasets.datasetId,
        status: datasets.status,
      })
      .from(datasets)
      .where(eq(datasets.datasetId, datasetId))
      .limit(1)
      .get()) ?? null
  )
}

export async function getDatasetRecordById(db: HarbourReadableDb, datasetId: string) {
  return (
    ((await db
      .select()
      .from(datasets)
      .where(eq(datasets.datasetId, datasetId))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

/**
 * Persists a newly registered dataset row in its initial staged state.
 */
export async function insertDataset(
  db: HarbourWritableDb,
  plan: UploadPlan,
  rawObjectKey: string,
  ingestedAt: string,
  status = 'staged',
) {
  const now = ingestedAt

  await db
    .insert(datasets)
    .values({
      id: crypto.randomUUID(),
      datasetId: plan.datasetId,
      regionCode: plan.regionCode,
      snapshotMonth: plan.snapshotMonth,
      theme: plan.theme,
      type: plan.type,
      source: plan.source,
      sourceVersion: plan.sourceVersion,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      status,
      supersedesDatasetId: plan.supersedesDatasetId,
      revokedAt: null,
      revocationReason: null,
      ingestedAt,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export async function resetFailedDataset(
  db: HarbourWritableDb,
  plan: UploadPlan,
  rawObjectKey: string,
  ingestedAt: string,
  status: string,
) {
  await db
    .update(datasets)
    .set({
      regionCode: plan.regionCode,
      snapshotMonth: plan.snapshotMonth,
      theme: plan.theme,
      type: plan.type,
      source: plan.source,
      sourceVersion: plan.sourceVersion,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      status,
      supersedesDatasetId: plan.supersedesDatasetId,
      revokedAt: null,
      revocationReason: null,
      ingestedAt,
      updatedAt: ingestedAt,
    })
    .where(eq(datasets.datasetId, plan.datasetId))
    .run()
}

export async function updateDatasetStatus(
  db: HarbourWritableDb,
  datasetId: string,
  status: string,
) {
  await db
    .update(datasets)
    .set({
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(datasets.datasetId, datasetId))
    .run()
}

export async function markDatasetCurrent(db: HarbourWritableDb, datasetId: string) {
  const now = new Date().toISOString()

  await db
    .update(datasets)
    .set({
      status: 'current',
      revokedAt: null,
      revocationReason: null,
      updatedAt: now,
    })
    .where(eq(datasets.datasetId, datasetId))
    .run()
}

export async function markDatasetHistoric(
  db: HarbourWritableDb,
  datasetId: string,
  historicAt: string,
) {
  await db
    .update(datasets)
    .set({
      status: 'historic',
      updatedAt: historicAt,
    })
    .where(eq(datasets.datasetId, datasetId))
    .run()
}

export async function revokeDataset(
  db: HarbourWritableDb,
  datasetId: string,
  revocationReason: string,
  revokedAt: string,
) {
  await db
    .update(datasets)
    .set({
      revokedAt,
      revocationReason,
      status: 'revoked',
      updatedAt: revokedAt,
    })
    .where(eq(datasets.datasetId, datasetId))
    .run()
}

/**
 * Records an ingest run event for the dataset registration workflow.
 */
export async function insertIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  datasetId: string,
  phase: string,
  status: string,
  statsJson: string | null,
  startedAt: string,
  finishedAt: string | null,
  errorJson: string | null = null,
) {
  const now = startedAt
  const dataset = await getDatasetRecordById(db, datasetId)

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`)
  }

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      datasetRecordId: dataset.id,
      phase,
      status,
      statsJson,
      errorJson,
      startedAt,
      finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

export async function updateLatestOpenIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  datasetId: string,
  phase: string,
  status: string,
  finishedAt: string,
  statsJson: string | null,
  errorJson: string | null = null,
) {
  const dataset = await getDatasetRecordById(db, datasetId)

  if (!dataset) {
    throw new Error(`Dataset not found: ${datasetId}`)
  }

  const openRun =
    ((await db
      .select({
        runId: ingestRuns.runId,
      })
      .from(ingestRuns)
      .where(
        and(
          eq(ingestRuns.datasetRecordId, dataset.id),
          eq(ingestRuns.phase, phase),
          eq(ingestRuns.status, 'running'),
        ),
      )
      .orderBy(desc(ingestRuns.startedAt), desc(ingestRuns.runId))
      .limit(1)
      .get()) as { runId: string } | undefined) ?? null

  if (!openRun) {
    return false
  }

  await db
    .update(ingestRuns)
    .set({
      status,
      statsJson,
      errorJson,
      finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(ingestRuns.runId, openRun.runId))
    .run()

  return true
}
