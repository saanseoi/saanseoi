import { and, eq, inArray, ne } from 'drizzle-orm'

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
  cell: null | {
    bbox: unknown
    canonicalGeometry: unknown
    geometry: unknown
    ppuCode: string
    rawProperties: unknown
    sourceRecordId: string
    spuCode: string
    subunitCode: string
    tpuCode: string
    wasGeometryRepaired: boolean
  }
  i18n: Array<{ locale: string; name: string }>
  raw: Record<string, unknown>
  sourceCellIds: unknown
  sourceHash: string
  versionHash: string
}

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`
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
      'enrichment',
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
        releaseRole: 'enrichment',
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
    const currentSourceRows = await context.sourceDb
      .select({
        sourceRecordId: sourceSchema.sourceHkgovPlandDivisions.sourceRecordId,
        versionHash: sourceSchema.sourceHkgovPlandDivisions.versionHash,
      })
      .from(sourceSchema.sourceHkgovPlandDivisions)
      .where(
        and(
          eq(sourceSchema.sourceHkgovPlandDivisions.isCurrent, true),
          previewPlan.source === 'hkgov-pland-new-town'
            ? eq(sourceSchema.sourceHkgovPlandDivisions.planningLevel, 'newtown')
            : ne(sourceSchema.sourceHkgovPlandDivisions.planningLevel, 'newtown'),
        ),
      )
      .all()
    // New Town snapshots have no TPU cells.  In particular, they must not
    // close the current TPU-cell assertions merely because their source is
    // processed through the same canonical-division path.
    const currentCellRows =
      previewPlan.source === 'hkgov-pland-new-town'
        ? []
        : await context.sourceDb
            .select({
              sourceRecordId: sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
              versionHash: sourceSchema.sourceHkgovPlandPlanningCells.versionHash,
            })
            .from(sourceSchema.sourceHkgovPlandPlanningCells)
            .where(eq(sourceSchema.sourceHkgovPlandPlanningCells.isCurrent, true))
            .all()
    const currentHistoryRows = await listCurrentHistoryRows(
      context.historyDb as unknown as HarbourReadableDb,
      [
        ...records.map(record => record.base.id),
        ...currentSourceRows.map(row => row.sourceRecordId),
      ],
    )
    const historyHashById = new Map(
      currentHistoryRows.map(row => [row.id, row.versionHash]),
    )
    const sourceHashById = new Map(
      currentSourceRows.map(row => [row.sourceRecordId, row.versionHash]),
    )
    const ids = new Set(records.map(record => record.base.id))
    const changedHistoryIds = records
      .filter(record => historyHashById.get(record.base.id) !== record.versionHash)
      .map(record => record.base.id)
    const missingHistoryIds = currentHistoryRows
      .map(row => row.id)
      .filter(id => !ids.has(id))
    const changedSourceRecords = records.filter(
      record => sourceHashById.get(record.base.id) !== record.sourceHash,
    )
    const missingSourceIds = currentSourceRows
      .map(row => row.sourceRecordId)
      .filter(id => !ids.has(id))
    const cells = records.flatMap(record => (record.cell ? [record.cell] : []))
    const cellHashes = await Promise.all(
      cells.map(async cell => [cell.sourceRecordId, await createHash(cell)] as const),
    )
    const cellHashById = new Map(cellHashes)
    const incomingCellIds = new Set(cellHashById.keys())
    const changedCellIds = cells
      .filter(
        cell =>
          currentCellRows.find(row => row.sourceRecordId === cell.sourceRecordId)
            ?.versionHash !== cellHashById.get(cell.sourceRecordId),
      )
      .map(cell => cell.sourceRecordId)
    const missingCellIds = currentCellRows
      .map(row => row.sourceRecordId)
      .filter(id => !incomingCellIds.has(id))

    await closeHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      [...changedHistoryIds, ...missingHistoryIds],
      snapshot.id,
      previewPlan.cohortKey,
      now,
    )
    await closePlanningCellRows(
      context.sourceDb as unknown as HarbourWritableDb,
      [...changedCellIds, ...missingCellIds],
      releaseCode,
      now,
    )
    await closeSourceRows(
      context.sourceDb as unknown as HarbourWritableDb,
      [...changedSourceRecords.map(record => record.base.id), ...missingSourceIds],
      releaseCode,
      now,
    )
    await closeSourceI18nRows(
      context.sourceDb as unknown as HarbourWritableDb,
      [...changedSourceRecords.map(record => record.base.id), ...missingSourceIds],
      releaseCode,
      now,
    )
    await replaceCurrentSnapshot(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      records,
      currentSourceRows.map(row => row.sourceRecordId),
      now,
    )
    await replaceCurrentI18n(
      context.currentDb as unknown as HarbourWritableDb,
      snapshot.id,
      records,
      currentSourceRows.map(row => row.sourceRecordId),
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
      changedSourceRecords,
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
                sourceCell: record.cell
                  ? {
                      rawProperties: record.cell.rawProperties,
                      sourceRecordId: record.cell.sourceRecordId,
                    }
                  : (record.raw.source_properties ?? null),
              })),
              mode: 'automatic',
              summary:
                'Repaired known Planning Department polygon self-intersections with buffer(0); original source geometry remains in the source layer.',
            },
          ]
        : [],
    )
    await replaceDatasetStats(metaDb, releaseId, [
      statRow('records', 'count', records.length, 'canonical_divisions'),
      statRow(
        'source_features',
        'count',
        records.filter(record => record.cell).length,
        'planning_cells',
      ),
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

async function listCurrentHistoryRows(db: HarbourReadableDb, ids: string[]) {
  const rows: Array<{ id: string; versionHash: string }> = []
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 2))) {
    if (chunk.length === 0) continue
    rows.push(
      ...(await db
        .select({
          id: historySchema.divisions.id,
          versionHash: historySchema.divisions.versionHash,
        })
        .from(historySchema.divisions)
        .where(
          and(
            eq(historySchema.divisions.isCurrent, true),
            inArray(historySchema.divisions.id, chunk),
          ),
        )
        .all()),
    )
  }
  return rows
}

async function readPreparedDivisions(bucket: LocalPipelineBucket, key: string) {
  const file = await createAsyncBufferFromR2(bucket, key)
  const records: PreparedDivision[] = []
  for await (const batch of readParquetObjectsInBatches(file, 512)) {
    for (const raw of batch) records.push(await normalizePreparedDivision(raw))
  }
  return records
}

async function normalizePreparedDivision(value: Record<string, unknown>) {
  const id = requireString(value.id, 'id')
  const level = requireString(value.planning_level, 'planning_level')
  const sourceProperties = asRecord(value.source_properties)
  const identifiers = asRecord(value.identifiers)
  const sourceCellIds = value.source_cell_ids ?? []
  const i18n = normalizeI18n(value.i18n)
  const geometry = parseWkbGeometry(value.geometry)
  if (!geometry) throw new Error(`Planning division ${id} has invalid geometry.`)
  const sourceGeometry = parseWkbGeometry(sourceProperties.sourceGeometry) ?? geometry
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
  const sourceHash = await createHash({ ...value, geometry })
  const codes = identifiers as Record<string, unknown>
  const cell =
    level === 'subunit'
      ? {
          bbox: calculateGeoJsonBbox(sourceGeometry),
          canonicalGeometry: geometry,
          geometry: sourceGeometry,
          ppuCode: requireString(codes['PLAND:PPU'], 'PLAND:PPU'),
          rawProperties: sourceProperties.sourceFeatureProperties ?? null,
          sourceRecordId: Array.isArray(sourceCellIds)
            ? requireString(sourceCellIds[0], 'source_cell_ids[0]')
            : id,
          spuCode: requireString(codes['PLAND:SPU'], 'PLAND:SPU'),
          subunitCode: requireString(codes['PLAND:SUBUNIT'], 'PLAND:SUBUNIT'),
          tpuCode: requireString(codes['PLAND:TPU'], 'PLAND:TPU'),
          wasGeometryRepaired:
            Array.isArray(value.repaired_source_feature_ids) &&
            value.repaired_source_feature_ids.length > 0,
        }
      : null
  return {
    base,
    cell,
    i18n,
    raw: value,
    sourceCellIds,
    sourceHash,
    versionHash,
  } satisfies PreparedDivision
}

function wasPlanningGeometryRepaired(record: PreparedDivision) {
  return (
    record.cell?.wasGeometryRepaired === true ||
    Boolean(
      (record.raw.source_properties as Record<string, unknown> | undefined)
        ?.was_geometry_repaired,
    )
  )
}

function normalizeI18n(value: unknown) {
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
  cohortKey: string,
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
  cohortKey: string,
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
  records: PreparedDivision[],
  now: string,
) {
  const divisionRows = records.map(record => {
    const identifiers = record.base.identifiers as Record<string, unknown>
    return {
      sourceRecordId: record.base.id,
      planningLevel: requireString(record.raw.planning_level, 'planning_level'),
      ppuCode: optionalString(identifiers['PLAND:PPU']),
      spuCode: optionalString(identifiers['PLAND:SPU']),
      tpuCode: optionalString(identifiers['PLAND:TPU']),
      subunitCode: optionalString(identifiers['PLAND:SUBUNIT']),
      newTownId: optionalString(identifiers['PLAND:NEWTOWN']),
      sourceCellIds: record.sourceCellIds,
      sourceCrs: requireString(record.raw.source_crs, 'source_crs'),
      geometry:
        requireString(record.raw.planning_level, 'planning_level') === 'newtown'
          ? ((record.raw.source_properties as Record<string, unknown> | undefined)
              ?.source_geometry ?? record.base.geometry)
          : record.base.geometry,
      bbox:
        requireString(record.raw.planning_level, 'planning_level') === 'newtown'
          ? ((record.raw.source_properties as Record<string, unknown> | undefined)
              ?.source_geometry_bbox ?? record.base.bbox)
          : record.base.bbox,
      wasGeometryRepaired:
        requireString(record.raw.planning_level, 'planning_level') === 'newtown' &&
        Boolean(
          (record.raw.source_properties as Record<string, unknown> | undefined)
            ?.was_geometry_repaired,
        ),
      canonicalGeometry:
        requireString(record.raw.planning_level, 'planning_level') === 'newtown'
          ? record.base.geometry
          : null,
      sources: record.base.sources,
      rawProperties: record.raw,
      version: null,
      versionHash: record.sourceHash,
      releaseId,
      validFromRelease: releaseCode,
      validToRelease: null,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    }
  })
  for (const chunk of chunkArray(divisionRows, 4)) {
    await db
      .insert(sourceSchema.sourceHkgovPlandDivisions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovPlandDivisions.sourceRecordId,
          sourceSchema.sourceHkgovPlandDivisions.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId,
          validFromRelease: releaseCode,
          validToRelease: null,
          updatedAt: now,
        },
      })
      .run()
  }
  const i18nRows = records.flatMap(record =>
    record.i18n.map(item => ({
      sourceRecordId: record.base.id,
      locale: item.locale,
      name: item.name,
      isLocaleInferred: false,
      versionHash: record.sourceHash,
      releaseId,
      validFromRelease: releaseCode,
      validToRelease: null,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  for (const chunk of chunkArray(i18nRows, 8)) {
    await db
      .insert(sourceSchema.sourceHkgovPlandDivisionI18n)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovPlandDivisionI18n.sourceRecordId,
          sourceSchema.sourceHkgovPlandDivisionI18n.versionHash,
          sourceSchema.sourceHkgovPlandDivisionI18n.locale,
        ],
        set: {
          isCurrent: true,
          releaseId,
          validFromRelease: releaseCode,
          validToRelease: null,
          updatedAt: now,
        },
      })
      .run()
  }
  const cellRows = await Promise.all(
    records
      .flatMap(record => (record.cell ? [record.cell] : []))
      .map(async cell => ({
        sourceRecordId: cell.sourceRecordId,
        ppuCode: cell.ppuCode,
        spuCode: cell.spuCode,
        tpuCode: cell.tpuCode,
        subunitCode: cell.subunitCode,
        sourceCrs: 'EPSG:4326',
        wasGeometryRepaired: cell.wasGeometryRepaired,
        canonicalGeometry: cell.canonicalGeometry,
        geometry: cell.geometry,
        bbox: cell.bbox,
        sources: { hkgovPland: [{ source: 'TPUSU' }] },
        rawProperties: cell.rawProperties,
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
  for (const chunk of chunkArray(cellRows, 4)) {
    await db
      .insert(sourceSchema.sourceHkgovPlandPlanningCells)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId,
          sourceSchema.sourceHkgovPlandPlanningCells.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId,
          validFromRelease: releaseCode,
          validToRelease: null,
          updatedAt: now,
        },
      })
      .run()
  }
}

async function closeHistoryRows(
  db: HarbourWritableDb,
  ids: string[],
  snapshotId: string,
  cohortKey: string,
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

async function closeSourceRows(
  db: HarbourWritableDb,
  ids: string[],
  releaseCode: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(sourceSchema.sourceHkgovPlandDivisions)
      .set({ isCurrent: false, validToRelease: releaseCode, updatedAt: now })
      .where(
        and(
          eq(sourceSchema.sourceHkgovPlandDivisions.isCurrent, true),
          inArray(sourceSchema.sourceHkgovPlandDivisions.sourceRecordId, chunk),
        ),
      )
      .run()
  }
}

async function closeSourceI18nRows(
  db: HarbourWritableDb,
  ids: string[],
  releaseCode: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(sourceSchema.sourceHkgovPlandDivisionI18n)
      .set({ isCurrent: false, validToRelease: releaseCode, updatedAt: now })
      .where(
        and(
          eq(sourceSchema.sourceHkgovPlandDivisionI18n.isCurrent, true),
          inArray(sourceSchema.sourceHkgovPlandDivisionI18n.sourceRecordId, chunk),
        ),
      )
      .run()
  }
}

async function closePlanningCellRows(
  db: HarbourWritableDb,
  ids: string[],
  releaseCode: string,
  now: string,
) {
  for (const chunk of chunkArray([...new Set(ids)], getMaxItemsPerInClause(1, 4))) {
    if (chunk.length === 0) continue
    await db
      .update(sourceSchema.sourceHkgovPlandPlanningCells)
      .set({ isCurrent: false, validToRelease: releaseCode, updatedAt: now })
      .where(
        and(
          eq(sourceSchema.sourceHkgovPlandPlanningCells.isCurrent, true),
          inArray(sourceSchema.sourceHkgovPlandPlanningCells.sourceRecordId, chunk),
        ),
      )
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

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`)
  return value.trim()
}
