import { and, desc, eq, ne } from 'drizzle-orm'

import { ingestRuns, metaSchema } from '@repo/db'

import type { DatasetRecord, RegionCode, SupportedType, UploadPlan } from '../../types'
import type { HarbourReadableDb, HarbourWritableDb } from './repository'

type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
}

const { metaDatasets, metaPublishers, metaReleases } = metaSchema

const releaseRecordSelection = {
  id: metaReleases.id,
  datasetId: metaDatasets.id,
  datasetCode: metaDatasets.code,
  releaseId: metaReleases.id,
  releaseCode: metaReleases.code,
  regionCode: metaDatasets.regionCode,
  snapshotMonth: metaReleases.snapshotMonth,
  theme: metaDatasets.theme,
  type: metaDatasets.type,
  source: metaPublishers.code,
  sourceVersion: metaReleases.sourceVersion,
  rawObjectKey: metaReleases.rawObjectKey,
  originalFileName: metaReleases.originalFileName,
  status: metaReleases.status,
  supersededByReleaseId: metaReleases.supersededByReleaseId,
  revokedAt: metaReleases.revokedAt,
  revocationReason: metaReleases.revocationReason,
  ingestedAt: metaReleases.ingestedAt,
  createdAt: metaReleases.createdAt,
  updatedAt: metaReleases.updatedAt,
} as const

export async function getLatestDatasetForRegionSourceType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  source: string,
  type: SupportedType,
): Promise<LatestDatasetLookup> {
  const latestDataset =
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaPublishers.code, source),
          eq(metaDatasets.type, type),
          ne(metaReleases.status, 'failed'),
        ),
      )
      .orderBy(desc(metaReleases.sourceVersion), desc(metaReleases.ingestedAt))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null

  return {
    latestDataset,
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
        datasetId: metaDatasets.id,
        releaseId: metaReleases.id,
        releaseCode: metaReleases.code,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaDatasets.regionCode, regionCode),
          eq(metaReleases.snapshotMonth, snapshotMonth),
          eq(metaPublishers.code, source),
          eq(metaDatasets.type, type),
          ne(metaReleases.status, 'failed'),
        ),
      )
      .limit(1)
      .get()) as
      | { datasetId: string; releaseId: string; releaseCode: string }
      | undefined) ?? null

  return existing
}

export async function getDatasetById(db: HarbourReadableDb, releaseCode: string) {
  return (
    (await db
      .select({
        datasetId: metaDatasets.id,
        releaseId: metaReleases.id,
        releaseCode: metaReleases.code,
        status: metaReleases.status,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .where(eq(metaReleases.code, releaseCode))
      .limit(1)
      .get()) ?? null
  )
}

export async function getDatasetRecordByReleaseId(
  db: HarbourReadableDb,
  releaseId: string,
) {
  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.id, releaseId))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function getCurrentReleaseForDatasetId(
  db: HarbourReadableDb,
  datasetId: string,
  excludeReleaseId?: string,
) {
  const whereClause = excludeReleaseId
    ? and(
        eq(metaReleases.datasetId, datasetId),
        eq(metaReleases.status, 'published'),
        ne(metaReleases.id, excludeReleaseId),
      )
    : and(eq(metaReleases.datasetId, datasetId), eq(metaReleases.status, 'published'))

  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(whereClause)
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function insertDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  rawObjectKey: string,
  ingestedAt: string,
  status = 'staged',
) {
  const dataset = await requireDatasetDefinition(db, plan)
  const now = new Date(ingestedAt)

  await db
    .insert(metaReleases)
    .values({
      id: crypto.randomUUID(),
      datasetId: dataset.id,
      code: plan.releaseCode,
      sourceVersion: plan.sourceVersion,
      snapshotMonth: plan.snapshotMonth,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByReleaseId: null,
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
  const now = new Date(ingestedAt)

  await db
    .update(metaReleases)
    .set({
      sourceVersion: plan.sourceVersion,
      snapshotMonth: plan.snapshotMonth,
      rawObjectKey,
      originalFileName: plan.originalFileName,
      status,
      ingestedAt: now,
      revokedAt: null,
      revocationReason: null,
      supersededByReleaseId: null,
      updatedAt: now,
    })
    .where(eq(metaReleases.code, plan.releaseCode))
    .run()
}

export async function updateDatasetStatus(
  db: HarbourWritableDb,
  releaseId: string,
  status: string,
) {
  await db
    .update(metaReleases)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function markDatasetCurrent(db: HarbourWritableDb, releaseId: string) {
  const now = new Date()

  await db
    .update(metaReleases)
    .set({
      status: 'published',
      revokedAt: null,
      revocationReason: null,
      updatedAt: now,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function markDatasetHistoric(
  db: HarbourWritableDb,
  releaseId: string,
  historicAt: string,
) {
  const updatedAt = new Date(historicAt)

  await db
    .update(metaReleases)
    .set({
      status: 'superseded',
      updatedAt,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function revokeDataset(
  db: HarbourWritableDb,
  releaseId: string,
  revocationReason: string,
  revokedAt: string,
) {
  const revokedAtDate = new Date(revokedAt)

  await db
    .update(metaReleases)
    .set({
      revokedAt: revokedAtDate,
      revocationReason,
      status: 'revoked',
      updatedAt: revokedAtDate,
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function setSupersededByReleaseId(
  db: HarbourWritableDb,
  releaseId: string,
  supersededByReleaseId: string,
) {
  await db
    .update(metaReleases)
    .set({
      supersededByReleaseId,
      updatedAt: new Date(),
    })
    .where(eq(metaReleases.id, releaseId))
    .run()
}

export async function insertIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: string,
  statsJson: string | null,
  startedAt: string,
  finishedAt: string | null,
  errorJson: string | null = null,
) {
  try {
    const now = startedAt

    await db
      .insert(ingestRuns)
      .values({
        runId: crypto.randomUUID(),
        datasetRecordId: releaseId,
        phase,
        status,
        statsJson,
        errorJson,
        startedAt: now,
        finishedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  } catch (error) {
    if (!isMissingTableError(error, 'ingestRuns')) {
      throw error
    }
  }
}

export async function updateLatestOpenIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: string,
  finishedAt: string,
  statsJson: string | null,
  errorJson: string | null = null,
) {
  try {
    const openRun =
      ((await db
        .select({
          runId: ingestRuns.runId,
        })
        .from(ingestRuns)
        .where(
          and(
            eq(ingestRuns.datasetRecordId, releaseId),
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
  } catch (error) {
    if (isMissingTableError(error, 'ingestRuns')) {
      return false
    }

    throw error
  }
}

async function requireDatasetDefinition(
  db: HarbourReadableDb,
  plan: Pick<UploadPlan, 'datasetCode' | 'source'>,
) {
  const dataset =
    ((await db
      .select({
        id: metaDatasets.id,
      })
      .from(metaDatasets)
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(
        and(
          eq(metaPublishers.code, plan.source),
          eq(metaDatasets.code, plan.datasetCode),
        ),
      )
      .limit(1)
      .get()) as { id: string } | undefined) ?? null

  if (!dataset) {
    throw new Error(
      `Dataset definition not found for ${plan.source}/${plan.datasetCode}. Seed meta datasets before uploading releases.`,
    )
  }

  return dataset
}

function isMissingTableError(error: unknown, tableName: string) {
  return (
    error instanceof Error &&
    new RegExp(`no such table: ${tableName}`, 'i').test(error.message)
  )
}
