import { retainProcessingFailure } from '../../api/processingFailureAudit'
import {
  calculateAndStoreApiReleaseSetStats,
  isApiReleaseSetStatsReady,
  resolveApiReleaseSetStatsTarget,
} from '../../api/apiReleaseSetStats'
import {
  planningDivisionChurn,
  planningDivisionContentHash,
} from './planningDivisionChurn'
import { eq } from 'drizzle-orm'
import { deliverPlandWorkflow, type PlandDeliveryCounts } from './plandDelivery.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  completeSqlDeliveryRelease,
  assertSqlDeliveryPlanningAllowed,
} from '../local/sqlDeliveryPending.ts'
import { refreshRemoteMetaCache } from '../../dbCache/localDbCache.ts'
import { resolveRemoteCacheDir } from '../../dbCache/localDbCacheTargets.ts'
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
import { retainDivisionProvenance } from './divisionProvenance'
import { deliverProcessingResult } from '../../api/provenance'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { createHash } from '@repo/core/pipeline/utils'
import { sourceSchema, toIsoTimestamp } from '@repo/db'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  buildReleaseUploadDbCacheScopeKey,
  resetRemoteReleaseUploadCacheScope,
  resolveLocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import type {
  CompressedPlanningDivisionGeometry,
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
  isCompleteCompressedPlanningDivisionGeometry,
  replaceCurrentI18n,
  replaceCurrentSnapshot,
  requireString,
  statRow,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'
import { openNormalisedArtefactCache } from '../local/normalisedArtefactCache.ts'
import {
  LOCAL_RELEASE_ROOT,
  PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
} from './processLocalHkgovPlandDivisionSqlUploadConfig.ts'
import {
  importPlandSqlArtefacts,
  resolvePlandImportOptions,
  resolvePlandImportTargets,
  runPlandProgressPhase,
} from './processLocalHkgovPlandDivisionSqlUploadImport.ts'
import {
  listCurrentHistoryRows,
  loadPlandNewTownDivisionCodes,
  readPreparedDivisions,
  validatePreparedDivisions,
  planningDivisionRule,
  wasPlanningGeometryRepaired,
} from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'
import { writePlandSqlArtefacts } from './processLocalHkgovPlandDivisionSqlUploadSql.ts'

export async function processLocalHkgovPlandDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: HkgovPlandDivisionUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { cacheArtefacts?: boolean; skipSnapshotCleanup?: boolean } = {},
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
        type: previewPlan.resourceType,
      })
    : undefined

  if (remoteCacheScopeKey) {
    await assertSqlDeliveryPlanningAllowed(
      resolveRemoteCacheDir(
        target.environment === 'production' ? 'production' : 'preview',
      ),
      releaseId,
    )
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
        resumeSqlDeliveryReleaseId: releaseId,
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
          {
            retainedDeliveryCacheDir: target.remote
              ? resolveRemoteCacheDir(
                  target.environment === 'production' ? 'production' : 'preview',
                )
              : context.state.dbCacheDir,
          },
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
    const deliveryContext = target.remote
      ? await resolveLocalAddressDbContext(
          target,
          previewPlan.regionCode,
          previewPlan.sourceVersion,
          {
            cacheTableProfile: 'planningDivisionGeometry',
            includePreviousShardYears: true,
            requireExistingRemoteCache: true,
            resumeSqlDeliveryReleaseId: releaseId,
          },
        )
      : context
    let completionCounts: PlandDeliveryCounts
    try {
      completionCounts = await deliverPlandWorkflow(
        {
          context: deliveryContext,
          releaseId,
          phase: 'planning-division-data',
          inputs: {
            preparedSha256: await deliveryFileSha256(preparedUpload.filePath),
            snapshotId: snapshot.id,
          },
          onProgress: (completed, total) =>
            progress.message(`Planning division SQL: ${completed}/${total} batches`),
        },
        context,
        async context => {
          const metaDb = context.metaDb as unknown as HarbourReadableDb &
            HarbourWritableDb
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
                .filter(
                  record => historyHashById.get(record.base.id) !== record.versionHash,
                )
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
                  async record =>
                    [record.sourceRecordId, await createHash(record)] as const,
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
            async reportProgress => {
              const geometryCache = options.cacheArtefacts
                ? await openNormalisedArtefactCache({
                    filePath: preparedUpload.filePath,
                    processingContract: [
                      'hkgov-pland-division-geometry-brotli-v1',
                      previewPlan.source,
                    ].join(':'),
                  })
                : null
              const cached = geometryCache
                ? await geometryCache.read<CompressedPlanningDivisionGeometry>()
                : null
              if (isCompleteCompressedPlanningDivisionGeometry(cached, records)) {
                reportProgress(records.length)
                return cached
              }
              const compressed = compressPlanningDivisionGeometry(
                records,
                reportProgress,
              )
              if (geometryCache) await geometryCache.write(compressed)
              return compressed
            },
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
              const repairedGeometryRecords = records.filter(
                wasPlanningGeometryRepaired,
              )
              const audit = await retainDivisionProvenance(bucket, {
                releaseId,
                datasetCode,
                inputCount: records.length,
                outputCount: records.length,
                normalisation: planningDivisionRule.declaration,
                actions:
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
              })
              await deliverProcessingResult(target, bucket, audit.ref)
              await replaceDatasetStats(metaDb, releaseId, [
                ...(previewPlan.source === 'hkgov-pland-new-town'
                  ? []
                  : [3, 4, 5, 6]
                ).map(level => {
                  const groupValue = (
                    {
                      3: 'primary',
                      4: 'secondary',
                      5: 'tertiary',
                      6: 'subunits',
                    } as Record<number, string>
                  )[level]
                  if (!groupValue)
                    throw new Error(`Unknown Planning division level ${level}.`)
                  return {
                    ...statRow(
                      'units',
                      'count',
                      records.filter(record => record.base.level === level).length,
                      groupValue,
                    ),
                    groupBy: 'unit_distribution',
                  }
                }),
                ...planningDivisionChurn(
                  currentHistoryRows.map(row => ({
                    id: row.id,
                    versionHash: planningDivisionContentHash(row),
                  })),
                  records.map(record => ({
                    id: record.base.id,
                    versionHash: planningDivisionContentHash(record.base),
                  })),
                ),
                statRow('records', 'count', records.length, 'canonical_divisions'),
                statRow(
                  'source_features',
                  'count',
                  nativeRecords.length,
                  'planning_cells',
                ),
                statRow(
                  'source_quality',
                  'repaired',
                  records.filter(wasPlanningGeometryRepaired).length,
                  'ring_self_intersection',
                ),
              ])
            },
          )
          const counts = {
            importedRows: records.length,
            changedRows: changedHistoryIds.length,
            deletedRows: missingHistoryIds.length,
          }
          if (!target.remote) return counts
          const prepareSqlManifest = () =>
            runPlandProgressPhase(progress, 'Write', 'SQL import artefacts', () =>
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
          const importTargets = resolvePlandImportTargets(
            context,
            previewPlan.sourceVersion,
          )

          await importPlandSqlArtefacts(
            bucket,
            await prepareSqlManifest(),
            importTargets,
            importOptions,
            client,
            releaseId,
            releaseCode,
            progress,
          )
          return counts
        },
      )
    } finally {
      if (deliveryContext !== context) deliveryContext.cleanup()
    }
    await runPlandProgressPhase(progress, 'Complete', 'Planning processing', () =>
      client.stageCompleted(
        releaseId,
        'processDataset',
        {
          resourceType: 'division',
          sourceRows: previewPlan.rowCount,
          ...completionCounts,
        },
        releaseCode,
      ),
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
        refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          deliveryContext.state.dbCacheDir,
        ),
      )
    }
    if (isApiReleaseSetStatsReady(publishResult)) {
      const statsContext = target.remote
        ? await resolveLocalAddressDbContext(
            target,
            previewPlan.regionCode,
            previewPlan.sourceVersion,
            {
              cacheTableProfile: 'division',
              includePreviousShardYears: true,
              requireExistingRemoteCache: true,
              resumeSqlDeliveryReleaseId: releaseId,
            },
          )
        : context
      try {
        await calculateAndStoreApiReleaseSetStats({
          currentDb: statsContext.currentDb as unknown as HarbourReadableDb,
          historyTargets: statsContext.historyTargets,
          family: 'division',
          harbourClient: client,
          importOptions: resolvePlandImportOptions(target, statsContext),
          metaDb: statsContext.metaDb as unknown as HarbourReadableDb &
            HarbourWritableDb,
          progress,
          releaseCode,
          releaseId,
          target: resolveApiReleaseSetStatsTarget(publishResult),
        })
      } finally {
        if (statsContext !== context) statsContext.cleanup()
      }
    }
    await completeSqlDeliveryRelease(deliveryContext.state.dbCacheDir, releaseId)
    return {
      importedRows: completionCounts.importedRows,
      publishResult,
      snapshotId: snapshot.id,
    }
  } catch (error) {
    await retainProcessingFailure({
      error,
      store: bucket,
      target,
      releaseId,
      datasetCode,
    })
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
