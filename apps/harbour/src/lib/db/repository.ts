import { and, desc, eq, ne } from 'drizzle-orm'

import { datasets, ingestRuns } from '@repo/db/schema'

import type { DatasetRecord, RegionCode, SupportedType, UploadPlan } from '../../types'

export type HarbourReadableDb = {
  select: (...args: any[]) => any
}

export type HarbourWritableDb = {
  insert: (...args: any[]) => any
}
type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
  supersedesDatasetId: string | null
}

/**
 * Returns the most recent non-failed dataset for a region/type pair and the
 * active dataset id that a new upload should supersede, if any.
 */
export async function getLatestDatasetForTypeRegion(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  type: SupportedType,
): Promise<LatestDatasetLookup> {
  const latestDataset =
    ((await db
      .select()
      .from(datasets)
      .where(
        and(
          eq(datasets.regionCode, regionCode),
          eq(datasets.type, type),
          ne(datasets.status, 'failed'),
        ),
      )
      .orderBy(desc(datasets.snapshotMonth), desc(datasets.ingestedAt))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null

  if (!latestDataset) {
    return {
      latestDataset: null,
      supersedesDatasetId: null,
    }
  }

  return {
    latestDataset,
    supersedesDatasetId: latestDataset.isActive ? latestDataset.datasetId : null,
  }
}

/**
 * Looks up a dataset by id so the service can reject duplicate registrations
 * before staging files and writing ingest metadata.
 */
export async function getDatasetById(db: HarbourReadableDb, datasetId: string) {
  return (
    (await db
      .select({ datasetId: datasets.datasetId })
      .from(datasets)
      .where(eq(datasets.datasetId, datasetId))
      .limit(1)
      .get()) ?? null
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
) {
  await db
    .insert(datasets)
    .values({
      datasetId: plan.datasetId,
      regionCode: plan.regionCode,
      snapshotMonth: plan.snapshotMonth,
      theme: plan.theme,
      type: plan.type,
      source: plan.source,
      sourceVersion: plan.sourceVersion,
      rawObjectKey,
      status: 'staged',
      isActive: false,
      supersedesDatasetId: plan.supersedesDatasetId,
      revokedAt: null,
      revocationReason: null,
      ingestedAt,
    })
    .run()
}

/**
 * Records an ingest run event for the dataset registration workflow.
 */
export async function insertIngestRun(
  db: HarbourWritableDb,
  datasetId: string,
  phase: string,
  status: string,
  statsJson: string | null,
  startedAt: string,
  finishedAt: string | null,
) {
  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      datasetId,
      phase,
      status,
      statsJson,
      errorJson: null,
      startedAt,
      finishedAt,
    })
    .run()
}
