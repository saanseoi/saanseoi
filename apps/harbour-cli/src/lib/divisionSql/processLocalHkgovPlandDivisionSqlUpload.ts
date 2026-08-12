import { and, eq, inArray } from 'drizzle-orm'

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
import { currentSchema, historySchema, sourceSchema, toIsoTimestamp } from '@repo/db'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
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

  const context = await resolveLocalAddressDbContext(
    target,
    previewPlan.regionCode,
    previewPlan.sourceVersion,
    {
      cacheTableProfile: target.remote ? undefined : 'division',
      includePreviousShardYears: true,
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
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    await client
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
