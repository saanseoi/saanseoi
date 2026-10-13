import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssembly,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
import { createDivisionPointGuard } from '@repo/core/pipeline/services/divisions/divisionPoint'
import { getPreparedPublication } from '@repo/core/pipeline/services/publication/execute.ts'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { sourceSchema, toIsoTimestamp } from '@repo/db'
import { eq } from 'drizzle-orm'
import {
  calculateAndStoreApiReleaseSetStats,
  isApiReleaseSetStatsReady,
  resolveApiReleaseSetStatsTarget,
} from '../../api/apiReleaseSetStats'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { deliverProcessingResult } from '../../api/provenance'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import { refreshRemoteMetaCache } from '../../dbCache/localDbCache.ts'
import { resolveRemoteCacheDir } from '../../dbCache/localDbCacheTargets.ts'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { openNormalisedArtefactCache } from '../local/normalisedArtefactCache.ts'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
} from '../local/snapshotPublication.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { retainDivisionProvenance } from './divisionProvenance'
import { deliverPlandWorkflow, type PlandDeliveryCounts } from './plandDelivery.ts'
import { reusePlanningCanonicalProvenance } from './planningCanonicalReuse.ts'
import {
  planningDivisionChurn,
  planningDivisionContentHash,
} from './planningDivisionChurn'
import {
  LOCAL_RELEASE_ROOT,
  PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
} from './processLocalHkgovPlandDivisionSqlUploadConfig.ts'
import {
  resolvePlandImportOptions,
  runPlandProgressPhase,
} from './processLocalHkgovPlandDivisionSqlUploadImport.ts'
import {
  listCurrentHistoryRows,
  loadPlandNewTownDivisionCodes,
  planningDivisionRule,
  readPreparedDivisions,
  validatePreparedDivisions,
  wasPlanningGeometryRepaired,
} from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'
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
import type {
  CompressedPlanningDivisionGeometry,
  HkgovPlandDivisionUploadPlan,
  UploadResult,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'

export async function processLocalHkgovPlandDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: HkgovPlandDivisionUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    cacheArtefacts?: boolean
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const resourceReleaseId = requireString(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const progress = new OperationProgress()
  const bucket = new LocalPipelineBucket(releaseRoot)
  await runPlandProgressPhase(progress, 'Prepare', 'workspace', () =>
    bucket.seedRawObject(rawObjectKey, preparedUpload.filePath),
  )
  const context = await runPlandProgressPhase(progress, 'Prepare', 'database', () =>
    resolveCurrentWriteContext(
      target,
      previewPlan.regionCode,
      previewPlan.sourceVersion,
      {
        resumeSqlDeliveryReleaseId: resourceReleaseId,
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

  let failureAuditScope: import('@repo/core/provenance').AuditScope = {
    stage: 'preparation',
    ownerId: resourceReleaseId,
  }

  try {
    const { snapshot } = await runPlandProgressPhase(
      progress,
      'Prepare',
      'division snapshot',
      async () => {
        await syncStagedReleaseIntoLocalMetaCache(
          context.metaDb,
          { datasetCode, rawObjectKey, releaseCode, resourceReleaseId },
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
          resourceReleaseId,
          'processDataset',
          { resourceType: 'division', sourceRows: previewPlan.rowCount },
          releaseCode,
        )

        const dataset = await waitForDatasetRecord(metaDb, { resourceReleaseId })
        if (!dataset) throw new Error(`Release not found: ${resourceReleaseId}`)
        const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'division', {
          cohortKey: previewPlan.cohortKey,
          datasetCode,
          datasetId: dataset.datasetId,
          identityMode:
            previewPlan.source === 'hkgov-pland-new-town'
              ? 'cohort_scoped'
              : 'persistent',
          regionCode: previewPlan.regionCode,
          sourceReleaseId: dataset.resourceReleaseId,
          variant: previewPlan.source,
        })
        await upsertSnapshotSource(
          metaDb,
          snapshot.id,
          dataset.resourceReleaseId,
          PLANNING_DIVISION_SNAPSHOT_SOURCE_ROLE,
          {
            anchorReleaseId: dataset.resourceReleaseId,
            selectedByRule:
              previewPlan.source === 'hkgov-pland-new-town'
                ? 'assembly:division:pland-new-towns:v1'
                : 'assembly:division:pland-planning-units:v1',
            selectionMode: 'exact_ref',
          },
        )
        await recordSnapshotAssembly(metaDb, {
          snapshotId: snapshot.id,
          resourceType: 'division',
          anchorReleaseId: dataset.resourceReleaseId,
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
          upsertReleaseShardAssignment(
            metaDb,
            dataset.resourceReleaseId,
            historyShard.id,
          ),
          upsertReleaseShardAssignment(
            metaDb,
            dataset.resourceReleaseId,
            sourceShard.id,
          ),
          upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id),
        ])
        return { dataset, snapshot }
      },
    )
    const deliveryContext = context
    let completionCounts: PlandDeliveryCounts
    failureAuditScope = { stage: 'assembly', ownerId: snapshot.id }
    try {
      completionCounts = await deliverPlandWorkflow(
        {
          context: deliveryContext,
          resourceReleaseId,
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
          const pointGuard = createDivisionPointGuard()
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
                pointGuard,
              ),
          )
          validatePreparedDivisions(records, previewPlan.rowCount)
          const now = toIsoTimestamp()
          const publication: PublicationPreparation = {
            table: 'divisionPublicationState',
            scopeId: snapshot.snapshotLineageId,
            snapshotId: snapshot.id,
            publicationToken: resourceReleaseId,
            timestamp: now,
          }
          const publicationDb = context.currentDb
          publication.previous = await getPreparedPublication(
            publicationDb as never,
            publication.table,
            publication.scopeId,
          )
          await beginSnapshotPublication(publicationDb, publication)
          context = {
            ...context,
            currentDb: guardSnapshotPublicationWrites(publicationDb, publication),
          }
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
                metaDb,
                context.historyTargets.map(target => target.db as HarbourReadableDb),
                snapshot.parentSnapshotId,
                previewPlan.source,
              )
              await reusePlanningCanonicalProvenance(records, currentHistoryRows)
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
                missingHistoryIds,
                snapshot.id,
                previewPlan.cohortKey,
                now,
              )
              await closeNativeSourceRows(
                context.sourceDb as unknown as HarbourWritableDb,
                nativeSourceTable,
                [...changedNativeIds, ...missingNativeIds],
                previewPlan.sourceVersion,
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
                publication.scopeId,
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
                context.currentDb as unknown as HarbourReadableDb & HarbourWritableDb,
                publication.scopeId,
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
                resourceReleaseId,
                previewPlan.cohortKey,
                changedHistoryRecords,
                compressedGeometryByDivisionId,
                now,
                reportProgress,
              )
              await insertHistoryI18nRows(
                context.historyDb as unknown as HarbourWritableDb,
                snapshot.id,
                resourceReleaseId,
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
                resourceReleaseId,
                previewPlan.sourceVersion,
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
                scope: { stage: 'assembly', ownerId: snapshot.id },
                resourceReleaseId,
                datasetCode,
                inputCount: records.length,
                outputCount: records.length,
                normalisation: planningDivisionRule.declaration,
                guards: pointGuard.snapshot(),
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
                                ? record.cells
                                    .filter(cell => cell.wasGeometryRepaired)
                                    .map(cell => ({
                                      properties: cell.properties,
                                      sourceRecordId: cell.sourceRecordId,
                                    }))
                                : record.newTown
                                  ? {
                                      properties: record.newTown.properties,
                                      sourceRecordId: record.newTown.sourceRecordId,
                                    }
                                  : null,
                          })),
                          mode: 'automatic',
                          summary:
                            'Repaired known Planning Department polygon self-intersections with buffer(0); publisher geometry remains in source records and repaired geometry is stored in canonical divisions.',
                        },
                      ]
                    : [],
              })
              await deliverProcessingResult(target, bucket, audit.ref)
              await replaceDatasetStats(metaDb, resourceReleaseId, [
                ...(previewPlan.source === 'hkgov-pland-new-town'
                  ? []
                  : [3, 4, 5, 6]
                ).map(level => {
                  const dimensionValue = (
                    {
                      3: 'primary',
                      4: 'secondary',
                      5: 'tertiary',
                      6: 'subunits',
                    } as Record<number, string>
                  )[level]
                  if (!dimensionValue)
                    throw new Error(`Unknown Planning division level ${level}.`)
                  return {
                    ...statRow(
                      'units',
                      'count',
                      records.filter(record => record.base.level === level).length,
                      dimensionValue,
                    ),
                    dimension: 'unit_distribution',
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
          await completeSnapshotPublication(
            publicationDb,
            publication,
            [
              buildPublicationRowCountSql(
                'divisions',
                publication.scopeId,
                records.length,
              ),
              buildPublicationRowCountSql(
                'divisionsI18n',
                publication.scopeId,
                records.reduce((sum, record) => sum + record.i18n.length, 0),
              ),
            ].join(' AND '),
          )
          const counts = {
            importedRows: records.length,
            changedRows: changedHistoryIds.length,
            deletedRows: missingHistoryIds.length,
          }
          return counts
        },
      )
    } finally {
      if (deliveryContext !== context) deliveryContext.cleanup()
    }
    await runPlandProgressPhase(progress, 'Complete', 'Planning processing', () =>
      client.stageCompleted(
        resourceReleaseId,
        'processDataset',
        {
          resourceType: 'division',
          sourceRows: previewPlan.rowCount,
          processedRows: completionCounts.importedRows,
          changedRows: completionCounts.changedRows,
          deletedRows: completionCounts.deletedRows,
        } satisfies DatasetProcessingStats & Record<string, unknown>,
        releaseCode,
      ),
    )
    const publishResult = await runPlandProgressPhase(
      progress,
      'Publish',
      'division snapshot',
      () =>
        client.publishDataset(resourceReleaseId, releaseCode, {
          deferApiReleaseSet: options.deferApiReleaseSet,
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )
    published = true

    if (target.remote) {
      await runPlandProgressPhase(progress, 'Refresh', 'shared database cache', () =>
        refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          deliveryContext.state.dbCacheDir,
          resourceReleaseId,
        ),
      )
    }
    if (!options.deferApiReleaseSet && isApiReleaseSetStatsReady(publishResult)) {
      const statsContext = target.remote
        ? await resolveCurrentWriteContext(
            target,
            previewPlan.regionCode,
            previewPlan.sourceVersion,
            {
              resumeSqlDeliveryReleaseId: resourceReleaseId,
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
          resourceReleaseId,
          target: resolveApiReleaseSetStatsTarget(publishResult),
        })
      } finally {
        if (statsContext !== context) statsContext.cleanup()
      }
    }
    await completeSqlDeliveryRelease(
      deliveryContext.state.dbCacheDir,
      resourceReleaseId,
    )
    return {
      importedRows: completionCounts.importedRows,
      publishResult,
      snapshotId: snapshot.id,
    }
  } catch (error) {
    await retainProcessingFailure({
      scope: failureAuditScope,
      error,
      store: bucket,
      target,
      resourceReleaseId,
      datasetCode,
    })
    progress.fail()
    if (!published) {
      await client
        .stageFailed(
          resourceReleaseId,
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

export { resolvePlandDivisionCode } from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'
export { splitPlandSqlText } from './processLocalHkgovPlandDivisionSqlUploadSql.ts'
export type { HkgovPlandDivisionUploadPlan } from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'
