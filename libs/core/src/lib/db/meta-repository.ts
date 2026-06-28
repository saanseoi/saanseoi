import { and, desc, eq, inArray, isNull, ne, sql, metaSchema } from '@repo/db'

import type { DatasetRecord, RegionCode, SupportedType, UploadPlan } from '../../types'
import type { HarbourReadableDb, HarbourWritableDb } from './types'
import type { IngestRunStatus, ReleaseStatus } from '@repo/db'

type LatestDatasetLookup = {
  latestDataset: DatasetRecord | null
}

type DatasetIdentityRecord = {
  source: string
  datasetId: string
  datasetCode: string
  releaseId: string
  releaseCode: string
  status: ReleaseStatus
}

export type SnapshotFamily = 'division' | 'address' | 'street' | 'place'

export type DataShardRecord = {
  id: string
  bindingName: string
  databaseName: string
}

const D1_MAX_SQL_VARIABLES = 99
const HISTORY_VERSION_PROVENANCE_COLUMN_COUNT = 6
const RELEASE_LOOKUP_RETRY_LIMIT = 4
const RELEASE_LOOKUP_RETRY_DELAY_MS = 150

type WriteStatement = {
  run: () => unknown | Promise<unknown>
}

type AtomicWritableDb = HarbourReadableDb &
  HarbourWritableDb & {
    batch?: (statements: [unknown, ...unknown[]]) => Promise<unknown>
    transaction?: <T>(
      callback: (tx: HarbourReadableDb & HarbourWritableDb) => T | Promise<T>,
    ) => T | Promise<T>
  }

const {
  ingestRuns,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiReleaseSetSources,
  metaApiVersions,
  metaDataShards,
  metaDatasets,
  metaHistoryVersionProvenance,
  metaPublishers,
  metaReleaseSetShardAssignments,
  metaReleaseShardAssignments,
  metaReleases,
  metaSnapshots,
  metaSnapshotSources,
} = metaSchema

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
  supersedesDatasetId: sql<string | null>`null`,
  supersededByReleaseId: metaReleases.supersededByReleaseId,
  revokedAt: metaReleases.revokedAt,
  revocationReason: metaReleases.revocationReason,
  ingestedAt: metaReleases.ingestedAt,
  createdAt: metaReleases.createdAt,
  updatedAt: metaReleases.updatedAt,
} as const

function getMaxInsertRowsPerStatement(columnCount: number) {
  return Math.max(1, Math.floor(D1_MAX_SQL_VARIABLES / columnCount))
}

function chunkRows<T>(rows: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize))
  }

  return chunks
}

async function runAtomicWriteStatements(
  db: AtomicWritableDb,
  buildStatements: (tx: HarbourReadableDb & HarbourWritableDb) => WriteStatement[],
) {
  if (typeof db.batch === 'function') {
    const statements = buildStatements(db)

    if (statements.length === 0) {
      return
    }

    await db.batch(statements as [unknown, ...unknown[]])
    return
  }

  if (typeof db.transaction === 'function') {
    await db.transaction(async tx => {
      for (const statement of buildStatements(tx)) {
        await statement.run()
      }
    })
    return
  }

  for (const statement of buildStatements(db)) {
    await statement.run()
  }
}

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
          ne(metaReleases.status, 'uploading'),
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
    ((await db
      .select({
        source: metaPublishers.code,
        datasetId: metaDatasets.id,
        datasetCode: metaDatasets.code,
        releaseId: metaReleases.id,
        releaseCode: metaReleases.code,
        status: metaReleases.status,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetIdentityRecord | undefined) ?? null
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

export async function getDatasetRecordByReleaseCode(
  db: HarbourReadableDb,
  releaseCode: string,
) {
  return (
    ((await db
      .select(releaseRecordSelection)
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
      .where(eq(metaReleases.code, releaseCode))
      .limit(1)
      .get()) as DatasetRecord | undefined) ?? null
  )
}

export async function resolveDatasetRecord(
  db: HarbourReadableDb,
  {
    releaseCode,
    releaseId,
  }: {
    releaseCode?: string | null
    releaseId?: string | null
  },
) {
  const normalizedReleaseId = releaseId?.trim()

  if (normalizedReleaseId) {
    const dataset = await getDatasetRecordByReleaseId(db, normalizedReleaseId)

    if (dataset) {
      return dataset
    }
  }

  const normalizedReleaseCode = releaseCode?.trim()

  if (!normalizedReleaseCode) {
    return null
  }

  return getDatasetRecordByReleaseCode(db, normalizedReleaseCode)
}

export async function waitForDatasetRecord(
  db: HarbourReadableDb,
  release: {
    releaseCode?: string | null
    releaseId?: string | null
  },
  {
    retryDelayMs = RELEASE_LOOKUP_RETRY_DELAY_MS,
    retryLimit = RELEASE_LOOKUP_RETRY_LIMIT,
  }: {
    retryDelayMs?: number
    retryLimit?: number
  } = {},
) {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const dataset = await resolveDatasetRecord(db, release)

      if (dataset) {
        return dataset
      }
    } catch (error) {
      lastError = error
    }

    if (attempt < retryLimit) {
      await sleep(retryDelayMs * (attempt + 1))
    }
  }

  if (lastError) {
    throw lastError
  }

  return null
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function insertDataset(
  db: HarbourWritableDb & HarbourReadableDb,
  plan: UploadPlan,
  rawObjectKey: string,
  ingestedAt: string,
  status: ReleaseStatus = 'staged',
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
  status: ReleaseStatus,
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
  status: ReleaseStatus,
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

export function getApiVersionCodeForType(type: SupportedType) {
  return type === 'address'
    ? 'ss-addresses-v0.1'
    : type === 'division'
      ? 'ss-divisions-v0.1'
      : 'ss-places-v0.1'
}

export async function resolveLatestSnapshotForFamily(
  db: HarbourReadableDb,
  family: SnapshotFamily,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        family: metaSnapshots.family,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(eq(metaSnapshots.family, family), ne(metaSnapshots.status, 'archived')),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestSnapshotForFamilyExcludingId(
  db: HarbourReadableDb,
  family: SnapshotFamily,
  snapshotId: string,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        family: metaSnapshots.family,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.family, family),
          ne(metaSnapshots.status, 'archived'),
          ne(metaSnapshots.id, snapshotId),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForFamily(
  db: HarbourReadableDb,
  family: SnapshotFamily,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        family: metaSnapshots.family,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(eq(metaSnapshots.family, family), eq(metaSnapshots.status, 'published')),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForFamilyRegion(
  db: HarbourReadableDb,
  family: SnapshotFamily,
  regionCode: RegionCode,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        family: metaSnapshots.family,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .innerJoin(
        metaSnapshotSources,
        eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
      )
      .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
      .where(
        and(
          eq(metaSnapshots.family, family),
          eq(metaSnapshots.status, 'published'),
          eq(metaDatasets.regionCode, regionCode),
          eq(metaSnapshotSources.role, 'primary'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function ensureDraftSnapshotForRelease(
  db: HarbourReadableDb & HarbourWritableDb,
  family: SnapshotFamily,
  releaseCode: string,
) {
  const existing = await db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
      family: metaSnapshots.family,
      status: metaSnapshots.status,
    })
    .from(metaSnapshots)
    .where(and(eq(metaSnapshots.family, family), eq(metaSnapshots.code, releaseCode)))
    .limit(1)
    .get()

  if (existing) {
    return existing
  }

  const now = new Date()
  const snapshotId = crypto.randomUUID()

  await db
    .insert(metaSnapshots)
    .values({
      id: snapshotId,
      family,
      code: releaseCode,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    id: snapshotId,
    code: releaseCode,
    family,
    status: 'draft' as const,
  }
}

export async function resolveSnapshotForRelease(
  db: HarbourReadableDb,
  sourceReleaseId: string,
  family: SnapshotFamily,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        family: metaSnapshots.family,
        status: metaSnapshots.status,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .where(
        and(
          eq(metaSnapshotSources.sourceReleaseId, sourceReleaseId),
          eq(metaSnapshots.family, family),
        ),
      )
      .orderBy(desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveReleaseSetForType(
  db: HarbourReadableDb,
  type: SupportedType,
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          ne(metaApiReleaseSets.status, 'archived'),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveActiveReleaseSetForType(
  db: HarbourReadableDb,
  type: SupportedType,
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiReleaseSets.status, 'active'),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function ensureDraftReleaseSetForRelease(
  db: HarbourReadableDb & HarbourWritableDb,
  type: SupportedType,
  releaseCode: string,
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const existing = await db
    .select({
      id: metaApiReleaseSets.id,
      code: metaApiReleaseSets.code,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(
      and(
        eq(metaApiVersions.code, apiVersionCode),
        eq(metaApiReleaseSets.code, releaseCode),
      ),
    )
    .limit(1)
    .get()

  if (existing) {
    return existing
  }

  const apiVersion = await db
    .select({
      id: metaApiVersions.id,
    })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()

  if (!apiVersion) {
    throw new Error(`API version not found for type: ${type}`)
  }

  const latestReleaseSet = await db
    .select({
      canonicalLogicVersion: metaApiReleaseSets.canonicalLogicVersion,
      canonicalSchemaVersion: metaApiReleaseSets.canonicalSchemaVersion,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiVersions.code, apiVersionCode))
    .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
    .limit(1)
    .get()
  const now = new Date()
  const releaseSetId = crypto.randomUUID()

  await db
    .insert(metaApiReleaseSets)
    .values({
      id: releaseSetId,
      apiVersionId: apiVersion.id,
      code: releaseCode,
      canonicalSchemaVersion: latestReleaseSet?.canonicalSchemaVersion ?? '1',
      canonicalLogicVersion: latestReleaseSet?.canonicalLogicVersion ?? '1',
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    id: releaseSetId,
    code: releaseCode,
    status: 'draft' as const,
  }
}

export async function resolveReleaseSetForRelease(
  db: HarbourReadableDb,
  releaseId: string,
  type: SupportedType,
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSetSources)
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSources.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiReleaseSetSources.sourceReleaseId, releaseId),
          eq(metaApiVersions.code, apiVersionCode),
        ),
      )
      .orderBy(desc(metaApiReleaseSets.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function activateReleaseSet(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseSetId: string,
) {
  const releaseSet = await db
    .select({
      apiVersionId: metaApiReleaseSets.apiVersionId,
      id: metaApiReleaseSets.id,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`Release set not found: ${releaseSetId}`)
  }

  const now = new Date()
  const activeReleaseSets = await db
    .select({
      id: metaApiReleaseSets.id,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, releaseSet.apiVersionId),
        eq(metaApiReleaseSets.status, 'active'),
        ne(metaApiReleaseSets.id, releaseSetId),
      ),
    )
    .all()

  if (activeReleaseSets.length > 0) {
    await db
      .update(metaApiReleaseSets)
      .set({
        status: 'archived',
        validTo: now,
        updatedAt: now,
      })
      .where(
        inArray(
          metaApiReleaseSets.id,
          activeReleaseSets.map((activeSet: { id: string }) => activeSet.id),
        ),
      )
      .run()
  }

  await db
    .update(metaApiReleaseSets)
    .set({
      status: 'active',
      publishedAt: now,
      validFrom: now,
      validTo: null,
      updatedAt: now,
    })
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .run()

  return {
    previousActiveReleaseSetId: activeReleaseSets[0]?.id ?? null,
  }
}

export async function publishReleaseArtifacts(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    carriedSnapshots: Array<{
      snapshotFamily: SnapshotFamily
      snapshotId: string
    }>
    carriedSources: Array<{
      datasetId: string
      role: 'primary' | 'enrichment' | 'fallback' | 'lookup'
      sourceReleaseId: string
    }>
    currentRelease: Pick<DatasetRecord, 'releaseId'> | null
    currentReleaseIsCorrected: boolean
    dataset: Pick<DatasetRecord, 'datasetId' | 'releaseCode' | 'releaseId'>
    publishedAt: string
    releaseSetId: string
    snapshotId: string
    type: SupportedType
  },
) {
  const releaseSet = await db
    .select({
      apiVersionId: metaApiReleaseSets.apiVersionId,
      id: metaApiReleaseSets.id,
    })
    .from(metaApiReleaseSets)
    .where(eq(metaApiReleaseSets.id, args.releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`Release set not found: ${args.releaseSetId}`)
  }

  const snapshot = await db
    .select({
      id: metaSnapshots.id,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, args.snapshotId))
    .limit(1)
    .get()

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${args.snapshotId}`)
  }

  const activeReleaseSets = await db
    .select({
      id: metaApiReleaseSets.id,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, releaseSet.apiVersionId),
        eq(metaApiReleaseSets.status, 'active'),
        ne(metaApiReleaseSets.id, args.releaseSetId),
      ),
    )
    .all()

  const publishedAt = new Date(args.publishedAt)

  await runAtomicWriteStatements(db as AtomicWritableDb, tx => {
    const statements: WriteStatement[] = [
      tx
        .update(metaSnapshots)
        .set({
          status: 'published',
          publishedAt,
          validFrom: publishedAt,
          validTo: null,
          updatedAt: publishedAt,
        })
        .where(eq(metaSnapshots.id, args.snapshotId)),
    ]

    if (activeReleaseSets.length > 0) {
      statements.push(
        tx
          .update(metaApiReleaseSets)
          .set({
            status: 'archived',
            validTo: publishedAt,
            updatedAt: publishedAt,
          })
          .where(
            inArray(
              metaApiReleaseSets.id,
              activeReleaseSets.map((activeSet: { id: string }) => activeSet.id),
            ),
          ),
      )
    }

    for (const carriedSnapshot of args.carriedSnapshots) {
      statements.push(
        tx
          .insert(metaApiReleaseSetSnapshots)
          .values({
            apiReleaseSetId: args.releaseSetId,
            snapshotFamily: carriedSnapshot.snapshotFamily,
            snapshotId: carriedSnapshot.snapshotId,
            createdAt: publishedAt,
          })
          .onConflictDoUpdate({
            target: [
              metaApiReleaseSetSnapshots.apiReleaseSetId,
              metaApiReleaseSetSnapshots.snapshotFamily,
            ],
            set: {
              snapshotId: carriedSnapshot.snapshotId,
            },
          }),
      )
    }

    for (const carriedSource of args.carriedSources) {
      statements.push(
        tx
          .insert(metaApiReleaseSetSources)
          .values({
            apiReleaseSetId: args.releaseSetId,
            datasetId: carriedSource.datasetId,
            sourceReleaseId: carriedSource.sourceReleaseId,
            role: carriedSource.role,
            createdAt: publishedAt,
          })
          .onConflictDoUpdate({
            target: [
              metaApiReleaseSetSources.apiReleaseSetId,
              metaApiReleaseSetSources.sourceReleaseId,
            ],
            set: {
              datasetId: carriedSource.datasetId,
              role: carriedSource.role,
            },
          }),
      )
    }

    statements.push(
      tx
        .delete(metaApiReleaseSetSnapshots)
        .where(
          and(
            eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId),
            eq(metaApiReleaseSetSnapshots.snapshotFamily, args.type),
          ),
        ),
      tx
        .insert(metaApiReleaseSetSnapshots)
        .values({
          apiReleaseSetId: args.releaseSetId,
          snapshotFamily: args.type,
          snapshotId: args.snapshotId,
          createdAt: publishedAt,
        })
        .onConflictDoUpdate({
          target: [
            metaApiReleaseSetSnapshots.apiReleaseSetId,
            metaApiReleaseSetSnapshots.snapshotFamily,
          ],
          set: {
            snapshotId: args.snapshotId,
          },
        }),
      tx
        .delete(metaApiReleaseSetSources)
        .where(
          and(
            eq(metaApiReleaseSetSources.apiReleaseSetId, args.releaseSetId),
            eq(metaApiReleaseSetSources.datasetId, args.dataset.datasetId),
          ),
        ),
      tx
        .insert(metaApiReleaseSetSources)
        .values({
          apiReleaseSetId: args.releaseSetId,
          datasetId: args.dataset.datasetId,
          sourceReleaseId: args.dataset.releaseId,
          role: 'primary',
          createdAt: publishedAt,
        })
        .onConflictDoUpdate({
          target: [
            metaApiReleaseSetSources.apiReleaseSetId,
            metaApiReleaseSetSources.sourceReleaseId,
          ],
          set: {
            datasetId: args.dataset.datasetId,
            role: 'primary',
          },
        }),
      tx
        .update(metaApiReleaseSets)
        .set({
          status: 'active',
          publishedAt,
          validFrom: publishedAt,
          validTo: null,
          updatedAt: publishedAt,
        })
        .where(eq(metaApiReleaseSets.id, args.releaseSetId)),
      tx
        .update(metaReleases)
        .set({
          status: 'published',
          revokedAt: null,
          revocationReason: null,
          updatedAt: publishedAt,
        })
        .where(eq(metaReleases.id, args.dataset.releaseId)),
    )

    if (args.currentRelease) {
      statements.push(
        tx
          .update(metaReleases)
          .set({
            supersededByReleaseId: args.dataset.releaseId,
            updatedAt: publishedAt,
          })
          .where(eq(metaReleases.id, args.currentRelease.releaseId)),
      )

      if (args.currentReleaseIsCorrected) {
        statements.push(
          tx
            .update(metaReleases)
            .set({
              revokedAt: publishedAt,
              revocationReason: `Superseded by corrected release ${args.dataset.releaseCode}.`,
              status: 'revoked',
              updatedAt: publishedAt,
            })
            .where(eq(metaReleases.id, args.currentRelease.releaseId)),
        )
      } else {
        statements.push(
          tx
            .update(metaReleases)
            .set({
              status: 'superseded',
              updatedAt: publishedAt,
            })
            .where(eq(metaReleases.id, args.currentRelease.releaseId)),
        )
      }
    }

    return statements
  })
}

export async function publishSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
) {
  const snapshot = await db
    .select({
      id: metaSnapshots.id,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, snapshotId))
    .limit(1)
    .get()

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`)
  }

  const now = new Date()

  await db
    .update(metaSnapshots)
    .set({
      status: 'published',
      publishedAt: now,
      validFrom: now,
      validTo: null,
      updatedAt: now,
    })
    .where(eq(metaSnapshots.id, snapshotId))
    .run()
}

export async function resolveShardForKindRegionYear(
  db: HarbourReadableDb,
  kind: 'current' | 'history' | 'source',
  environment: 'preview' | 'production',
  regionCode?: string,
  year?: string,
): Promise<DataShardRecord | null> {
  if (kind === 'current') {
    return (
      ((await db
        .select({
          id: metaDataShards.id,
          bindingName: metaDataShards.bindingName,
          databaseName: metaDataShards.databaseName,
        })
        .from(metaDataShards)
        .where(
          and(
            eq(metaDataShards.kind, kind),
            eq(metaDataShards.environment, environment),
            eq(metaDataShards.status, 'active'),
            isNull(metaDataShards.regionCode),
            isNull(metaDataShards.year),
          ),
        )
        .limit(1)
        .get()) as DataShardRecord | undefined) ?? null
    )
  }

  const baseConditions = and(
    eq(metaDataShards.kind, kind),
    eq(metaDataShards.environment, environment),
    eq(metaDataShards.status, 'active'),
    regionCode
      ? eq(metaDataShards.regionCode, regionCode)
      : isNull(metaDataShards.regionCode),
  )

  const exactMatch =
    ((await db
      .select({
        id: metaDataShards.id,
        bindingName: metaDataShards.bindingName,
        databaseName: metaDataShards.databaseName,
      })
      .from(metaDataShards)
      .where(
        and(
          baseConditions,
          year ? eq(metaDataShards.year, year) : isNull(metaDataShards.year),
        ),
      )
      .limit(1)
      .get()) as DataShardRecord | undefined) ?? null

  if (exactMatch || !year) {
    return exactMatch
  }

  const requestedYear = Number.parseInt(year, 10)

  if (Number.isNaN(requestedYear)) {
    return null
  }

  const fallbackRows = (await db
    .select({
      id: metaDataShards.id,
      bindingName: metaDataShards.bindingName,
      databaseName: metaDataShards.databaseName,
      year: metaDataShards.year,
    })
    .from(metaDataShards)
    .where(and(baseConditions, sql`${metaDataShards.year} is not null`))
    .all()) as FallbackShardRow[]

  type FallbackShardRow = {
    id: string
    bindingName: string
    databaseName: string
    year: string | null
  }

  const rankedRows = fallbackRows
    .map((row: FallbackShardRow) => ({
      ...row,
      numericYear: row.year ? Number.parseInt(row.year, 10) : Number.NaN,
    }))
    .filter(
      (row: FallbackShardRow & { numericYear: number }) =>
        !Number.isNaN(row.numericYear),
    )
    .sort(
      (
        left: FallbackShardRow & { numericYear: number },
        right: FallbackShardRow & { numericYear: number },
      ) => {
        const leftDistance = Math.abs(left.numericYear - requestedYear)
        const rightDistance = Math.abs(right.numericYear - requestedYear)

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance
        }

        return left.numericYear - right.numericYear
      },
    )

  const fallback = rankedRows[0]

  return fallback
    ? {
        id: fallback.id,
        bindingName: fallback.bindingName,
        databaseName: fallback.databaseName,
      }
    : null
}

export async function upsertSnapshotSource(
  db: HarbourWritableDb,
  snapshotId: string,
  datasetId: string,
  sourceReleaseId: string,
  role: 'primary' | 'enrichment' | 'fallback' | 'lookup',
) {
  await db
    .insert(metaSnapshotSources)
    .values({
      snapshotId,
      datasetId,
      sourceReleaseId,
      role,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [metaSnapshotSources.snapshotId, metaSnapshotSources.sourceReleaseId],
      set: {
        datasetId,
        role,
      },
    })
    .run()
}

export async function upsertApiReleaseSetSource(
  db: HarbourWritableDb,
  releaseSetId: string,
  datasetId: string,
  sourceReleaseId: string,
  role: 'primary' | 'enrichment' | 'fallback' | 'lookup',
) {
  await db
    .insert(metaApiReleaseSetSources)
    .values({
      apiReleaseSetId: releaseSetId,
      datasetId,
      sourceReleaseId,
      role,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        metaApiReleaseSetSources.apiReleaseSetId,
        metaApiReleaseSetSources.sourceReleaseId,
      ],
      set: {
        datasetId,
        role,
      },
    })
    .run()
}

export async function upsertApiReleaseSetSnapshot(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotFamily: SnapshotFamily,
  snapshotId: string,
) {
  await db
    .insert(metaApiReleaseSetSnapshots)
    .values({
      apiReleaseSetId: releaseSetId,
      snapshotFamily,
      snapshotId,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaApiReleaseSetSnapshots.snapshotFamily,
      ],
      set: {
        snapshotId,
      },
    })
    .run()
}

export async function deleteApiReleaseSetSourcesForDataset(
  db: HarbourWritableDb,
  releaseSetId: string,
  datasetId: string,
) {
  await db
    .delete(metaApiReleaseSetSources)
    .where(
      and(
        eq(metaApiReleaseSetSources.apiReleaseSetId, releaseSetId),
        eq(metaApiReleaseSetSources.datasetId, datasetId),
      ),
    )
    .run()
}

export async function deleteApiReleaseSetSnapshotForFamily(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotFamily: SnapshotFamily,
) {
  await db
    .delete(metaApiReleaseSetSnapshots)
    .where(
      and(
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId),
        eq(metaApiReleaseSetSnapshots.snapshotFamily, snapshotFamily),
      ),
    )
    .run()
}

export async function listApiReleaseSetSnapshots(
  db: HarbourReadableDb,
  releaseSetId: string,
) {
  return db
    .select({
      snapshotFamily: metaApiReleaseSetSnapshots.snapshotFamily,
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
    })
    .from(metaApiReleaseSetSnapshots)
    .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId))
    .all()
}

export async function listApiReleaseSetSources(
  db: HarbourReadableDb,
  releaseSetId: string,
) {
  return db
    .select({
      datasetId: metaApiReleaseSetSources.datasetId,
      sourceReleaseId: metaApiReleaseSetSources.sourceReleaseId,
      role: metaApiReleaseSetSources.role,
    })
    .from(metaApiReleaseSetSources)
    .where(eq(metaApiReleaseSetSources.apiReleaseSetId, releaseSetId))
    .all()
}

export async function resolveActiveSnapshotForType(
  db: HarbourReadableDb,
  type: SupportedType,
  family: SnapshotFamily,
) {
  const activeReleaseSet = await resolveActiveReleaseSetForType(db, type)

  if (!activeReleaseSet) {
    return null
  }

  return (
    (await db
      .select({
        snapshotId: metaApiReleaseSetSnapshots.snapshotId,
      })
      .from(metaApiReleaseSetSnapshots)
      .where(
        and(
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, activeReleaseSet.id),
          eq(metaApiReleaseSetSnapshots.snapshotFamily, family),
        ),
      )
      .limit(1)
      .get()) ?? null
  )
}

export async function insertHistoryVersionProvenanceRows(
  db: HarbourWritableDb,
  rows: Array<{
    entityId: string
    entityType: 'division' | 'address2d' | 'address3d' | 'street' | 'place'
    snapshotId: string
    sourceReleaseId: string
    versionHash: string
  }>,
) {
  if (rows.length === 0) {
    return
  }

  const chunkSize = getMaxInsertRowsPerStatement(
    HISTORY_VERSION_PROVENANCE_COLUMN_COUNT,
  )

  for (const chunk of chunkRows(rows, chunkSize)) {
    await db
      .insert(metaHistoryVersionProvenance)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: new Date(),
        })),
      )
      .onConflictDoNothing()
      .run()
  }
}

export async function upsertReleaseShardAssignment(
  db: HarbourWritableDb,
  releaseId: string,
  dataShardId: string,
) {
  await db
    .insert(metaReleaseShardAssignments)
    .values({
      releaseId,
      dataShardId,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run()
}

export async function upsertReleaseSetShardAssignment(
  db: HarbourWritableDb,
  releaseSetId: string,
  dataShardId: string,
) {
  await db
    .insert(metaReleaseSetShardAssignments)
    .values({
      apiReleaseSetId: releaseSetId,
      dataShardId,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run()
}

export async function insertIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  stats: string | null,
  startedAt: string,
  finishedAt: string | null,
  error: string | null = null,
) {
  const now = startedAt

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status,
      stats,
      error,
      startedAt: now,
      finishedAt,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .run()
}

export async function ensureIngestRunStarted(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  stats: string | null,
  startedAt: string,
) {
  const now = new Date(startedAt)
  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status: 'running',
      stats,
      error: null,
      startedAt,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [ingestRuns.releaseId, ingestRuns.phase],
    })
    .run()

  const existingRun =
    ((await db
      .select({
        runId: ingestRuns.runId,
        status: ingestRuns.status,
      })
      .from(ingestRuns)
      .where(and(eq(ingestRuns.releaseId, releaseId), eq(ingestRuns.phase, phase)))
      .limit(1)
      .get()) as { runId: string; status: string } | undefined) ?? null

  if (!existingRun) {
    return
  }

  if (existingRun.status === 'running') {
    await db
      .update(ingestRuns)
      .set({
        stats,
        error: null,
        updatedAt: now,
      })
      .where(eq(ingestRuns.runId, existingRun.runId))
      .run()
    return
  }

  if (existingRun.status !== 'error') {
    return
  }

  await db
    .update(ingestRuns)
    .set({
      status: 'running',
      stats,
      error: null,
      startedAt,
      finishedAt: null,
      updatedAt: now,
    })
    .where(eq(ingestRuns.runId, existingRun.runId))
    .run()
}

export async function upsertIngestRunStatus(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  startedAt: string,
  finishedAt: string | null,
  stats: string | null,
  error: string | null = null,
) {
  const startedAtDate = new Date(startedAt)
  const updatedAt = new Date(finishedAt ?? startedAt)

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status,
      stats,
      error,
      startedAt,
      finishedAt,
      createdAt: startedAtDate,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [ingestRuns.releaseId, ingestRuns.phase],
      set: {
        startedAt,
        status,
        stats,
        error,
        finishedAt,
        updatedAt,
      },
    })
    .run()
}

export async function updateLatestOpenIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  finishedAt: string,
  stats: string | null,
  error: string | null = null,
) {
  const openRun =
    ((await db
      .select({
        runId: ingestRuns.runId,
      })
      .from(ingestRuns)
      .where(
        and(
          eq(ingestRuns.releaseId, releaseId),
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
      stats,
      error,
      finishedAt,
      updatedAt: new Date(finishedAt),
    })
    .where(eq(ingestRuns.runId, openRun.runId))
    .run()

  return true
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
