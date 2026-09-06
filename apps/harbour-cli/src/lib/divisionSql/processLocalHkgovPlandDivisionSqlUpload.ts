import { eq } from 'drizzle-orm'
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
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { createHash } from '@repo/core/pipeline/utils'
import { sourceSchema, toIsoTimestamp } from '@repo/db'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import {
  buildReleaseUploadDbCacheScopeKey,
  resetRemoteReleaseUploadCacheScope,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import type {
  HkgovPlandDivisionUploadPlan,
  UploadResult,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'
import {
  closeHistoryRows,
  closeNativeSourceRows,
  compressPlanningDivisionGeometry,
  insertHistoryI18nRows,
  insertHistoryRows,
  insertSourceRows,
  replaceCurrentI18n,
  replaceCurrentSnapshot,
  requireString,
  statRow,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'
import {
  LOCAL_RELEASE_ROOT,
  PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
} from './processLocalHkgovPlandDivisionSqlUploadConfig.ts'
import {
  importPlandSqlArtefacts,
  replayPlandSqlIntoSharedCache,
  resolvePlandImportOptions,
  resolvePlandImportTargets,
  runPlandProgressPhase,
} from './processLocalHkgovPlandDivisionSqlUploadImport.ts'
import {
  listCurrentHistoryRows,
  loadPlandNewTownDivisionCodes,
  readPreparedDivisions,
  validatePreparedDivisions,
  wasPlanningGeometryRepaired,
} from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'
import { writePlandSqlArtefacts } from './processLocalHkgovPlandDivisionSqlUploadSql.ts'

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
  const progress = new OperationProgress()
  const bucket = new LocalPipelineBucket(releaseRoot)
  await runPlandProgressPhase(progress, 'Prepare', 'workspace', () =>
    bucket.seedRawObject(rawObjectKey, preparedUpload.filePath),
  )
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const cacheTableProfile = 'planningDivisionGeometry'
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
    await runPlandProgressPhase(progress, 'Reset', 'release cache', () =>
      resetRemoteReleaseUploadCacheScope(
        target,
        remoteCacheScopeKey,
        cacheTableProfile,
      ),
    )
  }

  const context = await runPlandProgressPhase(progress, 'Prepare', 'database', () =>
    resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      previewPlan.sourceVersion,
      {
        cacheTableProfile,
        includePreviousShardYears: true,
        remoteCacheScopeKey,
      },
    ),
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = (
    target.remote
      ? createHarbourControlClient(target)
      : createLocalControlClient(metaDb, {
          publishClient: createHarbourControlClient(target) as HarbourClient,
        })
  ) as HarbourClient
  let published = false

  try {
    const { snapshot } = await runPlandProgressPhase(
      progress,
      'Prepare',
      'division snapshot',
      async () => {
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
            previewPlan.source === 'hkgov-pland-new-town'
              ? 'cohort_scoped'
              : 'persistent',
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
            resolvePipelineEnvironment(target),
            previewPlan.regionCode,
            previewPlan.sourceVersion,
          ),
          resolveShardForTypeRegionYear(
            metaDb,
            'source',
            resolvePipelineEnvironment(target),
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
        return { dataset, snapshot }
      },
    )
    const records = await runPlandProgressPhase(
      progress,
      'Normalise',
      `${previewPlan.rowCount.toLocaleString('en-US')} planning divisions`,
      async () =>
        readPreparedDivisions(
          bucket,
          rawObjectKey,
          releaseCode,
          !target.remote,
          previewPlan.source === 'hkgov-pland-new-town'
            ? await loadPlandNewTownDivisionCodes(metaDb)
            : new Map(),
        ),
    )
    validatePreparedDivisions(records, previewPlan.rowCount)
    const now = toIsoTimestamp()
    const nativeSourceTable =
      previewPlan.source === 'hkgov-pland-new-town'
        ? sourceSchema.sourceHkgovPlandNewTowns
        : sourceSchema.sourceHkgovPlandPlanningCells
    const {
      changedHistoryIds,
      changedNativeIds,
      currentHistoryRows,
      missingHistoryIds,
      missingNativeIds,
      nativeRecords,
    } = await runPlandProgressPhase(
      progress,
      'Compare',
      'Planning divisions',
      async () => {
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

        return {
          changedHistoryIds,
          changedNativeIds,
          currentHistoryRows,
          missingHistoryIds,
          missingNativeIds,
          nativeRecords,
        }
      },
    )

    await runPlandProgressPhase(
      progress,
      'Retire',
      'superseded Planning records',
      async () => {
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
      },
    )
    const compressedGeometryByDivisionId = await runPlandProgressPhase(
      progress,
      'Materialise',
      'Planning division geometry',
      async reportProgress => compressPlanningDivisionGeometry(records, reportProgress),
      { totalUnits: records.length },
    )
    await runPlandProgressPhase(
      progress,
      'Materialise',
      'current Planning divisions',
      reportProgress =>
        replaceCurrentSnapshot(
          context.currentDb as unknown as HarbourWritableDb,
          snapshot.id,
          records,
          compressedGeometryByDivisionId,
          currentHistoryRows.map(row => row.id),
          now,
          reportProgress,
        ),
      { totalUnits: records.length },
    )
    const currentI18nRowCount = records.reduce(
      (count, record) => count + record.i18n.length,
      0,
    )
    await runPlandProgressPhase(
      progress,
      'Materialise',
      'Planning division names',
      reportProgress =>
        replaceCurrentI18n(
          context.currentDb as unknown as HarbourWritableDb,
          snapshot.id,
          records,
          currentHistoryRows.map(row => row.id),
          now,
          reportProgress,
        ),
      { totalUnits: currentI18nRowCount },
    )
    const changedHistoryRecords = records.filter(record =>
      changedHistoryIds.includes(record.base.id),
    )
    await runPlandProgressPhase(
      progress,
      'Record',
      'Planning division history',
      async reportProgress => {
        await insertHistoryRows(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          releaseId,
          previewPlan.cohortKey,
          changedHistoryRecords,
          compressedGeometryByDivisionId,
          now,
          reportProgress,
        )
        await insertHistoryI18nRows(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          releaseId,
          previewPlan.cohortKey,
          changedHistoryRecords,
          now,
          reportProgress,
        )
      },
      {
        totalUnits:
          changedHistoryRecords.length +
          changedHistoryRecords.reduce(
            (count, record) => count + record.i18n.length,
            0,
          ),
      },
    )
    const changedNativeRecords = nativeRecords.filter(record =>
      changedNativeIds.includes(record.sourceRecordId),
    )
    await runPlandProgressPhase(
      progress,
      'Store',
      'Planning source records',
      reportProgress =>
        insertSourceRows(
          context.sourceDb as unknown as HarbourWritableDb,
          releaseId,
          releaseCode,
          changedNativeRecords,
          previewPlan.source,
          now,
          reportProgress,
        ),
      { totalUnits: changedNativeRecords.length },
    )
    await runPlandProgressPhase(
      progress,
      'Update',
      'Planning release metadata',
      async () => {
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
                    'Repaired known Planning Department polygon self-intersections with buffer(0); the native source record includes the row-keyed approved transform.',
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
      },
    )
    await runPlandProgressPhase(progress, 'Complete', 'Planning processing', () =>
      client.stageCompleted(
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
      ),
    )
    const sqlManifest = await runPlandProgressPhase(
      progress,
      'Write',
      'SQL import artefacts',
      () =>
        writePlandSqlArtefacts(bucket, context, previewPlan, {
          changedHistoryIds,
          changedNativeIds,
          missingHistoryIds,
          missingNativeIds,
          releaseId,
          releaseCode,
          records,
          snapshotId: snapshot.id,
        }),
    )
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
      progress,
    )
    const publishResult = await runPlandProgressPhase(
      progress,
      'Publish',
      'division snapshot',
      () =>
        client.publishDataset(releaseId, releaseCode, {
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )
    published = true

    if (target.remote) {
      await runPlandProgressPhase(progress, 'Refresh', 'shared database cache', () =>
        replayPlandSqlIntoSharedCache(
          target,
          bucket,
          sqlManifest,
          previewPlan,
          importOptions,
          {
            datasetCode,
            rawObjectKey,
            releaseCode,
            releaseId,
          },
        ),
      )
    }
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    progress.fail()
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

export type { HkgovPlandDivisionUploadPlan } from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'

export { resolvePlandDivisionCode } from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'

export { splitPlandSqlText } from './processLocalHkgovPlandDivisionSqlUploadSql.ts'
