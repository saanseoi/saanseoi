import type { RegionCode, ResourceType } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
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
import {
  resolveLocalAddressDbContext,
  type LocalDbCacheProgressEvent,
} from '../addressSql/localDbCache.ts'
import { LocalUploadProgress } from '../localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'

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
  source: 'overture' | 'hkgov-had' | 'hkgov-pland-pu' | 'hkgov-pland-new-town'
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
  options: { skipSnapshotCleanup?: boolean; validateGeometry?: boolean } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const progress = new LocalUploadProgress()
  const setupStartedAt = Date.now()
  progress.beginPhase(formatGeometryProgressLabel('Prepare', 'workspace'), {
    current: 0,
    max: null,
  })
  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)

  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
        cacheTableProfile: target.remote ? undefined : 'divisionGeometry',
        includePreviousShardYears: true,
        refreshRemoteTables: false,
      },
    )
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error))
    throw error
  }

  if (progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal(target.remote ? 'Clone cache' : 'Prepare'),
          colorRed(target.remote ? 'local copy' : 'local database'),
        ),
        [
          formatDurationMs(
            Date.now() - (target.remote ? dbCacheStartedAt : setupStartedAt),
          ),
        ],
      ),
    )
  }
  let controlClient: HarbourClient | null = null

  try {
    const releaseMetadataStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Prepare', 'release metadata'), {
      current: 0,
      max: null,
    })
    await syncStagedReleaseIntoLocalMetaCache(
      dbContext.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Prepare',
        'release metadata',
        undefined,
        Date.now() - releaseMetadataStartedAt,
      ),
    )
    const processingStateStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Prepare', 'processing state'), {
      current: 0,
      max: null,
    })
    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const client = target.remote
      ? remoteClient
      : createLocalControlClient(
          dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
          { publishClient: remoteClient },
        )
    controlClient = client
    await client.stageRunning(
      releaseId,
      'processDataset',
      {
        resourceType: previewPlan.type,
        rowCount: previewPlan.rowCount,
      },
      releaseCode,
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Prepare',
        'processing state',
        undefined,
        Date.now() - processingStateStartedAt,
      ),
    )
    const snapshotStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Assemble', 'snapshot'), {
      current: 0,
      max: null,
    })
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${releaseId}`)
    }
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, previewPlan.type, {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: previewPlan.source,
    })
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
      await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Assemble',
        'snapshot',
        undefined,
        Date.now() - snapshotStartedAt,
      ),
    )
    const normalizationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Normalize',
        `${previewPlan.type} records`,
        0,
        previewPlan.rowCount,
      ),
      { current: 0, max: previewPlan.rowCount },
    )

    const file = await createAsyncBufferFromR2(bucket, rawObjectKey)
    const normalized: Array<NonNullable<NormalizedGeometry>> = []
    let rejectedRows = 0
    let processedRows = 0
    const providerBridge =
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
              ? normalizeHkgovHadInputRow(row, providerBridge)
              : previewPlan.source === 'hkgov-pland-new-town'
                ? normalizeHkgovPlandNewTownInputRow(row)
                : row
          const value =
            previewPlan.type === 'divisionArea'
              ? normalizeDivisionAreaGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                })
              : normalizeDivisionBoundaryGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                })
          if (value) normalized.push(value as NonNullable<NormalizedGeometry>)
        } catch (error) {
          rejectedRows += 1
          throw error
        }
      }
      processedRows += batch.length
      progress.update(processedRows, {
        label: formatGeometryProgressLabel(
          'Normalize',
          `${previewPlan.type} records`,
          processedRows,
          previewPlan.rowCount,
        ),
      })
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Normalize',
        `${previewPlan.type} records`,
        normalized.length,
        Date.now() - normalizationStartedAt,
      ),
    )
    const validationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Validate', 'division references'),
      {
        current: 0,
        max: null,
      },
    )
    if (previewPlan.source !== 'hkgov-had') {
      await assertDivisionReferences(
        dbContext.currentDb,
        metaDb,
        previewPlan.regionCode,
        previewPlan.cohortKey,
        previewPlan.type,
        normalized,
      )
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Validate',
        'division references',
        undefined,
        Date.now() - validationStartedAt,
      ),
    )
    const writeStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Write', `${previewPlan.type} rows`),
      {
        current: 0,
        max: null,
      },
    )
    await writeGeometryRows(
      dbContext,
      previewPlan.type,
      normalized,
      {
        source: previewPlan.source,
        releaseId,
        releaseCode,
        snapshotId: snapshot.id,
        cohortKey: previewPlan.cohortKey,
      },
      label => progress.message(formatGeometryProgressLabel('Write', label)),
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Write',
        `${previewPlan.type} rows`,
        normalized.length,
        Date.now() - writeStartedAt,
      ),
    )
    const statsStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Finalize', 'dataset statistics'), {
      current: 0,
      max: null,
    })
    await replaceDatasetStats(
      metaDb,
      releaseId,
      buildGeometryStats(previewPlan.type, normalized, previewPlan.source),
    )
    progress.complete(
      formatGeometryCompletedLabel(
        'Finalize',
        'dataset statistics',
        undefined,
        Date.now() - statsStartedAt,
      ),
    )
    const publishStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Publish', 'dataset'), {
      current: 0,
      max: null,
    })
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
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    progress.complete(
      formatGeometryCompletedLabel(
        'Publish',
        'dataset',
        undefined,
        Date.now() - publishStartedAt,
      ),
    )
    return {
      snapshotId: snapshot.id,
      importedRows: normalized.length,
      publishResult,
    }
  } catch (error) {
    progress.fail(error instanceof Error ? error.message : String(error))
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
  const sources = normalizeJsonArray(row.sources)
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `HAD:${areaId}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-had', areaId }],
  }
}

function normalizeHkgovPlandNewTownInputRow(row: Record<string, unknown>) {
  const newTownId = typeof row.newtown_id === 'string' ? row.newtown_id.trim() : ''
  const divisionId = typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (!newTownId || !divisionId) {
    throw new Error(
      `Planning Department New Town ${newTownId || '<unknown>'} has no cohort-scoped planning division ID.`,
    )
  }
  const sources = normalizeJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `PLAND:NEWTOWN:${divisionId}`,
    division_id: divisionId,
    sources: sources?.length
      ? sources
      : [{ dataset: 'hkgov-pland-new-town', newTownId }],
  }
}

function normalizeJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
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
  const missingReferences = rows.flatMap(row => {
    const missingIds = divisionReferenceIds(type, row).filter(id => !knownIds.has(id))
    return missingIds.length > 0
      ? [
          {
            missingIds: [...new Set(missingIds)],
            record: row.source.rawProperties,
          },
        ]
      : []
  })
  const missingIds = [
    ...new Set(missingReferences.flatMap(reference => reference.missingIds)),
  ]
  if (missingIds.length > 0) {
    throw new Error(
      [
        `Division geometry references ${missingIds.length} division IDs absent from the ${cohortKey} division snapshot.`,
        ...formatMissingDivisionReferenceRecords(missingReferences),
      ].join('\n'),
    )
  }
}

function divisionReferenceIds(
  type: GeometryUploadPlan['type'],
  row: NonNullable<NormalizedGeometry>,
) {
  const canonical = row.canonical as {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
  }
  return type === 'divisionArea'
    ? canonical.divisionId
      ? [canonical.divisionId]
      : []
    : [canonical.leftDivisionId, canonical.rightDivisionId].filter((id): id is string =>
        Boolean(id),
      )
}

export function formatMissingDivisionReferenceRecords(
  references: Array<{ missingIds: string[]; record: unknown }>,
) {
  const examples = references.slice(0, 3)
  const label = examples.length === 1 ? 'Affected record:' : 'Affected records:'
  const records = examples.map((reference, index) =>
    [
      examples.length > 1
        ? `Record ${index + 1} (missing division IDs: ${reference.missingIds.join(', ')}):`
        : `Missing division IDs: ${reference.missingIds.join(', ')}`,
      formatDiagnosticRecord(reference.record),
    ].join('\n'),
  )
  const remaining = references.length - examples.length

  return [
    '',
    label,
    ...records,
    ...(remaining > 0
      ? [`... and ${remaining} more affected record${remaining === 1 ? '' : 's'}.`]
      : []),
  ]
}

function bigintJsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value) && value.length > 3) {
    return [...value.slice(0, 3), `... ${value.length - 3} more`]
  }

  return value
}

function formatDiagnosticRecord(record: unknown) {
  return JSON.stringify(record, bigintJsonReplacer, 2)
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
  onProgress?: (label: string) => void,
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
        : version.source === 'hkgov-pland-pu'
          ? sourceSchema.sourceHkgovPlandDivisionAreas
          : version.source === 'hkgov-pland-new-town'
            ? sourceSchema.sourceHkgovPlandNewTownDivisionAreas
            : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries

  onProgress?.('clear current rows')
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
  onProgress?.('hash geometry rows')
  for (const row of rows) {
    historyHashes.set(row.canonical.id, await hashDivisionGeometryRow(row.canonical))
    sourceHashes.set(
      row.source.sourceRecordId,
      await hashDivisionGeometrySourceRow(row.source),
    )
  }
  onProgress?.('close history rows')
  const closedHistoryRows = await closeChangedRows(
    context.historyDb,
    historyTable,
    historyTable.id,
    historyHashes,
    {
      isCurrent: false,
    },
  )
  await recordSnapshotVersionChanges(
    context.historyDb as unknown as HarbourWritableDb,
    {
      snapshotId: version.snapshotId,
      sourceReleaseId: version.releaseId,
      recordType: type,
      operation: 'delete',
      changes: closedHistoryRows.map(row => ({ recordId: row.id })),
    },
  )
  onProgress?.('close source rows')
  await closeChangedRows(
    context.sourceDb,
    sourceTable,
    sourceTable.sourceRecordId,
    sourceHashes,
    { isCurrent: false, validToRelease: version.releaseCode },
  )
  if (version.source === 'hkgov-pland-new-town') {
    await closeNewTownSourceI18nRows(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      sourceHashes,
      version.releaseCode,
    )
  }

  onProgress?.('build write batches')
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
        : version.source === 'hkgov-pland-pu'
          ? {
              divisionId: requirePlanningDivisionId(row),
              planningLevel: (row.source.rawProperties as Record<string, unknown>)
                ?.planning_level,
              sourceCellIds: (row.source.rawProperties as Record<string, unknown>)
                ?.source_cell_ids,
              repairedSourceFeatureIds: (
                row.source.rawProperties as Record<string, unknown>
              )?.repaired_source_feature_ids,
              sourceCrs: (row.source.rawProperties as Record<string, unknown>)
                ?.source_crs,
            }
          : version.source === 'hkgov-pland-new-town'
            ? {
                divisionId: requirePlanningDivisionId(row),
                newTownId: (row.source.rawProperties as Record<string, unknown>)
                  ?.newtown_id,
                sourceCrs: (row.source.rawProperties as Record<string, unknown>)
                  ?.source_crs,
                // `geometry` in the source table remains the publisher's
                // original delivery. The canonical repaired geometry is
                // retained separately for audit and reproducibility.
                geometry:
                  (row.source.rawProperties as Record<string, unknown>)
                    ?.source_geometry ?? row.source.geometry,
                bbox:
                  (row.source.rawProperties as Record<string, unknown>)
                    ?.source_geometry_bbox ?? row.source.bbox,
                canonicalGeometry: row.source.geometry,
                wasGeometryRepaired: Boolean(
                  (row.source.rawProperties as Record<string, unknown>)
                    ?.was_geometry_repaired,
                ),
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

  onProgress?.('write current rows')
  for (const chunk of chunkRows(currentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .run()
  }
  if (historyRows.length) {
    onProgress?.('write history rows')
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
            updatedAt: now,
          },
        })
        .run()
    }
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: type,
        operation: 'upsert',
        changes: historyRows.map(row => ({
          recordId: row.id,
          versionHash: row.versionHash,
        })),
      },
    )
  }
  if (sourceRows.length) {
    onProgress?.('write source rows')
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
  if (version.source === 'hkgov-pland-new-town') {
    await writeNewTownSourceI18nRows(
      context.sourceDb as unknown as HarbourWritableDb,
      rows,
      sourceHashes,
      version,
      now,
    )
  }
}

function requirePlanningDivisionId(row: NonNullable<NormalizedGeometry>) {
  const divisionId =
    'divisionId' in row.canonical ? row.canonical.divisionId : undefined
  if (!divisionId) {
    throw new Error(
      'Planning Department division area requires a canonical division ID.',
    )
  }
  return divisionId
}

function readNewTownName(
  row: NonNullable<NormalizedGeometry>,
  locale: 'en' | 'zh-hant' | 'zh-hans',
) {
  const i18n = (row.source.rawProperties as Record<string, unknown>)?.i18n
  if (!Array.isArray(i18n)) return null
  const entry = i18n.find(
    item =>
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).locale === locale,
  ) as Record<string, unknown> | undefined
  return typeof entry?.name === 'string' ? entry.name : null
}

async function closeNewTownSourceI18nRows(
  db: HarbourReadableDb & HarbourWritableDb,
  sourceHashes: Map<string, string>,
  releaseCode: string,
) {
  const table = sourceSchema.sourceHkgovPlandNewTownDivisionAreaI18n
  const existing = await db
    .select({
      sourceRecordId: table.sourceRecordId,
      versionHash: table.versionHash,
    })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  for (const row of existing) {
    if (sourceHashes.get(row.sourceRecordId) === row.versionHash) continue
    await db
      .update(table)
      .set({ isCurrent: false, validToRelease: releaseCode })
      .where(
        and(
          eq(table.sourceRecordId, row.sourceRecordId),
          eq(table.versionHash, row.versionHash),
          eq(table.isCurrent, true),
        ),
      )
      .run()
  }
}

async function writeNewTownSourceI18nRows(
  db: HarbourWritableDb,
  rows: Array<NonNullable<NormalizedGeometry>>,
  sourceHashes: Map<string, string>,
  version: {
    releaseId: string
    releaseCode: string
  },
  now: string,
) {
  const table = sourceSchema.sourceHkgovPlandNewTownDivisionAreaI18n
  const i18nRows = rows.flatMap(row => {
    const versionHash = sourceHashes.get(row.source.sourceRecordId)
    if (!versionHash) {
      throw new Error(
        `Planning Department New Town ${row.source.sourceRecordId} has no source version hash.`,
      )
    }
    return (['en', 'zh-hant', 'zh-hans'] as const).map(locale => {
      const name = readNewTownName(row, locale)
      if (!name) {
        throw new Error(
          `Planning Department New Town ${row.source.sourceRecordId} has no ${locale} source name.`,
        )
      }
      return {
        sourceRecordId: row.source.sourceRecordId,
        locale,
        name,
        isLocaleInferred: false,
        versionHash,
        releaseId: version.releaseId,
        validFromRelease: version.releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }
    })
  })
  for (const chunk of chunkRows(i18nRows)) {
    await db
      .insert(table)
      .values(chunk)
      .onConflictDoUpdate({
        target: [table.sourceRecordId, table.versionHash, table.locale],
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

function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const current = Math.min(event.current, event.total)
  const label = formatGeometryProgressLabel(
    'Clone cache',
    describeDbCacheSubject(event),
    current,
    event.total,
  )

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, { current, max: event.total })
  } else {
    progress.update(current, { label, max: event.total })
  }
}

function formatGeometryProgressLabel(
  action: string,
  subject: string,
  current?: number,
  total?: number,
) {
  return formatRunningPhaseLabel(colorTeal(action), colorRed(subject), current, total)
}

function formatGeometryCompletedLabel(
  action: string,
  subject: string,
  count?: number,
  durationMs?: number,
) {
  return appendPhaseDetails(
    formatCompletedPhaseLabel(colorTeal(action), colorRed(subject), count),
    [formatDurationMs(durationMs ?? Number.NaN)],
  )
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  const tableName = event.tableName
    ? event.filter
      ? `${event.tableName}:${event.filter}`
      : event.tableName
    : null

  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return tableName
        ? `${event.bindingName}.${tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return tableName ? `${event.bindingName}.${tableName}` : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
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
  const closedRows = []
  for (const row of existing) {
    if (currentHashes.get(row.id) === row.versionHash) continue
    await db.update(table).set(values).where(eq(idColumn, row.id)).run()
    closedRows.push(row)
  }
  return closedRows
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
