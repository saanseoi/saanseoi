import { and, eq, inArray } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'comment-json'

import type { RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { calculateGeoJsonBbox } from '@repo/core/pipeline/geojson'
import { parseWkbGeometry } from '@repo/core/pipeline/services/division'
import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
} from '@repo/core/pipeline/utils'
import {
  currentSchema,
  historySchema,
  metaSchema,
  sourceSchema,
  toIsoTimestamp,
} from '@repo/db'
import {
  buildSqlPipelineArtefactKey,
  writeTextArtefact,
} from '@repo/core/pipeline/services/pipelineArtefacts'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import {
  importSqlArtefactKeys,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { LocalPipelineBucket } from '../addressSql/localBucket.ts'
import {
  buildReleaseUploadDbCacheScopeKey,
  refreshRemoteMetaCache,
  replayRemoteCacheWithRetry,
  resetRemoteReleaseUploadCacheScope,
  resolveSharedRemoteDbCacheDir,
  resolveLocalAddressDbContext,
  resolveShardBindingName,
  type LocalAddressDbContext,
} from '../addressSql/localDbCache.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type HkgovPlandDivisionUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source: 'hkgov-pland-pu' | 'hkgov-pland-new-town'
  sourceVersion: string
  theme: 'divisions'
  type: 'division'
}

type PreparedDivision = {
  base: {
    bbox: unknown
    cartography: null
    geometry: unknown
    hierarchy: unknown
    id: string
    identifiers: unknown
    level: number
    sourceKeys: Record<string, unknown>
    sources: Record<string, unknown>
    type: string
    wikidata: null
  }
  cells: Array<{
    ppuCode: string
    rawProperties: unknown
    repairedGeometry: unknown
    sourceRecordId: string
    sourceGeometry: unknown
    spuCode: string
    subunitCode: string
    tpuCode: string
    wasGeometryRepaired: boolean
  }>
  i18n: Array<{ locale: string; name: string }>
  newTown: null | {
    nameEn: string
    nameZhHans: string
    nameZhHant: string
    rawProperties: unknown
    repairedGeometry: unknown
    sourceGeometry: unknown
    sourceRecordId: string
    wasGeometryRepaired: boolean
  }
  raw: Record<string, unknown>
  sourceCellIds: unknown
  versionHash: string
}

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`
const PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE = 'primary'
const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024

export async function processLocalHkgovPlandDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: HkgovPlandDivisionUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { skipSnapshotCleanup?: boolean } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const cacheTableProfile = 'division'
  const remoteCacheScopeKey = target.remote
    ? buildReleaseUploadDbCacheScopeKey({
        cacheTableProfile,
        cohortKey: previewPlan.cohortKey,
        regionCode: previewPlan.regionCode,
        shardYear,
        source: previewPlan.source,
        sourceVersion: previewPlan.sourceVersion,
        theme: previewPlan.theme,
        type: previewPlan.type,
      })
    : undefined

  if (remoteCacheScopeKey) {
    await resetRemoteReleaseUploadCacheScope(
      target,
      remoteCacheScopeKey,
      cacheTableProfile,
    )
  }

  const context = await resolveLocalAddressDbContext(
    target,
    previewPlan.regionCode,
    previewPlan.sourceVersion,
    {
      cacheTableProfile,
      includePreviousShardYears: true,
      remoteCacheScopeKey,
    },
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = (
    target.remote
      ? createHarbourControlClient(target)
      : createLocalControlClient(metaDb, {
          publishClient: createHarbourControlClient(target) as HarbourClient,
        })
  ) as HarbourClient

  try {
    await syncStagedReleaseIntoLocalMetaCache(
      context.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'division', rowCount: previewPlan.rowCount },
      releaseCode,
    )

    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) throw new Error(`Release not found: ${releaseId}`)
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'division', {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      identityMode:
        previewPlan.source === 'hkgov-pland-new-town' ? 'cohort_scoped' : 'persistent',
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: previewPlan.source,
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: `snapshot-assembly-${previewPlan.source}-division-v1`,
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'division',
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })
    const [historyShard, sourceShard] = await Promise.all([
      resolveShardForTypeRegionYear(
        metaDb,
        'history',
        target.remote ? 'production' : 'preview',
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
      resolveShardForTypeRegionYear(
        metaDb,
        'source',
        target.remote ? 'production' : 'preview',
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
    ])
    if (!historyShard || !sourceShard) {
      throw new Error(
        `Shard mapping not found for ${previewPlan.regionCode}/${previewPlan.sourceVersion}.`,
      )
    }
    await Promise.all([
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id),
      upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id),
    ])

    const records = await readPreparedDivisions(bucket, rawObjectKey)
    validatePreparedDivisions(records, previewPlan.rowCount)
    const now = toIsoTimestamp()
    const nativeSourceTable =
      previewPlan.source === 'hkgov-pland-new-town'
        ? sourceSchema.sourceHkgovPlandNewTowns
        : sourceSchema.sourceHkgovPlandPlanningCells
    const currentNativeRows = await context.sourceDb
      .select({
        sourceRecordId: nativeSourceTable.sourceRecordId,
        versionHash: nativeSourceTable.versionHash,
      })
      .from(nativeSourceTable)
      .where(eq(nativeSourceTable.isCurrent, true))
      .all()
    const currentHistoryRows = await listCurrentHistoryRows(
      context.historyDb as unknown as HarbourReadableDb,
      previewPlan.source,
    )
    const historyHashById = new Map(
      currentHistoryRows.map(row => [row.id, row.versionHash]),
    )
    const nativeSourceHashById = new Map(
      currentNativeRows.map(row => [row.sourceRecordId, row.versionHash]),
    )
    const ids = new Set(records.map(record => record.base.id))
    const changedHistoryIds = records
      .filter(record => historyHashById.get(record.base.id) !== record.versionHash)
      .map(record => record.base.id)
    const missingHistoryIds = currentHistoryRows
      .map(row => row.id)
      .filter(id => !ids.has(id))
    const nativeRecords =
      previewPlan.source === 'hkgov-pland-new-town'
        ? records.flatMap(record => (record.newTown ? [record.newTown] : []))
        : records.flatMap(record => record.cells)
    const nativeHashes = await Promise.all(
      nativeRecords.map(
        async record => [record.sourceRecordId, await createHash(record)] as const,
      ),
    )
    const nativeHashById = new Map(nativeHashes)
    const incomingNativeIds = new Set(nativeHashById.keys())
    const changedNativeIds = nativeRecords
      .filter(
        record =>
          nativeSourceHashById.get(record.sourceRecordId) !==
          nativeHashById.get(record.sourceRecordId),
      )
      .map(record => record.sourceRecordId)
    const missingNativeIds = currentNativeRows
      .map(row => row.sourceRecordId)
      .filter(id => !incomingNativeIds.has(id))

    await closeHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      [...changedHistoryIds, ...missingHistoryIds],
      snapshot.id,
      previewPlan.cohortKey,
      now,
    )
    await closeNativeSourceRows(
      context.sourceDb as unknown as HarbourWritableDb,
      nativeSourceTable,
      [...changedNativeIds, ...missingNativeIds],
      releaseCode,
      now,
    )
    await replaceCurrentSnapshot(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      records,
      currentHistoryRows.map(row => row.id),
      now,
    )
    await replaceCurrentI18n(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      records,
      currentHistoryRows.map(row => row.id),
      now,
    )
    await insertHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      snapshot.id,
      releaseId,
      previewPlan.cohortKey,
      records.filter(record => changedHistoryIds.includes(record.base.id)),
      now,
    )
    await insertHistoryI18nRows(
      context.historyDb as unknown as HarbourWritableDb,
      snapshot.id,
      releaseId,
      previewPlan.cohortKey,
      records.filter(record => changedHistoryIds.includes(record.base.id)),
      now,
    )
    await insertSourceRows(
      context.sourceDb as unknown as HarbourWritableDb,
      releaseId,
      releaseCode,
      nativeRecords.filter(record => changedNativeIds.includes(record.sourceRecordId)),
      previewPlan.source,
      now,
    )
    const repairedGeometryRecords = records.filter(wasPlanningGeometryRepaired)
    await replaceReleaseProcessingActions(
      metaDb,
      releaseId,
      repairedGeometryRecords.length > 0
        ? [
            {
              action: 'planning_geometry_self_intersection_repaired',
              affectedRecordCount: repairedGeometryRecords.length,
              evidence: repairedGeometryRecords.map(record => ({
                canonicalDivision: {
                  id: record.base.id,
                  identifiers: record.base.identifiers,
                  level: record.base.level,
                  sourceKeys: record.base.sourceKeys,
                },
                sourceEvidence:
                  record.cells.length > 0
                    ? record.cells.map(cell => ({
                        rawProperties: cell.rawProperties,
                        sourceRecordId: cell.sourceRecordId,
                      }))
                    : record.newTown
                      ? {
                          rawProperties: record.newTown.rawProperties,
                          sourceRecordId: record.newTown.sourceRecordId,
                        }
                      : null,
              })),
              mode: 'automatic',
              summary:
                'Repaired known Planning Department polygon self-intersections with buffer(0); the native source assertion records the row-keyed approved transform.',
            },
          ]
        : [],
    )
    await replaceDatasetStats(metaDb, releaseId, [
      statRow('records', 'count', records.length, 'canonical_divisions'),
      statRow('source_features', 'count', nativeRecords.length, 'planning_cells'),
      statRow(
        'source_quality',
        'repaired',
        records.filter(wasPlanningGeometryRepaired).length,
        'ring_self_intersection',
      ),
    ])
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        resourceType: 'division',
        sourceRows: previewPlan.rowCount,
        importedRows: records.length,
        changedRows: changedHistoryIds.length,
        deletedRows: missingHistoryIds.length,
      },
      releaseCode,
    )
    const sqlManifest = await writePlandSqlArtefacts(bucket, context, previewPlan, {
      changedHistoryIds,
      changedNativeIds,
      missingHistoryIds,
      missingNativeIds,
      releaseId,
      releaseCode,
      records,
      snapshotId: snapshot.id,
    })
    const importOptions = resolvePlandImportOptions(target, context)
    const importTargets = resolvePlandImportTargets(context, previewPlan.sourceVersion)

    await importPlandSqlArtefacts(
      bucket,
      sqlManifest,
      importTargets,
      importOptions,
      client,
      releaseId,
      releaseCode,
    )
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    published = true

    if (target.remote) {
      await replayPlandSqlIntoSharedCache(
        target,
        bucket,
        sqlManifest,
        previewPlan,
        importOptions,
        releaseCode,
      )
    }
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    if (!published) {
      await client
        .stageFailed(
          releaseId,
          'processDataset',
          error instanceof Error ? error.message : String(error),
          undefined,
          releaseCode,
        )
        .catch(() => undefined)
    }
    throw error
  } finally {
    context.cleanup()
  }
}

async function listCurrentHistoryRows(
  db: HarbourReadableDb,
  source: HkgovPlandDivisionUploadPlan['source'],
) {
  const rows = await db
    .select({
      id: historySchema.divisions.id,
      sources: historySchema.divisions.sources,
      versionHash: historySchema.divisions.versionHash,
    })
    .from(historySchema.divisions)
    .where(eq(historySchema.divisions.isCurrent, true))
    .all()
  return rows.filter(row => {
    const sources = row.sources as Record<string, unknown>
    const pland = sources.hkgovPland
    return (
      Array.isArray(pland) &&
      pland.some(
        item =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).sourceVersion !== undefined &&
          (source === 'hkgov-pland-new-town'
            ? (item as Record<string, unknown>).planningLevel === 'newtown'
            : (item as Record<string, unknown>).planningLevel !== 'newtown'),
      )
    )
  })
}

async function readPreparedDivisions(bucket: LocalPipelineBucket, key: string) {
  const file = await createAsyncBufferFromR2(bucket, key)
  const records: PreparedDivision[] = []
  for await (const batch of readParquetObjectsInBatches(file, 512)) {
    for (const raw of batch) records.push(await normalisePreparedDivision(raw))
  }
  return records
}

async function normalisePreparedDivision(value: Record<string, unknown>) {
  const id = requireString(value.id, 'id')
  const level = requireString(value.planning_level, 'planning_level')
  const sourceProperties = asRecord(value.source_properties)
  const identifiers = asRecord(value.identifiers)
  const sourceCellIds = value.source_cell_ids ?? []
  const i18n = normaliseI18n(value.i18n)
  const geometry = parseWkbGeometry(value.geometry)
  if (!geometry) throw new Error(`Planning division ${id} has invalid geometry.`)
  const base = {
    bbox: calculateGeoJsonBbox(geometry),
    cartography: null,
    geometry,
    hierarchy: value.hierarchy ?? [],
    id,
    identifiers,
    level: levelNumber(level),
    sourceKeys: { hkgovPland: identifiers },
    sources: {
      hkgovPland: [{ sourceVersion: value.source_version, planningLevel: level }],
    },
    type: `planning-${level}`,
    wikidata: null,
  }
  const versionHash = await createHash(base)
  const cells =
    level === 'subunit' ? normalisePlanningCells(sourceProperties.sourceFeatures) : []
  const newTown =
    level === 'newtown' ? normaliseNewTown(sourceProperties, i18n, geometry) : null
  return {
    base,
    cells,
    i18n,
    newTown,
    raw: value,
    sourceCellIds,
    versionHash,
  } satisfies PreparedDivision
}

function wasPlanningGeometryRepaired(record: PreparedDivision) {
  return (
    record.cells.some(cell => cell.wasGeometryRepaired) ||
    record.newTown?.wasGeometryRepaired === true ||
    Boolean(
      (record.raw.source_properties as Record<string, unknown> | undefined)
        ?.was_geometry_repaired,
    )
  )
}

function normalisePlanningCells(value: unknown): PreparedDivision['cells'] {
  if (!Array.isArray(value)) {
    throw new Error('Planning subunit source properties require sourceFeatures.')
  }
  return value.map((entry, index) => {
    const cell = asRecord(entry)
    return {
      ppuCode: requireString(cell.ppuCode, `sourceFeatures[${index}].ppuCode`),
      rawProperties: cell.rawProperties ?? null,
      repairedGeometry: cell.repairedGeometry ?? null,
      sourceRecordId: requireString(
        cell.sourceRecordId,
        `sourceFeatures[${index}].sourceRecordId`,
      ),
      sourceGeometry: cell.sourceGeometry ?? null,
      spuCode: requireString(cell.spuCode, `sourceFeatures[${index}].spuCode`),
      subunitCode: requireString(
        cell.subunitCode,
        `sourceFeatures[${index}].subunitCode`,
      ),
      tpuCode: requireString(cell.tpuCode, `sourceFeatures[${index}].tpuCode`),
      wasGeometryRepaired: cell.wasGeometryRepaired === true,
    }
  })
}

function normaliseNewTown(
  sourceProperties: Record<string, unknown>,
  i18n: Array<{ locale: string; name: string }>,
  geometry: unknown,
) {
  const name = (locale: string) =>
    i18n.find(entry => entry.locale === locale)?.name ?? null
  return {
    nameEn: requireString(name('en'), 'New Town English name'),
    nameZhHans: requireString(name('zh-hans'), 'New Town Simplified Chinese name'),
    nameZhHant: requireString(name('zh-hant'), 'New Town Traditional Chinese name'),
    rawProperties: asRecord(sourceProperties.sourceFeature).properties ?? null,
    repairedGeometry: sourceProperties.was_geometry_repaired ? geometry : null,
    sourceGeometry: requireValue(
      sourceProperties.source_geometry,
      'New Town source geometry',
    ),
    sourceRecordId: requireString(sourceProperties.newtown_id, 'newtown_id'),
    wasGeometryRepaired: sourceProperties.was_geometry_repaired === true,
  }
}

function normaliseI18n(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return typeof record.locale === 'string' && typeof record.name === 'string'
      ? [{ locale: record.locale, name: record.name }]
      : []
  })
}

function validatePreparedDivisions(records: PreparedDivision[], expectedCount: number) {
  if (records.length !== expectedCount) {
    throw new Error(
      `Planning Department division parquet expected ${expectedCount} records; found ${records.length}.`,
    )
  }
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.base.id))
      throw new Error(`Duplicate planning division ${record.base.id}.`)
    ids.add(record.base.id)
    for (const parent of record.base.hierarchy as Array<{ division_id?: unknown }>) {
      if (typeof parent.division_id === 'string' && !ids.has(parent.division_id)) {
        // Parent rows are emitted before their children; this guards accidental cross-domain links.
        throw new Error(
          `Planning division ${record.base.id} references unavailable parent ${parent.division_id}.`,
        )
      }
    }
  }
}

async function replaceCurrentSnapshot(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  previousProviderIds: string[],
  now: string,
) {
  const providerIds = [
    ...new Set([...previousProviderIds, ...records.map(record => record.base.id)]),
  ]
  for (const chunk of chunkArray(providerIds, getMaxItemsPerInClause(1, 1))) {
    if (chunk.length === 0) continue
    await db
      .delete(currentSchema.divisions)
      .where(
        and(
          eq(currentSchema.divisions.snapshotId, snapshotId),
          inArray(currentSchema.divisions.id, chunk),
        ),
      )
      .run()
  }
  for (const chunk of chunkArray(records, 6)) {
    await db
      .insert(currentSchema.divisions)
      .values(
        chunk.map(record => ({
          ...record.base,
          snapshotId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run()
  }
}

async function replaceCurrentI18n(
  db: HarbourWritableDb,
  snapshotId: string,
  records: PreparedDivision[],
  previousProviderIds: string[],
  now: string,
) {
  const ids = [
    ...new Set([...previousProviderIds, ...records.map(record => record.base.id)]),
  ]
  for (const chunk of chunkArray(ids, getMaxItemsPerInClause(1, 1))) {
    if (chunk.length === 0) continue
    await db
      .delete(currentSchema.divisionsI18n)
      .where(
        and(
          eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
          inArray(currentSchema.divisionsI18n.divisionId, chunk),
        ),
      )
      .run()
  }
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
      snapshotId,
      divisionId: record.base.id,
      locale: item.locale,
      name: item.name,
      nameVariant: [item.name],
      nameAlts: null,
      nameRules: null,
      isLocaleInferred: false,
      createdAt: now,
      updatedAt: now,
    })),
  )
  for (const chunk of chunkArray(rows, 8)) {
    await db.insert(currentSchema.divisionsI18n).values(chunk).run()
  }
}

async function insertHistoryRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  _cohortKey: string,
  records: PreparedDivision[],
  now: string,
) {
  for (const chunk of chunkArray(records, 4)) {
    await db
      .insert(historySchema.divisions)
      .values(
        chunk.map(record => ({
          ...record.base,
          versionHash: record.versionHash,
          sourceReleaseId: releaseId,
          snapshotId,
          isCurrent: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [historySchema.divisions.id, historySchema.divisions.versionHash],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'division',
    operation: 'upsert',
    changes: records.map(record => ({
      recordId: record.base.id,
      versionHash: record.versionHash,
    })),
  })
}

async function insertHistoryI18nRows(
  db: HarbourWritableDb,
  snapshotId: string,
  releaseId: string,
  _cohortKey: string,
  records: PreparedDivision[],
  now: string,
) {
  const rows = records.flatMap(record =>
    record.i18n.map(item => ({
      divisionId: record.base.id,
      locale: item.locale,
      name: item.name,
      nameVariant: [item.name],
      nameAlts: null,
      nameRules: null,
      isLocaleInferred: false,
      versionHash: record.versionHash,
      sourceReleaseId: releaseId,
      snapshotId,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  for (const chunk of chunkArray(rows, 6)) {
    await db
      .insert(historySchema.divisionsI18n)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          historySchema.divisionsI18n.divisionId,
          historySchema.divisionsI18n.versionHash,
          historySchema.divisionsI18n.locale,
        ],
        set: {
          isCurrent: true,
          snapshotId,
          sourceReleaseId: releaseId,
          updatedAt: now,
        },
      })
      .run()
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId: releaseId,
    recordType: 'divisionI18n',
    operation: 'upsert',
    changes: rows.map(row => ({
      recordId: row.divisionId,
      locale: row.locale,
      versionHash: row.versionHash,
    })),
  })
}

async function insertSourceRows(
  db: HarbourWritableDb,
  releaseId: string,
  releaseCode: string,
  records: Array<
    PreparedDivision['cells'][number] | NonNullable<PreparedDivision['newTown']>
  >,
  source: HkgovPlandDivisionUploadPlan['source'],
  now: string,
) {
  if (source === 'hkgov-pland-pu') {
    const cells = records as PreparedDivision['cells']
    const rows = await Promise.all(
      cells.map(async cell => ({
        ...cell,
        repairedGeometry: cell.repairedGeometry ?? null,
        sourceGeometry: cell.sourceGeometry,
        sources: [{ dataset: 'hkgov-pland-pu', layer: 'TPUSU' }],
        version: null,
        versionHash: await createHash(cell),
        releaseId,
        validFromRelease: releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    for (const chunk of chunkArray(rows, 4)) {
      await db
        .insert(sourceSchema.sourceHkgovPlandPlanningCells)
        .values(chunk)
        .onConflictDoUpdate({
          target: [
            sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
            sourceSchema.sourceHkgovPlandPlanningCells.versionHash,
          ],
          set: sourceVersionConflictUpdate(releaseId, releaseCode, now),
        })
        .run()
    }
    return
  }

  const towns = records as Array<NonNullable<PreparedDivision['newTown']>>
  const rows = await Promise.all(
    towns.map(async town => ({
      ...town,
      newTownId: town.sourceRecordId,
      sources: [{ dataset: 'hkgov-pland-new-town' }],
      version: null,
      versionHash: await createHash(town),
      releaseId,
      validFromRelease: releaseCode,
      validToRelease: null,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  for (const chunk of chunkArray(rows, 4)) {
    await db
      .insert(sourceSchema.sourceHkgovPlandNewTowns)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovPlandNewTowns.sourceRecordId,
          sourceSchema.sourceHkgovPlandNewTowns.versionHash,
        ],
        set: sourceVersionConflictUpdate(releaseId, releaseCode, now),
      })
      .run()
  }
}

function sourceVersionConflictUpdate(
  releaseId: string,
  releaseCode: string,
  now: string,
) {
  return {
    isCurrent: true,
    releaseId,
    validFromRelease: releaseCode,
    validToRelease: null,
    updatedAt: now,
  }
}

async function closeHistoryRows(
  db: HarbourWritableDb,
  ids: string[],
  snapshotId: string,
  _cohortKey: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 6))) {
    if (chunk.length === 0) continue
    await Promise.all([
      db
        .update(historySchema.divisions)
        .set({
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisions.isCurrent, true),
            inArray(historySchema.divisions.id, chunk),
          ),
        )
        .run(),
      db
        .update(historySchema.divisionsI18n)
        .set({ isCurrent: false, updatedAt: now })
        .where(
          and(
            eq(historySchema.divisionsI18n.isCurrent, true),
            inArray(historySchema.divisionsI18n.divisionId, chunk),
          ),
        )
        .run(),
    ])
  }
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    recordType: 'division',
    operation: 'delete',
    changes: [...new Set(ids)].map(recordId => ({ recordId })),
  })
}

async function closeNativeSourceRows(
  db: HarbourWritableDb,
  table:
    | typeof sourceSchema.sourceHkgovPlandPlanningCells
    | typeof sourceSchema.sourceHkgovPlandNewTowns,
  ids: string[],
  releaseCode: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(table)
      .set({ isCurrent: false, validToRelease: releaseCode, updatedAt: now })
      .where(and(eq(table.isCurrent, true), inArray(table.sourceRecordId, chunk)))
      .run()
  }
}

function levelNumber(level: string) {
  switch (level) {
    case 'newtown':
    case 'ppu':
      return 3
    case 'spu':
      return 4
    case 'tpu':
      return 5
    case 'subunit':
      return 6
    default:
      throw new Error(`Unsupported Planning Department planning level ${level}.`)
  }
}

function statRow(dimension: string, metric: string, value: number, groupValue: string) {
  return {
    type: 'division' as const,
    dimension,
    metric,
    metricUnit: 'rows',
    value,
    groupBy: 'source',
    groupValue,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`)
  return value.trim()
}

function requireValue(value: unknown, name: string) {
  if (value === null || value === undefined) throw new Error(`Missing ${name}.`)
  return value
}

type PlandSqlArtefactManifest = {
  currentKey: string
  historyKey: string
  metaKey: string
  sourceKey: string
}

type PlandImportTargets = {
  current: SqlImportTargetContext
  history: SqlImportTargetContext
  meta: SqlImportTargetContext
  source: SqlImportTargetContext
}

type PlandSqlState = {
  changedHistoryIds: string[]
  changedNativeIds: string[]
  missingHistoryIds: string[]
  missingNativeIds: string[]
  records: PreparedDivision[]
  releaseCode: string
  releaseId: string
  snapshotId: string
}

const PLAND_SQL_STATEMENT_BYTE_TARGET = 96 * 1024

/**
 * Serialises the already-planned local mutations into idempotent SQL. The
 * planning cache is deliberately the source of truth here: it lets this
 * specialised processor retain its existing data normalisation while making
 * the remote D1 mutation and cache replay exactly the same operation.
 */
async function writePlandSqlArtefacts(
  bucket: LocalPipelineBucket,
  context: LocalAddressDbContext,
  plan: HkgovPlandDivisionUploadPlan,
  state: PlandSqlState,
): Promise<PlandSqlArtefactManifest> {
  const runId = [
    'pland',
    plan.source,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
    state.releaseId,
  ]
    .join('-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
  const artefactKey = (target: string, filename: string) =>
    buildSqlPipelineArtefactKey(
      {
        cohortKey: plan.cohortKey,
        datasetId: state.releaseId,
        rawObjectKey: '',
        regionCode: plan.regionCode,
        releaseCode: state.releaseCode,
        releaseId: state.releaseId,
        source: plan.source,
        sourceVersion: plan.sourceVersion,
        theme: plan.theme,
        type: plan.type,
      },
      target,
      filename,
    )
  const manifest = {
    currentKey: artefactKey('current', `${runId}-current.sql`),
    historyKey: artefactKey('history', `${runId}-history.sql`),
    metaKey: artefactKey('meta', `${runId}-meta.sql`),
    sourceKey: artefactKey('source', `${runId}-source.sql`),
  } satisfies PlandSqlArtefactManifest

  const [sourceSql, historySql, currentSql, metaSql] = await Promise.all([
    buildPlandSourceSql(context, plan, state),
    buildPlandHistorySql(context, state),
    buildPlandCurrentSql(context, state),
    buildPlandMetaSql(context, state),
  ])

  await Promise.all([
    writeTextArtefact(
      bucket,
      manifest.sourceKey,
      sourceSql,
      'application/sql; charset=utf-8',
    ),
    writeTextArtefact(
      bucket,
      manifest.historyKey,
      historySql,
      'application/sql; charset=utf-8',
    ),
    writeTextArtefact(
      bucket,
      manifest.currentKey,
      currentSql,
      'application/sql; charset=utf-8',
    ),
    writeTextArtefact(
      bucket,
      manifest.metaKey,
      metaSql,
      'application/sql; charset=utf-8',
    ),
  ])

  return manifest
}

async function buildPlandSourceSql(
  context: LocalAddressDbContext,
  plan: HkgovPlandDivisionUploadPlan,
  state: PlandSqlState,
) {
  const tableName =
    plan.source === 'hkgov-pland-new-town'
      ? 'hkgovPlandNewTowns'
      : 'hkgovPlandPlanningCells'
  const affectedIdChunks = chunkArray(
    [...new Set([...state.changedNativeIds, ...state.missingNativeIds])],
    getMaxItemsPerInClause(1, 1),
  )
  const affectedRows =
    plan.source === 'hkgov-pland-new-town'
      ? (
          await Promise.all(
            affectedIdChunks.map(chunk =>
              context.sourceDb
                .select()
                .from(sourceSchema.sourceHkgovPlandNewTowns)
                .where(
                  inArray(sourceSchema.sourceHkgovPlandNewTowns.sourceRecordId, chunk),
                )
                .all(),
            ),
          )
        ).flat()
      : (
          await Promise.all(
            affectedIdChunks.map(chunk =>
              context.sourceDb
                .select()
                .from(sourceSchema.sourceHkgovPlandPlanningCells)
                .where(
                  inArray(
                    sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
                    chunk,
                  ),
                )
                .all(),
            ),
          )
        ).flat()
  const columns =
    plan.source === 'hkgov-pland-new-town'
      ? [
          'sourceRecordId',
          'sources',
          'rawProperties',
          'version',
          'versionHash',
          'releaseId',
          'validFromRelease',
          'validToRelease',
          'isCurrent',
          'createdAt',
          'updatedAt',
          'sourceGeometry',
          'newTownId',
          'nameEn',
          'nameZhHant',
          'nameZhHans',
          'wasGeometryRepaired',
          'repairedGeometry',
        ]
      : [
          'sourceRecordId',
          'sources',
          'rawProperties',
          'version',
          'versionHash',
          'releaseId',
          'validFromRelease',
          'validToRelease',
          'isCurrent',
          'createdAt',
          'updatedAt',
          'sourceGeometry',
          'ppuCode',
          'spuCode',
          'tpuCode',
          'subunitCode',
          'wasGeometryRepaired',
          'repairedGeometry',
        ]
  const sourceInsert = prepareRowsForSql(
    affectedRows,
    columns,
    ['sourceRecordId', 'versionHash'],
    ['sourceGeometry'],
  )
  const statements = [
    ...buildCloseSourceStatements(tableName, state.missingNativeIds, state.releaseCode),
    ...buildInsertStatements(tableName, columns, sourceInsert.rows, {
      suffix: buildUpdateSuffix(columns, ['sourceRecordId', 'versionHash']),
    }),
    ...buildLargeTextUpdates(tableName, sourceInsert.largeTextUpdates),
  ]

  return sqlFile(statements)
}

async function buildPlandHistorySql(
  context: LocalAddressDbContext,
  state: PlandSqlState,
) {
  const affectedIds = [
    ...new Set([...state.changedHistoryIds, ...state.missingHistoryIds]),
  ]
  const affectedIdChunks = chunkArray(affectedIds, getMaxItemsPerInClause(1, 1))
  const [divisionRows, i18nRows, changeRows] = await Promise.all([
    Promise.all(
      affectedIdChunks.map(chunk =>
        context.historyDb
          .select()
          .from(historySchema.divisions)
          .where(inArray(historySchema.divisions.id, chunk))
          .all(),
      ),
    ).then(rows => rows.flat()),
    Promise.all(
      affectedIdChunks.map(chunk =>
        context.historyDb
          .select()
          .from(historySchema.divisionsI18n)
          .where(inArray(historySchema.divisionsI18n.divisionId, chunk))
          .all(),
      ),
    ).then(rows => rows.flat()),
    context.historyDb
      .select()
      .from(historySchema.snapshotVersionChanges)
      .where(eq(historySchema.snapshotVersionChanges.snapshotId, state.snapshotId))
      .all(),
  ])
  const divisionColumns = [
    'id',
    'identifiers',
    'level',
    'type',
    'sourceKeys',
    'wikidata',
    'hierarchy',
    'cartography',
    'sources',
    'geometry',
    'bbox',
    'versionHash',
    'sourceReleaseId',
    'snapshotId',
    'isCurrent',
    'createdAt',
    'updatedAt',
  ]
  const i18nColumns = [
    'divisionId',
    'locale',
    'name',
    'nameVariant',
    'nameAlts',
    'nameRules',
    'isLocaleInferred',
    'versionHash',
    'sourceReleaseId',
    'snapshotId',
    'isCurrent',
    'createdAt',
    'updatedAt',
  ]
  const changeColumns = [
    'snapshotId',
    'recordType',
    'recordId',
    'locale',
    'versionHash',
    'operation',
    'sourceReleaseId',
    'createdAt',
    'updatedAt',
  ]
  const divisionInsert = prepareRowsForSql(divisionRows, divisionColumns, [
    'id',
    'versionHash',
  ])
  const i18nInsert = prepareRowsForSql(i18nRows, i18nColumns, [
    'divisionId',
    'versionHash',
    'locale',
  ])
  const statements = [
    ...buildCloseHistoryStatements(affectedIds),
    ...buildInsertStatements('divisions', divisionColumns, divisionInsert.rows, {
      suffix: buildUpdateSuffix(divisionColumns, ['id', 'versionHash']),
    }),
    ...buildLargeTextUpdates('divisions', divisionInsert.largeTextUpdates),
    ...buildInsertStatements('divisionsI18n', i18nColumns, i18nInsert.rows, {
      suffix: buildUpdateSuffix(i18nColumns, ['divisionId', 'versionHash', 'locale']),
    }),
    ...buildLargeTextUpdates('divisionsI18n', i18nInsert.largeTextUpdates),
    `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
    ...buildInsertStatements('snapshotVersionChanges', changeColumns, changeRows, {
      suffix: buildUpdateSuffix(changeColumns, [
        'snapshotId',
        'recordType',
        'recordId',
        'locale',
      ]),
    }),
  ]

  return sqlFile(statements)
}

async function buildPlandCurrentSql(
  context: LocalAddressDbContext,
  state: PlandSqlState,
) {
  const [divisionRows, i18nRows] = await Promise.all([
    context.currentDb
      .select()
      .from(currentSchema.divisions)
      .where(eq(currentSchema.divisions.snapshotId, state.snapshotId))
      .all(),
    context.currentDb
      .select()
      .from(currentSchema.divisionsI18n)
      .where(eq(currentSchema.divisionsI18n.snapshotId, state.snapshotId))
      .all(),
  ])
  const divisionColumns = [
    'snapshotId',
    'id',
    'identifiers',
    'level',
    'type',
    'sourceKeys',
    'wikidata',
    'hierarchy',
    'cartography',
    'sources',
    'geometry',
    'bbox',
    'createdAt',
    'updatedAt',
  ]
  const i18nColumns = [
    'snapshotId',
    'divisionId',
    'locale',
    'name',
    'nameVariant',
    'nameAlts',
    'nameRules',
    'isLocaleInferred',
    'createdAt',
    'updatedAt',
  ]
  const divisionInsert = prepareRowsForSql(divisionRows, divisionColumns, [
    'snapshotId',
    'id',
  ])
  const i18nInsert = prepareRowsForSql(i18nRows, i18nColumns, [
    'snapshotId',
    'divisionId',
    'locale',
  ])

  return sqlFile([
    `DELETE FROM divisionsI18n WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
    `DELETE FROM divisions WHERE snapshotId = ${sqlLiteral(state.snapshotId)};`,
    ...buildInsertStatements('divisions', divisionColumns, divisionInsert.rows),
    ...buildLargeTextUpdates('divisions', divisionInsert.largeTextUpdates),
    ...buildInsertStatements('divisionsI18n', i18nColumns, i18nInsert.rows),
    ...buildLargeTextUpdates('divisionsI18n', i18nInsert.largeTextUpdates),
  ])
}

async function buildPlandMetaSql(context: LocalAddressDbContext, state: PlandSqlState) {
  const [
    snapshots,
    sources,
    assemblyRuns,
    releaseAssignments,
    snapshotAssignments,
    actions,
    stats,
  ] = await Promise.all([
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.id, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotSources)
      .where(eq(metaSchema.metaSnapshotSources.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, state.releaseId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, state.snapshotId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.releaseProcessingActions)
      .where(eq(metaSchema.releaseProcessingActions.releaseId, state.releaseId))
      .all(),
    context.metaDb
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, state.releaseId))
      .all(),
  ])
  if (
    snapshots.length !== 1 ||
    !sources.some(row => row.sourceReleaseId === state.releaseId)
  ) {
    throw new Error(`PLAND snapshot metadata is incomplete for ${state.releaseId}.`)
  }
  if (releaseAssignments.length === 0 || snapshotAssignments.length === 0) {
    throw new Error(`PLAND shard assignments are incomplete for ${state.releaseId}.`)
  }
  const snapshotLineageId = snapshots[0]?.snapshotLineageId
  const lineages = snapshotLineageId
    ? await context.metaDb
        .select()
        .from(metaSchema.metaSnapshotLineages)
        .where(eq(metaSchema.metaSnapshotLineages.id, snapshotLineageId))
        .all()
    : []
  if (snapshotLineageId && lineages.length !== 1) {
    throw new Error(`PLAND snapshot lineage is missing for ${state.snapshotId}.`)
  }
  const lineageColumns = [
    'id',
    'code',
    'regionCode',
    'resourceType',
    'variant',
    'identityMode',
    'primaryDatasetId',
    'versionHash',
    'createdAt',
    'updatedAt',
  ]
  const snapshotColumns = [
    'id',
    'snapshotLineageId',
    'parentSnapshotId',
    'resourceType',
    'code',
    'cohortKey',
    'revision',
    'status',
    'publishedAt',
    'validFrom',
    'validTo',
    'notes',
    'createdAt',
    'updatedAt',
  ]
  const sourceColumns = [
    'snapshotId',
    'datasetId',
    'sourceReleaseId',
    'role',
    'selectedByRule',
    'selectionMode',
    'anchorReleaseId',
    'sourceCohortKey',
    'createdAt',
  ]
  const assemblyRunColumns = [
    'id',
    'snapshotId',
    'snapshotAssemblyId',
    'anchorReleaseId',
    'anchorCohortKey',
    'status',
    'selectionSummaryJson',
    'createdAt',
    'updatedAt',
  ]
  const actionColumns = [
    'id',
    'releaseId',
    'action',
    'mode',
    'summary',
    'affectedRecordCount',
    'evidence',
    'createdAt',
    'updatedAt',
  ]
  const statsColumns = [
    'id',
    'type',
    'releaseId',
    'snapshotId',
    'apiReleaseSetId',
    'dimension',
    'metric',
    'metricUnit',
    'value',
    'groupBy',
    'groupValue',
    'createdAt',
    'updatedAt',
  ]
  return sqlFile([
    ...buildInsertStatements('snapshotLineages', lineageColumns, lineages, {
      suffix: buildUpdateSuffix(lineageColumns, ['id']),
    }),
    ...buildInsertStatements('snapshots', snapshotColumns, snapshots, {
      suffix: buildUpdateSuffix(snapshotColumns, ['id']),
    }),
    ...buildInsertStatements('snapshotSources', sourceColumns, sources, {
      suffix: buildUpdateSuffix(sourceColumns, ['snapshotId', 'sourceReleaseId']),
    }),
    ...buildInsertStatements('snapshotAssemblyRuns', assemblyRunColumns, assemblyRuns, {
      suffix: buildUpdateSuffix(assemblyRunColumns, ['id']),
    }),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseAssignments,
      {
        suffix: 'ON CONFLICT(releaseId, dataShardId) DO NOTHING',
      },
    ),
    ...buildInsertStatements(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      snapshotAssignments,
      {
        suffix: 'ON CONFLICT(snapshotId, dataShardId) DO NOTHING',
      },
    ),
    `DELETE FROM releaseProcessingActions WHERE releaseId = ${sqlLiteral(state.releaseId)};`,
    ...buildInsertStatements('releaseProcessingActions', actionColumns, actions),
    `DELETE FROM stats WHERE releaseId = ${sqlLiteral(state.releaseId)};`,
    ...buildInsertStatements('stats', statsColumns, stats),
  ])
}

function resolvePlandImportOptions(
  target: UploadTarget,
  context: LocalAddressDbContext,
): SqlImportExecutionOptions {
  const options: SqlImportExecutionOptions = {
    accountId: resolveCloudflareAccountId(target),
    apiToken: process.env.CLOUDFLARE_D1_TOKEN?.trim() || undefined,
    isLocal: !target.remote,
    metaDatabaseId: context.state.bindings.DB_META?.databaseId ?? null,
    remoteImportBatchBytes: REMOTE_IMPORT_BATCH_BYTES,
  }
  if (target.remote && (!options.accountId || !options.apiToken)) {
    throw new Error(
      'Remote PLAND SQL import requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN.',
    )
  }
  return options
}

function resolvePlandImportTargets(
  context: LocalAddressDbContext,
  sourceVersion: string,
): PlandImportTargets {
  const shardYear = sourceVersion.slice(0, 4)
  const historyBindingName = resolveShardBindingName('history', 'HK', shardYear)
  const sourceBindingName = resolveShardBindingName('source', 'HK', shardYear)
  return {
    current: {
      binding: context.currentBinding,
      databaseId: context.state.bindings.DB_CURRENT?.databaseId ?? null,
      name: 'current',
    },
    history: {
      binding: context.historyBinding,
      databaseId: context.state.bindings[historyBindingName]?.databaseId ?? null,
      name: 'history',
    },
    meta: {
      binding: context.metaBinding,
      databaseId: context.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    },
    source: {
      binding: context.sourceBinding,
      databaseId: context.state.bindings[sourceBindingName]?.databaseId ?? null,
      name: 'source',
    },
  }
}

async function importPlandSqlArtefacts(
  bucket: LocalPipelineBucket,
  manifest: PlandSqlArtefactManifest,
  targets: PlandImportTargets,
  options: SqlImportExecutionOptions,
  client: HarbourClient,
  releaseId: string,
  releaseCode: string,
) {
  const imports: Array<[string, SqlImportTargetContext, string]> = [
    ['importPlandSqlSource', targets.source, manifest.sourceKey],
    ['importPlandSqlHistory', targets.history, manifest.historyKey],
    ['importPlandSqlCurrent', targets.current, manifest.currentKey],
    ['importPlandSqlMeta', targets.meta, manifest.metaKey],
  ]
  for (const [phase, importTarget, key] of imports) {
    await client.stageRunning(releaseId, phase, undefined, releaseCode)
    try {
      const stats = await importSqlArtefactKeys(
        bucket,
        importTarget,
        [key],
        options,
        async progress => {
          await client.stageRunning(releaseId, phase, progress, releaseCode)
        },
      )
      await client.stageCompleted(releaseId, phase, stats, releaseCode)
    } catch (error) {
      await client.stageFailed(
        releaseId,
        phase,
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      throw error
    }
  }
}

async function replayPlandSqlIntoSharedCache(
  target: UploadTarget,
  bucket: LocalPipelineBucket,
  manifest: PlandSqlArtefactManifest,
  plan: HkgovPlandDivisionUploadPlan,
  importOptions: SqlImportExecutionOptions,
  releaseCode: string,
) {
  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const sharedContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    plan.sourceVersion,
    {
      includePreviousShardYears: true,
      requireExistingRemoteCache: true,
    },
  )
  try {
    const targets = resolvePlandImportTargets(sharedContext, plan.sourceVersion)
    const localOptions: SqlImportExecutionOptions = {
      ...importOptions,
      accountId: undefined,
      apiToken: undefined,
      isLocal: true,
    }
    await replayRemoteCacheWithRetry(
      targetName,
      resolveSharedRemoteDbCacheDir(target),
      releaseCode,
      async () => {
        await Promise.all([
          importSqlArtefactKeys(
            bucket,
            targets.source,
            [manifest.sourceKey],
            localOptions,
            async () => undefined,
          ),
          importSqlArtefactKeys(
            bucket,
            targets.history,
            [manifest.historyKey],
            localOptions,
            async () => undefined,
          ),
          importSqlArtefactKeys(
            bucket,
            targets.current,
            [manifest.currentKey],
            localOptions,
            async () => undefined,
          ),
          importSqlArtefactKeys(
            bucket,
            targets.meta,
            [manifest.metaKey],
            localOptions,
            async () => undefined,
          ),
        ])
      },
    )
  } finally {
    sharedContext.cleanup()
  }
  await refreshRemoteMetaCache(targetName, resolveSharedRemoteDbCacheDir(target))
}

function buildCloseSourceStatements(
  tableName: string,
  ids: string[],
  releaseCode: string,
) {
  return buildIdChunks(ids).map(idsSql =>
    `
UPDATE ${tableName}
SET isCurrent = 0, validToRelease = ${sqlLiteral(releaseCode)}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1 AND sourceRecordId IN (${idsSql});`.trim(),
  )
}

function buildCloseHistoryStatements(ids: string[]) {
  return buildIdChunks(ids).flatMap(idsSql => [
    `UPDATE divisions SET isCurrent = 0, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE isCurrent = 1 AND id IN (${idsSql});`,
    `UPDATE divisionsI18n SET isCurrent = 0, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE isCurrent = 1 AND divisionId IN (${idsSql});`,
  ])
}

function buildIdChunks(ids: string[]) {
  return chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))
    .filter(chunk => chunk.length > 0)
    .map(chunk => chunk.map(sqlLiteral).join(', '))
}

type LargeTextUpdate = {
  column: string
  keys: Record<string, unknown>
  value: string
}

/** D1 rejects a single SQL statement above its statement-size limit. */
function prepareRowsForSql(
  rows: unknown[],
  columns: string[],
  keyColumns: string[],
  requiredTextColumns: string[] = [],
) {
  const largeTextUpdates: LargeTextUpdate[] = []
  const preparedRows = rows.map(value => {
    const row = { ...(value as Record<string, unknown>) }
    const keys = Object.fromEntries(keyColumns.map(column => [column, row[column]]))

    for (const column of columns) {
      const text = serialiseSqlText(row[column])

      if (
        text === null ||
        new TextEncoder().encode(sqlLiteral(text)).byteLength <=
          PLAND_SQL_STATEMENT_BYTE_TARGET / 4
      ) {
        continue
      }

      largeTextUpdates.push({ column, keys, value: text })
      row[column] = requiredTextColumns.includes(column) ? '' : null
    }

    return row
  })

  return { largeTextUpdates, rows: preparedRows }
}

function buildLargeTextUpdates(table: string, updates: LargeTextUpdate[]) {
  return updates.flatMap(update => {
    const where = Object.entries(update.keys)
      .map(([column, value]) => `${column} = ${sqlLiteral(value)}`)
      .join(' AND ')
    const statements = [`UPDATE ${table} SET ${update.column} = '' WHERE ${where};`]

    for (const chunk of splitSqlText(update.value)) {
      statements.push(
        `UPDATE ${table} SET ${update.column} = ${update.column} || ${sqlLiteral(chunk)} WHERE ${where};`,
      )
    }

    return statements
  })
}

function splitSqlText(value: string) {
  const maxBytes = 16 * 1024
  const chunks: string[] = []
  let chunk = ''
  let chunkBytes = 0

  for (const character of value) {
    const characterBytes = new TextEncoder().encode(character).byteLength
    if (chunk && chunkBytes + characterBytes > maxBytes) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }
    chunk += character
    chunkBytes += characterBytes
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

function serialiseSqlText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return null
}

function buildInsertStatements(
  table: string,
  columns: string[],
  rows: unknown[],
  options: { suffix?: string } = {},
) {
  if (rows.length === 0) return []
  const statements: string[] = []
  const prefix = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `
  const suffix = options.suffix ? ` ${options.suffix}` : ''
  let values: string[] = []
  for (const row of rows) {
    const rowRecord = row as Record<string, unknown>
    const value = `(${columns.map(column => sqlLiteral(rowRecord[column])).join(', ')})`
    const candidate = `${prefix}${[...values, value].join(', ')}${suffix};`
    const rowBytes = new TextEncoder().encode(`${prefix}${value}${suffix};`).byteLength
    if (rowBytes > PLAND_SQL_STATEMENT_BYTE_TARGET) {
      throw new Error(
        `Cannot serialise ${table} row: its ${rowBytes}-byte SQL statement exceeds the ${PLAND_SQL_STATEMENT_BYTE_TARGET}-byte safe limit.`,
      )
    }
    if (
      values.length > 0 &&
      new TextEncoder().encode(candidate).byteLength > PLAND_SQL_STATEMENT_BYTE_TARGET
    ) {
      statements.push(`${prefix}${values.join(', ')}${suffix};`)
      values = [value]
    } else {
      values.push(value)
    }
  }
  if (values.length > 0) statements.push(`${prefix}${values.join(', ')}${suffix};`)
  return statements
}

function buildUpdateSuffix(columns: string[], keys: string[]) {
  const updates = columns.filter(column => !keys.includes(column))
  return `ON CONFLICT(${keys.join(', ')}) DO UPDATE SET ${updates.map(column => `${column} = excluded.${column}`).join(', ')}`
}

function sqlFile(statements: string[]) {
  return `${statements.filter(Boolean).join('\n\n')}\n`
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (accountId) return accountId
  const config = parse(
    readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8'),
  ) as unknown as {
    env?: {
      preview?: { vars?: Record<string, unknown> }
      production?: { vars?: Record<string, unknown> }
    }
    vars?: Record<string, unknown>
  }
  const vars = target.remote
    ? target.environment === 'production'
      ? config.env?.production?.vars
      : config.env?.preview?.vars
    : config.vars
  return typeof vars?.CLOUDFLARE_ACCOUNT_ID === 'string'
    ? vars.CLOUDFLARE_ACCOUNT_ID.trim() || undefined
    : undefined
}
