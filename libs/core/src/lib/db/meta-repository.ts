import {
  and,
  buildApiVersionCode,
  buildDataReleaseSetCode,
  buildSnapshotVersionCode,
  computeVersionHash,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
  metaSchema,
} from '@repo/db'
import { resolveApiFieldFixture } from '@repo/db/api-field-fixtures'

import type {
  DatasetRecord,
  RegionCode,
  ResourceType,
  SupportedType,
  UploadPlan,
} from '../../types'
import type { HarbourReadableDb, HarbourWritableDb } from './types'
import type { DataShardType, IngestRunStatus, ReleaseStatus } from '@repo/db'

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

export type DataShardRecord = {
  id: string
  bindingName: string
  databaseName: string
}

const RELEASE_LOOKUP_RETRY_LIMIT = 4
const RELEASE_LOOKUP_RETRY_DELAY_MS = 150
const OVERTURE_SOURCE_SCHEMA_RELEASES = [
  { schema: '1.11.0', version: '2025-07-23.0' },
  { schema: '1.11.0', version: '2025-08-20.0' },
  { schema: '1.12.0', version: '2025-09-24.0' },
  { schema: '1.13.0', version: '2025-10-22.0' },
  { schema: '1.14.0', version: '2025-11-19.0' },
  { schema: '1.15.0', version: '2025-12-17.0' },
  { schema: '1.15.0', version: '2026-01-21.0' },
  { schema: '1.16.0', version: '2026-02-18.0' },
  { schema: '1.16.0', version: '2026-03-18.0' },
  { schema: '1.16.0', version: '2026-04-15.0' },
  { schema: '1.17.0', version: '2026-05-20.0' },
  { schema: '1.17.0', version: '2026-06-17.0' },
] as const

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

function compareReleaseVersions(left: string, right: string) {
  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  return Number.parseInt(leftPatch, 10) - Number.parseInt(rightPatch, 10)
}

function resolveSourceSchemaVersion(args: {
  source: string
  sourceVersion: string
  storedSourceSchemaVersion?: string | null
}) {
  if (args.storedSourceSchemaVersion?.trim()) {
    return args.storedSourceSchemaVersion.trim()
  }

  if (args.source === 'hkgov-als') {
    return '3.2'
  }

  if (args.source !== 'overture') {
    throw new Error(
      `Could not resolve source schema version for source=${args.source}, sourceVersion=${args.sourceVersion}.`,
    )
  }

  const candidates = OVERTURE_SOURCE_SCHEMA_RELEASES.filter(
    release => compareReleaseVersions(release.version, args.sourceVersion) <= 0,
  )
  const match = candidates.at(-1)

  if (!match) {
    throw new Error(
      `No Overture source schema mapping found for sourceVersion=${args.sourceVersion}.`,
    )
  }

  return match.schema
}

const {
  metaApiFieldProvenance,
  metaApiComposition,
  metaApiCompositionMembers,
  ingestRuns,
  metaApiReleaseSets,
  metaApiReleaseSetSnapshots,
  metaApiVersions,
  metaDataShards,
  metaDatasets,
  metaPublishers,
  metaReleaseSetShardAssignments,
  metaReleaseShardAssignments,
  metaReleases,
  metaSnapshotAssembly,
  metaSnapshotAssemblyRuns,
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
  cohortKey: metaReleases.cohortKey,
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

export async function hasDatasetForCohortKeySourceType(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  cohortKey: string,
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
          eq(metaReleases.cohortKey, cohortKey),
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
  const sourceSchemaVersion = resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
  })

  await db
    .insert(metaReleases)
    .values({
      id: crypto.randomUUID(),
      datasetId: dataset.id,
      code: plan.releaseCode,
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
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
  const sourceSchemaVersion = resolveSourceSchemaVersion({
    source: plan.source,
    sourceVersion: plan.sourceVersion,
  })

  await db
    .update(metaReleases)
    .set({
      sourceVersion: plan.sourceVersion,
      sourceSchemaVersion,
      publicationDate: plan.sourceVersion.split('.')[0] ?? null,
      cohortKey: plan.cohortKey,
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
  return buildApiVersionCode(type, '0.1')
}

async function resolveCurrentApiComposition(
  db: HarbourReadableDb,
  apiVersionCode: string,
) {
  return (
    (await db
      .select({
        id: metaApiComposition.id,
        apiVersionId: metaApiComposition.apiVersionId,
        code: metaApiComposition.code,
        version: metaApiComposition.version,
        primaryResourceType: metaApiComposition.primaryResourceType,
        status: metaApiComposition.status,
      })
      .from(metaApiComposition)
      .innerJoin(
        metaApiVersions,
        eq(metaApiComposition.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaApiVersions.code, apiVersionCode),
          eq(metaApiComposition.status, 'current'),
        ),
      )
      .orderBy(desc(metaApiComposition.version), desc(metaApiComposition.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function listApiCompositionMembers(
  db: HarbourReadableDb,
  apiCompositionId: string,
) {
  return db
    .select({
      resourceType: metaApiCompositionMembers.resourceType,
      role: metaApiCompositionMembers.role,
      isRequired: metaApiCompositionMembers.isRequired,
      selectionMode: metaApiCompositionMembers.selectionMode,
      anchorResourceType: metaApiCompositionMembers.anchorResourceType,
      maxLagDays: metaApiCompositionMembers.maxLagDays,
      priority: metaApiCompositionMembers.priority,
    })
    .from(metaApiCompositionMembers)
    .where(eq(metaApiCompositionMembers.apiCompositionId, apiCompositionId))
    .orderBy(metaApiCompositionMembers.priority)
    .all()
}

export async function resolveLatestSnapshotForResourceType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          ne(metaSnapshots.status, 'archived'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestSnapshotForResourceTypeExcludingId(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  snapshotId: string,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
          ne(metaSnapshots.id, snapshotId),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForResourceType(
  db: HarbourReadableDb,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshots)
      .where(
        and(
          eq(metaSnapshots.resourceType, resourceType),
          eq(metaSnapshots.status, 'published'),
        ),
      )
      .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
      .limit(1)
      .get()) ?? null
  )
}

export async function resolveLatestPublishedSnapshotForResourceTypeRegion(
  db: HarbourReadableDb,
  resourceType: ResourceType,
  regionCode: RegionCode,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
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
          eq(metaSnapshots.resourceType, resourceType),
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
  resourceType: ResourceType,
  args: {
    cohortKey: string
    regionCode: string
  },
) {
  const snapshotCode = buildSnapshotVersionCode(
    args.regionCode,
    resourceType,
    args.cohortKey,
  )
  const existing = await db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      resourceType: metaSnapshots.resourceType,
      status: metaSnapshots.status,
    })
    .from(metaSnapshots)
    .where(
      and(
        eq(metaSnapshots.resourceType, resourceType),
        eq(metaSnapshots.code, snapshotCode),
      ),
    )
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
      resourceType,
      code: snapshotCode,
      cohortKey: args.cohortKey,
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
    code: snapshotCode,
    cohortKey: args.cohortKey,
    resourceType,
    status: 'draft' as const,
  }
}

export async function recordSnapshotAssemblyRun(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    anchorCohortKey: string
    anchorReleaseId?: string | null
    resourceType: ResourceType
    selectionSummaryJson?: Record<string, unknown> | null
    snapshotId: string
  },
) {
  const assembly =
    (await db
      .select({
        id: metaSnapshotAssembly.id,
        code: metaSnapshotAssembly.code,
      })
      .from(metaSnapshotAssembly)
      .where(
        and(
          eq(metaSnapshotAssembly.resourceType, args.resourceType),
          eq(metaSnapshotAssembly.status, 'current'),
        ),
      )
      .orderBy(desc(metaSnapshotAssembly.version), desc(metaSnapshotAssembly.createdAt))
      .limit(1)
      .get()) ?? null

  if (!assembly) {
    return null
  }

  const existing =
    (await db
      .select({
        id: metaSnapshotAssemblyRuns.id,
      })
      .from(metaSnapshotAssemblyRuns)
      .where(
        and(
          eq(metaSnapshotAssemblyRuns.snapshotId, args.snapshotId),
          eq(metaSnapshotAssemblyRuns.snapshotAssemblyId, assembly.id),
        ),
      )
      .limit(1)
      .get()) ?? null

  if (existing) {
    return assembly
  }

  const now = new Date()

  await db
    .insert(metaSnapshotAssemblyRuns)
    .values({
      id: crypto.randomUUID(),
      snapshotId: args.snapshotId,
      snapshotAssemblyId: assembly.id,
      anchorReleaseId: args.anchorReleaseId ?? null,
      anchorCohortKey: args.anchorCohortKey,
      status: 'selected',
      selectionSummaryJson: args.selectionSummaryJson ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return assembly
}

export async function resolveSnapshotForRelease(
  db: HarbourReadableDb,
  sourceReleaseId: string,
  resourceType: ResourceType,
) {
  return (
    (await db
      .select({
        id: metaSnapshots.id,
        code: metaSnapshots.code,
        resourceType: metaSnapshots.resourceType,
        status: metaSnapshots.status,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .where(
        and(
          eq(metaSnapshotSources.sourceReleaseId, sourceReleaseId),
          eq(metaSnapshots.resourceType, resourceType),
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
          eq(metaApiReleaseSets.status, 'current'),
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
  release: Pick<DatasetRecord, 'cohortKey' | 'regionCode'>,
) {
  const apiVersionCode = getApiVersionCodeForType(type)
  const apiVersion = await db
    .select({
      id: metaApiVersions.id,
      familyType: metaApiVersions.familyType,
    })
    .from(metaApiVersions)
    .where(eq(metaApiVersions.code, apiVersionCode))
    .limit(1)
    .get()

  if (!apiVersion) {
    throw new Error(`API version not found for type: ${type}`)
  }

  const composition = await resolveCurrentApiComposition(db, apiVersionCode)

  if (composition?.primaryResourceType && composition.primaryResourceType !== type) {
    throw new Error(
      `API composition ${composition.code} expects primary resourceType=${composition.primaryResourceType}, not ${type}.`,
    )
  }

  const releaseSetCodePrefix = `data-${release.regionCode}-${apiVersion.familyType}-${release.cohortKey}-`
  const existing = await db
    .select({
      id: metaApiReleaseSets.id,
      code: metaApiReleaseSets.code,
      status: metaApiReleaseSets.status,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, apiVersion.id),
        ne(metaApiReleaseSets.status, 'archived'),
        sql`${metaApiReleaseSets.code} LIKE ${`${releaseSetCodePrefix}%`}`,
      ),
    )
    .orderBy(desc(metaApiReleaseSets.createdAt))
    .limit(1)
    .get()

  if (existing) {
    return existing
  }

  const latestReleaseSet = await db
    .select({
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      schemaVersion: metaApiReleaseSets.schemaVersion,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiVersions.code, apiVersionCode))
    .orderBy(desc(metaApiReleaseSets.publishedAt), desc(metaApiReleaseSets.createdAt))
    .limit(1)
    .get()
  const existingCodes = await db
    .select({
      code: metaApiReleaseSets.code,
    })
    .from(metaApiReleaseSets)
    .where(
      and(
        eq(metaApiReleaseSets.apiVersionId, apiVersion.id),
        sql`${metaApiReleaseSets.code} LIKE ${`${releaseSetCodePrefix}%`}`,
      ),
    )
    .all()
  const now = new Date()
  const releaseSetId = crypto.randomUUID()
  const nextSequence =
    existingCodes.reduce((maxSequence, row) => {
      const sequence = Number.parseInt(row.code.slice(releaseSetCodePrefix.length), 10)
      return Number.isNaN(sequence) ? maxSequence : Math.max(maxSequence, sequence)
    }, -1) + 1
  const releaseSetCode = buildDataReleaseSetCode(
    release.regionCode,
    apiVersion.familyType,
    release.cohortKey,
    nextSequence,
  )
  const schemaVersion = latestReleaseSet?.schemaVersion ?? `sv-${type}-v1`
  const rulesetVersion = latestReleaseSet?.rulesetVersion ?? `rs-${type}-merge-v1`
  const versionHash = computeVersionHash({
    apiVersion: apiVersionCode,
    releaseSetCode,
    cohortKey: release.cohortKey,
    schemaVersion,
    rulesetVersion,
    status: 'draft',
    publishedAt: null,
    validFrom: null,
    validTo: null,
    notes: null,
  })

  await db
    .insert(metaApiReleaseSets)
    .values({
      id: releaseSetId,
      apiVersionId: apiVersion.id,
      code: releaseSetCode,
      schemaVersion,
      rulesetVersion,
      status: 'draft',
      publishedAt: null,
      validFrom: null,
      validTo: null,
      notes: null,
      versionHash,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return {
    id: releaseSetId,
    code: releaseSetCode,
    status: 'draft' as const,
  }
}

export async function resolveReleaseSetForRelease(
  db: HarbourReadableDb,
  releaseId: string,
  type: ResourceType,
) {
  const apiVersionCode = getApiVersionCodeForType(type)

  return (
    (await db
      .select({
        id: metaApiReleaseSets.id,
        code: metaApiReleaseSets.code,
        status: metaApiReleaseSets.status,
      })
      .from(metaSnapshotSources)
      .innerJoin(metaSnapshots, eq(metaSnapshotSources.snapshotId, metaSnapshots.id))
      .innerJoin(
        metaApiReleaseSetSnapshots,
        eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
      )
      .innerJoin(
        metaApiReleaseSets,
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
      )
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .where(
        and(
          eq(metaSnapshotSources.sourceReleaseId, releaseId),
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
        eq(metaApiReleaseSets.status, 'current'),
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
      status: 'current',
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
      resourceType: ResourceType
      snapshotId: string
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
      apiVersion: metaApiVersions.code,
      id: metaApiReleaseSets.id,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      schemaVersion: metaApiReleaseSets.schemaVersion,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiReleaseSets.id, args.releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new Error(`Release set not found: ${args.releaseSetId}`)
  }

  const snapshot = await db
    .select({
      id: metaSnapshots.id,
      code: metaSnapshots.code,
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
        eq(metaApiReleaseSets.status, 'current'),
        ne(metaApiReleaseSets.id, args.releaseSetId),
      ),
    )
    .all()

  const existingReleaseSetSnapshots = await db
    .select({
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
      role: metaApiReleaseSetSnapshots.role,
      isRequired: metaApiReleaseSetSnapshots.isRequired,
      selectionMode: metaApiReleaseSetSnapshots.selectionMode,
      anchorSnapshotId: metaApiReleaseSetSnapshots.anchorSnapshotId,
    })
    .from(metaApiReleaseSetSnapshots)
    .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId))
    .all()

  const releaseSetSnapshots = new Map<
    string,
    {
      anchorSnapshotId: string | null
      isRequired: boolean
      role: string
      selectionMode: string
    }
  >()

  for (const snapshot of existingReleaseSetSnapshots) {
    releaseSetSnapshots.set(snapshot.snapshotId, {
      role: snapshot.role,
      isRequired: Boolean(snapshot.isRequired),
      selectionMode: snapshot.selectionMode,
      anchorSnapshotId: snapshot.anchorSnapshotId ?? null,
    })
  }

  for (const snapshot of args.carriedSnapshots) {
    releaseSetSnapshots.set(snapshot.snapshotId, {
      role: 'supporting',
      isRequired: true,
      selectionMode: 'carry_forward_optional',
      anchorSnapshotId: args.snapshotId,
    })
  }

  releaseSetSnapshots.set(args.snapshotId, {
    role: 'primary',
    isRequired: true,
    selectionMode: 'exact_ref',
    anchorSnapshotId: null,
  })

  const publishedAt = new Date(args.publishedAt)

  const releaseSetSnapshotIds = [...releaseSetSnapshots.keys()]
  const sourceSchemaRows = await db
    .select({
      datasetCode: metaDatasets.code,
      source: metaPublishers.code,
      sourceSchemaVersion: metaReleases.sourceSchemaVersion,
      sourceVersion: metaReleases.sourceVersion,
    })
    .from(metaSnapshotSources)
    .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .innerJoin(metaReleases, eq(metaSnapshotSources.sourceReleaseId, metaReleases.id))
    .where(inArray(metaSnapshotSources.snapshotId, releaseSetSnapshotIds))
    .all()

  const sourceSchemas = new Map<string, string>()

  for (const row of sourceSchemaRows) {
    const sourceSchemaVersion = resolveSourceSchemaVersion({
      source: row.source,
      sourceVersion: row.sourceVersion,
      storedSourceSchemaVersion: row.sourceSchemaVersion,
    })
    const current = sourceSchemas.get(row.datasetCode)

    if (current && current !== sourceSchemaVersion) {
      throw new Error(
        `Conflicting source schema versions found for dataset ${row.datasetCode}: ${current} and ${sourceSchemaVersion}.`,
      )
    }

    sourceSchemas.set(row.datasetCode, sourceSchemaVersion)
  }

  const resolvedApiFieldFixture = resolveApiFieldFixture({
    apiVersion: releaseSet.apiVersion,
    snapshotVersion: snapshot.code,
    schemaVersion: releaseSet.schemaVersion,
    rulesetVersion: releaseSet.rulesetVersion,
    sourceSchemas: Object.fromEntries(sourceSchemas),
  })

  // Some API families do not have bundled field provenance fixtures yet.
  const apiFieldProvenanceRows = resolvedApiFieldFixture
    ? await (async () => {
        const sourceDatasetCodes = [
          ...new Set(
            resolvedApiFieldFixture.fields.map(field => field.sourceDatasetCode),
          ),
        ]
        const sourceDatasets = await db
          .select({
            code: metaDatasets.code,
            id: metaDatasets.id,
          })
          .from(metaDatasets)
          .where(inArray(metaDatasets.code, sourceDatasetCodes))
          .all()
        const sourceDatasetIdsByCode = new Map(
          sourceDatasets.map(dataset => [dataset.code, dataset.id]),
        )

        return resolvedApiFieldFixture.fields.map(field => {
          const sourceDatasetId = sourceDatasetIdsByCode.get(field.sourceDatasetCode)

          if (!sourceDatasetId) {
            throw new Error(`Source dataset not found: ${field.sourceDatasetCode}`)
          }

          return {
            apiReleaseSetId: args.releaseSetId,
            apiField: field.apiField,
            sourceDatasetId,
            sourceFieldPath: field.sourceFieldPath,
            resolverCode: field.resolverCode,
            contributionType: field.contributionType,
            priority: field.priority,
            confidence: field.confidence ?? null,
            versionHash: computeVersionHash({
              apiField: field.apiField,
              apiReleaseSetId: args.releaseSetId,
              confidence: field.confidence ?? null,
              contributionType: field.contributionType,
              fixtureVersionHash: resolvedApiFieldFixture.versionHash,
              priority: field.priority,
              resolverCode: field.resolverCode,
              sourceDatasetCode: field.sourceDatasetCode,
              sourceFieldPath: field.sourceFieldPath,
            }),
            createdAt: publishedAt,
            updatedAt: publishedAt,
          }
        })
      })()
    : []

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

    statements.push(
      tx
        .delete(metaApiReleaseSetSnapshots)
        .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, args.releaseSetId)),
      tx
        .update(metaApiReleaseSets)
        .set({
          status: 'current',
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
      tx
        .delete(metaApiFieldProvenance)
        .where(eq(metaApiFieldProvenance.apiReleaseSetId, args.releaseSetId)),
    )

    for (const [snapshotId, snapshotMetadata] of releaseSetSnapshots.entries()) {
      statements.push(
        tx
          .insert(metaApiReleaseSetSnapshots)
          .values({
            apiReleaseSetId: args.releaseSetId,
            snapshotId,
            role: snapshotMetadata.role,
            isRequired: snapshotMetadata.isRequired,
            selectionMode: snapshotMetadata.selectionMode,
            anchorSnapshotId: snapshotMetadata.anchorSnapshotId,
            createdAt: publishedAt,
          })
          .onConflictDoUpdate({
            target: [
              metaApiReleaseSetSnapshots.apiReleaseSetId,
              metaApiReleaseSetSnapshots.snapshotId,
            ],
            set: {
              role: snapshotMetadata.role,
              isRequired: snapshotMetadata.isRequired,
              selectionMode: snapshotMetadata.selectionMode,
              anchorSnapshotId: snapshotMetadata.anchorSnapshotId,
            },
          }),
      )
    }

    for (const row of apiFieldProvenanceRows) {
      statements.push(tx.insert(metaApiFieldProvenance).values(row))
    }

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

export async function resolveShardForTypeRegionYear(
  db: HarbourReadableDb,
  shardType: Extract<DataShardType, 'current' | 'history' | 'source'>,
  environment: 'preview' | 'production',
  regionCode?: string,
  year?: string,
): Promise<DataShardRecord | null> {
  if (shardType === 'current') {
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
            eq(metaDataShards.shardType, shardType),
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
    eq(metaDataShards.shardType, shardType),
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
  options: {
    anchorReleaseId?: string | null
    selectedByRule?: string | null
    selectionMode?: string | null
    sourceCohortKey?: string | null
  } = {},
) {
  await db
    .insert(metaSnapshotSources)
    .values({
      snapshotId,
      datasetId,
      sourceReleaseId,
      role,
      anchorReleaseId: options.anchorReleaseId ?? null,
      selectedByRule: options.selectedByRule ?? null,
      selectionMode: options.selectionMode ?? null,
      sourceCohortKey: options.sourceCohortKey ?? null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [metaSnapshotSources.snapshotId, metaSnapshotSources.sourceReleaseId],
      set: {
        datasetId,
        role,
        anchorReleaseId: options.anchorReleaseId ?? null,
        selectedByRule: options.selectedByRule ?? null,
        selectionMode: options.selectionMode ?? null,
        sourceCohortKey: options.sourceCohortKey ?? null,
      },
    })
    .run()
}

export async function upsertApiReleaseSetSnapshot(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotId: string,
  options: {
    anchorSnapshotId?: string | null
    isRequired?: boolean
    role?: string
    selectionMode?: string
  } = {},
) {
  await db
    .insert(metaApiReleaseSetSnapshots)
    .values({
      apiReleaseSetId: releaseSetId,
      snapshotId,
      role: options.role ?? 'supporting',
      isRequired: options.isRequired ?? true,
      selectionMode: options.selectionMode ?? 'carry_forward_optional',
      anchorSnapshotId: options.anchorSnapshotId ?? null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaApiReleaseSetSnapshots.snapshotId,
      ],
      set: {
        role: options.role ?? 'supporting',
        isRequired: options.isRequired ?? true,
        selectionMode: options.selectionMode ?? 'carry_forward_optional',
        anchorSnapshotId: options.anchorSnapshotId ?? null,
      },
    })
    .run()
}

export async function deleteApiReleaseSetSnapshot(
  db: HarbourWritableDb,
  releaseSetId: string,
  snapshotId: string,
) {
  await db
    .delete(metaApiReleaseSetSnapshots)
    .where(
      and(
        eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId),
        eq(metaApiReleaseSetSnapshots.snapshotId, snapshotId),
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
      snapshotResourceType: metaSnapshots.resourceType,
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
    })
    .from(metaApiReleaseSetSnapshots)
    .innerJoin(
      metaSnapshots,
      eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
    )
    .where(eq(metaApiReleaseSetSnapshots.apiReleaseSetId, releaseSetId))
    .all()
}

export async function listCurrentSnapshotCleanupCandidates(
  db: HarbourReadableDb,
  options: {
    resourceType?: ResourceType
    snapshotIds?: string[]
  } = {},
) {
  const snapshotConditions = [ne(metaSnapshots.status, 'archived')]

  if (options.resourceType) {
    snapshotConditions.push(eq(metaSnapshots.resourceType, options.resourceType))
  }

  if (options.snapshotIds && options.snapshotIds.length > 0) {
    snapshotConditions.push(inArray(metaSnapshots.id, options.snapshotIds))
  }

  const snapshots = await db
    .select({
      snapshotId: metaSnapshots.id,
      resourceType: metaSnapshots.resourceType,
    })
    .from(metaSnapshots)
    .where(and(...snapshotConditions))
    .all()

  if (snapshots.length === 0) {
    return []
  }

  const protectedRows = await db
    .select({
      snapshotId: metaApiReleaseSetSnapshots.snapshotId,
    })
    .from(metaApiReleaseSetSnapshots)
    .innerJoin(
      metaApiReleaseSets,
      eq(metaApiReleaseSetSnapshots.apiReleaseSetId, metaApiReleaseSets.id),
    )
    .where(ne(metaApiReleaseSets.status, 'archived'))
    .all()
  const protectedSnapshotIds = new Set(protectedRows.map(row => row.snapshotId))

  return snapshots.filter(row => !protectedSnapshotIds.has(row.snapshotId))
}

export async function resolveActiveSnapshotForType(
  db: HarbourReadableDb,
  type: SupportedType,
  resourceType: ResourceType,
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
      .innerJoin(
        metaSnapshots,
        eq(metaApiReleaseSetSnapshots.snapshotId, metaSnapshots.id),
      )
      .where(
        and(
          eq(metaApiReleaseSetSnapshots.apiReleaseSetId, activeReleaseSet.id),
          eq(metaSnapshots.resourceType, resourceType),
        ),
      )
      .limit(1)
      .get()) ?? null
  )
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
    })
    .onConflictDoNothing()
    .run()
}

export async function insertIngestRun(
  db: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  phase: string,
  status: IngestRunStatus,
  stats: Record<string, unknown> | string | null,
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
      stats: normalizeOptionalJsonText(stats),
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
  stats: Record<string, unknown> | string | null,
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
      stats: normalizeOptionalJsonText(stats),
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
        stats: normalizeOptionalJsonText(stats),
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
      stats: normalizeOptionalJsonText(stats),
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
  stats: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const startedAtDate = new Date(startedAt)
  const updatedAt = new Date(finishedAt ?? startedAt)
  const normalizedStats = normalizeOptionalJsonText(stats)

  await db
    .insert(ingestRuns)
    .values({
      runId: crypto.randomUUID(),
      releaseId,
      phase,
      status,
      stats: normalizedStats,
      error,
      startedAt,
      finishedAt,
      createdAt: startedAtDate,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [ingestRuns.releaseId, ingestRuns.phase],
      set: {
        status,
        stats: normalizedStats,
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
  stats: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const normalizedStats = normalizeOptionalJsonText(stats)
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
      stats: normalizedStats,
      error,
      finishedAt,
      updatedAt: new Date(finishedAt),
    })
    .where(eq(ingestRuns.runId, openRun.runId))
    .run()

  return true
}

function normalizeOptionalJsonText(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> | string | null {
  if (!value || typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return value
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
