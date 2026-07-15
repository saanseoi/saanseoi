import type { DatasetProcessingMessage, RegionCode, ResourceType } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  upsertReleaseShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
  normalizeDivisionAreaGeometryRow,
  normalizeDivisionBoundaryGeometryRow,
} from '@repo/core/pipeline/services/divisionGeometry'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'

import type { PreparedUploadFile } from '../parquetRepack.ts'
import type { UploadTarget } from '../options.ts'
import { createHarbourControlClient } from '../harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { LocalPipelineBucket } from '../addressSql/localBucket.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type GeometryUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source: 'overture' | 'hkgov-had'
  sourceVersion: string
  theme: 'divisions'
  type: 'divisionArea' | 'divisionBoundary'
}

type NormalizedGeometry = ReturnType<
  typeof normalizeDivisionAreaGeometryRow | typeof normalizeDivisionBoundaryGeometryRow
>

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`

/**
 * Imports Overture division area/boundary parquet into the source, history and
 * current geometry tables. Geometry releases are complete snapshots: rows no
 * longer present are closed and the draft snapshot is rebuilt on retry.
 */
export async function processLocalDivisionGeometrySqlUpload(
  target: UploadTarget,
  previewPlan: GeometryUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { skipSnapshotCleanup?: boolean } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const datasetId = requireString(uploadResult.datasetId, 'datasetId')
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)

  const dbContext = await resolveLocalAddressDbContext(
    target,
    previewPlan.regionCode,
    shardYear,
    {
      cacheTableProfile: target.remote ? undefined : 'divisionGeometry',
      includePreviousShardYears: true,
      refreshRemoteTables: false,
    },
  )
  let controlClient: HarbourClient | null = null

  try {
    await syncStagedReleaseIntoLocalMetaCache(
      dbContext.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )

    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const client = target.remote
      ? remoteClient
      : createLocalControlClient(
          dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
          { publishClient: remoteClient },
        )
    controlClient = client
    const message: DatasetProcessingMessage = {
      datasetId,
      datasetCode,
      rawObjectKey,
      releaseCode,
      releaseId,
      regionCode: previewPlan.regionCode,
      shardYear,
      cohortKey: previewPlan.cohortKey,
      source: previewPlan.source,
      sourceVersion: previewPlan.sourceVersion,
      theme: previewPlan.theme,
      type: previewPlan.type,
      processingMode: 'sql',
      ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
    }

    await client.stageRunning(
      releaseId,
      'processDataset',
      {
        resourceType: previewPlan.type,
        rowCount: previewPlan.rowCount,
      },
      releaseCode,
    )

    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, previewPlan.type, {
      regionCode: previewPlan.regionCode,
      cohortKey: previewPlan.cohortKey,
    })
    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${releaseId}`)
    }
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      'primary',
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'snapshot-assembly-division-geometry-v1',
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: previewPlan.type,
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: 'primary',
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })
    const historyShard = await resolveShardForTypeRegionYear(
      metaDb,
      'history',
      target.remote ? 'production' : 'preview',
      previewPlan.regionCode,
      shardYear,
    )
    if (historyShard) {
      await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)
    }

    const file = await createAsyncBufferFromR2(bucket, rawObjectKey)
    const normalized: Array<NonNullable<NormalizedGeometry>> = []
    let rejectedRows = 0
    const hadBridge =
      previewPlan.source === 'hkgov-had'
        ? new Map(
            (
              await metaDb
                .select({
                  externalId: metaSchema.metaIdentifierBridges.externalId,
                  canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
                })
                .from(metaSchema.metaIdentifierBridges)
                .where(
                  and(
                    eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
                    eq(
                      metaSchema.metaIdentifierBridges.cohortKey,
                      previewPlan.cohortKey,
                    ),
                    eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
                    eq(metaSchema.metaIdentifierBridges.authority, previewPlan.source),
                  ),
                )
                .all()
            ).map(row => [row.externalId, row.canonicalId]),
          )
        : null
    for await (const batch of readParquetObjectsInBatches(file, 8192)) {
      for (const row of batch) {
        try {
          const sourceRow =
            previewPlan.source === 'hkgov-had'
              ? normalizeHkgovHadInputRow(row, hadBridge)
              : row
          const value =
            previewPlan.type === 'divisionArea'
              ? normalizeDivisionAreaGeometryRow(sourceRow, previewPlan.source)
              : normalizeDivisionBoundaryGeometryRow(sourceRow, previewPlan.source)
          if (value) normalized.push(value as NonNullable<NormalizedGeometry>)
        } catch (error) {
          rejectedRows += 1
          throw error
        }
      }
    }

    await assertDivisionReferences(
      dbContext.currentDb,
      metaDb,
      previewPlan.regionCode,
      previewPlan.cohortKey,
      previewPlan.type,
      normalized,
    )

    await writeGeometryRows(dbContext, previewPlan.type, normalized, {
      source: previewPlan.source,
      releaseId,
      releaseCode,
      snapshotId: snapshot.id,
      cohortKey: previewPlan.cohortKey,
    })

    await replaceDatasetStats(
      metaDb,
      releaseId,
      buildGeometryStats(previewPlan.type, normalized, previewPlan.source),
    )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        resourceType: previewPlan.type,
        sourceRows: previewPlan.rowCount,
        importedRows: normalized.length,
        rejectedRows,
      },
      releaseCode,
    )
    await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    return { snapshotId: snapshot.id, importedRows: normalized.length }
  } catch (error) {
    const failureClient =
      controlClient ?? (createHarbourControlClient(target) as HarbourClient)
    await failureClient
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    dbContext.cleanup()
  }
}

function normalizeHkgovHadInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const areaId = typeof row.area_id === 'string' ? row.area_id.trim() : ''
  const divisionId = areaId ? bridge?.get(areaId) : undefined
  if (!areaId || !divisionId) {
    throw new Error(
      `HAD district area ${areaId || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `HAD:${areaId}`,
    division_id: divisionId,
    sources:
      Array.isArray(row.sources) && row.sources.length > 0
        ? row.sources
        : [{ dataset: 'hkgov-had', areaId }],
  }
}

async function assertDivisionReferences(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  regionCode: RegionCode,
  cohortKey: string,
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalizedGeometry>>,
) {
  const divisionSnapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'division',
    regionCode,
    cohortKey,
  )
  if (!divisionSnapshot) {
    throw new Error(
      `No published division snapshot exists for ${regionCode}/${cohortKey}; geometry references cannot be validated.`,
    )
  }
  const divisionRows = await currentDb
    .select({ id: currentSchema.divisions.id })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, divisionSnapshot.id))
    .all()
  const knownIds = new Set(divisionRows.map(row => row.id))
  const references = rows.flatMap(row => {
    const canonical = row.canonical as {
      divisionId?: string
      leftDivisionId?: string
      rightDivisionId?: string
    }
    return type === 'divisionArea'
      ? canonical.divisionId
        ? [canonical.divisionId]
        : []
      : [canonical.leftDivisionId, canonical.rightDivisionId].filter(
          (id): id is string => Boolean(id),
        )
  })
  const missing = [...new Set(references.filter(id => !knownIds.has(id)))]
  if (missing.length > 0) {
    throw new Error(
      `Division geometry references ${missing.length} division IDs absent from the ${cohortKey} division snapshot.`,
    )
  }
}

async function writeGeometryRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalizedGeometry>>,
  version: {
    source: GeometryUploadPlan['source']
    releaseId: string
    releaseCode: string
    snapshotId: string
    cohortKey: string
  },
) {
  const now = toIsoTimestamp()
  const currentTable =
    type === 'divisionArea'
      ? currentSchema.divisionAreas
      : currentSchema.divisionBoundaries
  const historyTable =
    type === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const sourceTable =
    type === 'divisionArea'
      ? version.source === 'hkgov-had'
        ? sourceSchema.sourceHkgovHadDivisionAreas
        : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries

  await context.currentDb
    .delete(currentTable)
    .where(
      and(
        eq(currentTable.snapshotId, version.snapshotId),
        eq(currentTable.variant, version.source),
      ),
    )
    .run()
  const historyHashes = new Map<string, string>()
  const sourceHashes = new Map<string, string>()
  for (const row of rows) {
    historyHashes.set(row.canonical.id, await hashDivisionGeometryRow(row.canonical))
    sourceHashes.set(
      row.source.sourceRecordId,
      await hashDivisionGeometrySourceRow(row.source),
    )
  }
  await closeChangedRows(
    context.historyDb,
    historyTable,
    historyTable.id,
    historyHashes,
    {
      isCurrent: false,
      validToSnapshotId: version.snapshotId,
      validToCohortKey: version.cohortKey,
    },
  )
  await closeChangedRows(
    context.sourceDb,
    sourceTable,
    sourceTable.sourceRecordId,
    sourceHashes,
    { isCurrent: false, validToRelease: version.releaseCode },
  )

  const currentRows = rows.map(row => ({
    ...row.canonical,
    snapshotId: version.snapshotId,
    createdAt: now,
    updatedAt: now,
  }))
  const historyRows = await Promise.all(
    rows.map(async row => ({
      ...row.canonical,
      versionHash: await hashDivisionGeometryRow(row.canonical),
      sourceReleaseId: version.releaseId,
      snapshotId: version.snapshotId,
      isCurrent: true,
      validFromSnapshotId: version.snapshotId,
      validToSnapshotId: null,
      validFromCohortKey: version.cohortKey,
      validToCohortKey: null,
      createdAt: now,
      updatedAt: now,
    })),
  )
  const sourceRows = await Promise.all(
    rows.map(async row => ({
      ...row.source,
      ...(version.source === 'hkgov-had'
        ? {
            objectId: (row.source.rawProperties as Record<string, unknown> | null)
              ?.object_id,
            cdsiAdminAreaId: (
              row.source.rawProperties as Record<string, unknown> | null
            )?.csdi_admin_area_id,
            areaType: (row.source.rawProperties as Record<string, unknown> | null)
              ?.area_type,
            areaId: (row.source.rawProperties as Record<string, unknown> | null)
              ?.area_id,
            areaCode: (row.source.rawProperties as Record<string, unknown> | null)
              ?.area_code,
            sourceCrs: (row.source.rawProperties as Record<string, unknown> | null)
              ?.source_crs,
            sourceGeometry: (row.source.rawProperties as Record<string, unknown> | null)
              ?.source_geometry,
          }
        : {}),
      versionHash: await hashDivisionGeometrySourceRow(row.source),
      releaseId: version.releaseId,
      validFromRelease: version.releaseCode,
      validToRelease: null,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )

  for (const chunk of chunkRows(currentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .run()
  }
  if (historyRows.length) {
    for (const chunk of chunkRows(historyRows)) {
      await context.historyDb
        .insert(historyTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [historyTable.id, historyTable.versionHash],
          set: {
            sourceReleaseId: version.releaseId,
            snapshotId: version.snapshotId,
            isCurrent: true,
            validFromSnapshotId: version.snapshotId,
            validToSnapshotId: null,
            validFromCohortKey: version.cohortKey,
            validToCohortKey: null,
            updatedAt: now,
          },
        })
        .run()
    }
  }
  if (sourceRows.length) {
    for (const chunk of chunkRows(sourceRows)) {
      await context.sourceDb
        .insert(sourceTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [sourceTable.sourceRecordId, sourceTable.versionHash],
          set: {
            releaseId: version.releaseId,
            validFromRelease: version.releaseCode,
            validToRelease: null,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
    }
  }
}

function chunkRows<T>(rows: T[], size = 32) {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function closeChangedRows(
  db: any,
  table: any,
  idColumn: any,
  currentHashes: Map<string, string>,
  values: Record<string, unknown>,
) {
  const existing = await db
    .select({ id: idColumn, versionHash: table.versionHash })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  for (const row of existing) {
    if (currentHashes.get(row.id) === row.versionHash) continue
    await db.update(table).set(values).where(eq(idColumn, row.id)).run()
  }
}

function statRow(
  type: ResourceType,
  dimension: string,
  metric: string,
  value: number,
): {
  type: ResourceType
  dimension: string
  metric: string
  metricUnit: string
  value: number
  groupBy: string | null
  groupValue: string | null
} {
  return {
    type,
    dimension,
    metric,
    metricUnit: 'rows',
    value,
    groupBy: null,
    groupValue: null,
  }
}

function buildGeometryStats(
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalizedGeometry>>,
  source: GeometryUploadPlan['source'],
) {
  const stats = [
    {
      ...statRow(type, 'records', 'count', rows.length),
      groupBy: 'table',
      groupValue: type === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries',
    },
  ]
  const byType = new Map<string, number>()
  const byFlags = new Map<string, number>()
  stats.push({
    ...statRow(type, 'records', 'count', rows.length),
    groupBy: 'source',
    groupValue: source,
  })
  for (const row of rows) {
    byType.set(row.canonical.type, (byType.get(row.canonical.type) ?? 0) + 1)
    const flags = `${row.canonical.isLand === true ? 'land' : 'not-land'}:${row.canonical.isTerritorial === true ? 'territorial' : 'not-territorial'}`
    byFlags.set(flags, (byFlags.get(flags) ?? 0) + 1)
  }
  for (const [groupValue, value] of byType) {
    stats.push({
      ...statRow(type, 'records', 'count', value),
      groupBy: 'type',
      groupValue,
    })
  }
  for (const [groupValue, value] of byFlags) {
    stats.push({
      ...statRow(type, 'records', 'count', value),
      groupBy: 'land_territorial_flags',
      groupValue,
    })
  }
  return stats
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Missing ${name}.`)
  return value
}
