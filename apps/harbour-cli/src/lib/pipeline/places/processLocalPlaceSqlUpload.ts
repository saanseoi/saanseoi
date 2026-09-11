import { PlaceRecordCache } from './placeRecordCache.ts'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { deliverSqlPhase } from '../local/sqlDeliveryPhase.ts'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type {
  HarbourClient,
  PublishDatasetResult,
} from '@repo/core/pipeline/harbourClient'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { deliverProducerAudit } from '../../api/producerAuditDelivery'
import { retainPlaceProvenance } from './placeProvenance'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { calculateAndStoreApiReleaseSetStats } from '../../api/apiReleaseSetStats.ts'
import { resolveApiReleaseSetStatsTarget } from '../../api/apiReleaseSetStats.ts'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import type { UploadTarget } from '../../cli/options.ts'
import type { NormalisedPlace } from '@repo/core/pipeline/services/places/place'
import type { StagedAddressResolution } from './supplementaryPlaceAddress.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import {
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
} from '../../dbCache/localDbCache.ts'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import { executeSqlText, type SqlImportExecutionOptions } from '../local/sqlImport.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import type {
  BuildPlaceSqlInput,
  PlaceUploadPlan,
  UploadResult,
} from './processLocalPlaceSqlUploadTypes.ts'
import {
  findTargetBindingName,
  importPlaceSqlBatches,
  normaliseError,
  required,
  resolveShardYear,
  runPlaceProgressPhase,
  targetName,
} from './processLocalPlaceSqlUploadImport.ts'
import { LOCAL_RELEASE_ROOT } from './processLocalPlaceSqlUploadConfig.ts'
import {
  readStagedJsonLines,
  resolvePlaceSnapshots,
  stageEnrichedPlaces,
  stagePlaces,
} from './processLocalPlaceSqlUploadPreparation.ts'
import {
  loadCurrentPlaceHistory,
  loadCurrentPlaceSources,
} from './processLocalPlaceSqlUploadRows.ts'
import {
  buildPlaceMetadataSql,
  placeTargets,
  upsertPlaceMetadata,
} from './processLocalPlaceSqlUploadMetadata.ts'
import { prepareSupplementaryAddresses } from './processLocalPlaceSqlUploadSupplementary.ts'
import { buildPlaceReleaseStatsRowsFromAccumulator } from './processLocalPlaceSqlUploadStatistics.ts'
import { getPreparedPublication } from '../local/snapshotPublication.ts'
import { PlaceDependencyView } from './placeDependencyView.ts'

/**
 * Materialises an Overture Places release. The lifecycle is intentionally
 * family-neutral at its edges: registration, cache preparation, staged
 * progress, SQL import, publication, and failure reporting are the same
 * operations used by the address and division adapters.
 */
export async function processLocalPlaceSqlUpload(
  target: UploadTarget,
  previewPlan: PlaceUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferApiReleaseSet?: boolean
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const releaseId = required(uploadResult.releaseId, 'releaseId')
  const releaseCode = required(uploadResult.releaseCode, 'releaseCode')
  const datasetId = required(uploadResult.datasetId, 'datasetId')
  const datasetCode = required(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = required(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = resolveShardYear(previewPlan.cohortKey, previewPlan.sourceVersion)
  const releaseRoot = resolve(LOCAL_RELEASE_ROOT, targetName(target), releaseCode)
  await mkdir(releaseRoot, { recursive: true })

  const bucket = new LocalPipelineBucket(releaseRoot)
  const progress = new OperationProgress()
  let recordCache: PlaceRecordCache | undefined
  let dbContext: Awaited<ReturnType<typeof resolveCurrentWriteContext>> | undefined
  let dependencies: PlaceDependencyView | undefined
  let client: HarbourClient | undefined
  let shouldRefreshRemoteMetaCache = false
  let completed = false
  let postPublishCacheError: Error | null = null
  let publishResult: PublishDatasetResult | void | null = null

  try {
    recordCache = new PlaceRecordCache(
      resolve(
        LOCAL_RELEASE_ROOT,
        targetName(target),
        'place-record-cache',
        `${datasetCode}.sqlite`,
      ),
    )
    await runPlaceProgressPhase(progress, 'Prepare', 'workspace', () =>
      bucket.seedRawObject(rawObjectKey, preparedUpload.filePath),
    )
    const mirrorStartedAt = Date.now()
    dbContext = await runPlaceProgressPhase(
      progress,
      'Open local D1',
      'Places data',
      () =>
        resolveCurrentWriteContext(target, previewPlan.regionCode, shardYear, {
          resumeSqlDeliveryReleaseId: releaseId,
        }),
    )
    const context = dbContext
    const mirrorPreparationMs = Date.now() - mirrorStartedAt
    if (!context) throw new Error('Places database context was not opened.')

    const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    dependencies = await PlaceDependencyView.create({
      metaDb,
      historyTargets: context.historyTargets,
    })
    const dependencyView = dependencies
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
      resourceType: previewPlan.resourceType,
      processingMode: 'sql',
      ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
    }
    await runPlaceProgressPhase(progress, 'Sync down', 'release metadata', () =>
      syncStagedReleaseIntoLocalMetaCache(
        metaDb as never,
        { datasetCode, rawObjectKey, releaseCode, releaseId },
        message,
        { retainedDeliveryCacheDir: context.state.dbCacheDir },
      ),
    )

    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const processingClient = target.remote
      ? remoteClient
      : createLocalControlClient(metaDb as never, { publishClient: remoteClient })
    client = processingClient
    const importOptions: SqlImportExecutionOptions = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_D1_TOKEN,
      isLocal: !target.remote,
      localWriteMaxRetries: 8,
      metaDatabaseId: context.state.bindings.DB_META?.databaseId ?? null,
      remoteImportBatchBytes: 64 * 1024 * 1024,
    }
    await runPlaceProgressPhase(progress, 'Mark as', "'processing'", () =>
      processingClient.stageRunning(
        releaseId,
        'processDataset',
        undefined,
        releaseCode,
      ),
    )
    const snapshots = await runPlaceProgressPhase(
      progress,
      'Prepare',
      'Place snapshots',
      () =>
        resolvePlaceSnapshots(
          metaDb,
          context.currentDb as unknown as HarbourReadableDb,
          previewPlan,
          datasetId,
          releaseId,
          dependencies,
        ),
    )
    const publicationPrevious = await getPreparedPublication(
      context.currentDb as unknown as HarbourReadableDb,
      'placePublicationState',
      snapshots.snapshotLineageId,
    )
    const stagedPlaces = await runPlaceProgressPhase(
      progress,
      'Read and normalise',
      'source Places',
      async reportProgress =>
        stagePlaces(
          bucket,
          rawObjectKey,
          previewPlan.sourceVersion,
          releaseRoot,
          current => reportProgress(current),
          await deliveryFileSha256(preparedUpload.filePath),
          recordCache,
        ),
      previewPlan.rowCount,
    )
    const historyRows = await runPlaceProgressPhase(
      progress,
      'Prepare',
      'Place history',
      async () =>
        loadCurrentPlaceHistory(context.historyTargets, {
          currentDb: context.currentDb as unknown as HarbourReadableDb,
          scopeId: snapshots.snapshotLineageId,
          replayPlan: publicationPrevious
            ? await resolveSnapshotReplayPlan(metaDb, publicationPrevious.snapshotId)
            : [],
        }),
    )
    const targets = await placeTargets(
      context,
      metaDb,
      target,
      previewPlan.regionCode,
      shardYear,
    )
    const supplementary = await runPlaceProgressPhase(
      progress,
      'Analyse',
      'official Address definitions',
      reportProgress =>
        prepareSupplementaryAddresses({
          recordCache,
          context,
          dependencyDb: dependencyView.db,
          metaDb,
          snapshots,
          places: readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
          historyRows,
          releaseRoot,
          plan: previewPlan,
          releaseId,
          datasetId,
          targets,
          importOptions,
          retainAudit: async (auditReleaseId, auditDatasetCode, addresses) =>
            deliverProducerAudit({
              target,
              directory: resolve(releaseRoot, `provenance-${auditReleaseId}`),
              allowFailed: auditReleaseId === releaseId,
              identity:
                addresses.materialisationHash ??
                JSON.stringify({
                  resolutions: await deliveryFileSha256(addresses.resolutionPath),
                  fixture: addresses.fixture,
                }),
              retain: store =>
                retainPlaceProvenance(store, {
                  releaseId: auditReleaseId,
                  datasetCode: auditDatasetCode,
                  addresses,
                  ...(auditReleaseId === releaseId ? { staged: stagedPlaces } : {}),
                }),
            }),
          onProgress: current => reportProgress(current, 'Place Address candidates'),
          onStage: subject => reportProgress(0, subject),
        }),
      stagedPlaces.includedRows,
    )
    const stagedEnrichedPlaces = await runPlaceProgressPhase(
      progress,
      'Match and enrich',
      'Places',
      reportProgress =>
        stageEnrichedPlaces(
          dependencyView.db,
          snapshots,
          readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
          readStagedJsonLines<StagedAddressResolution>(supplementary.resolutionPath),
          releaseRoot,
          current => reportProgress(current),
          supplementary,
          stagedPlaces.path,
          recordCache,
        ),
      stagedPlaces.includedRows,
    )
    const sqlInput: BuildPlaceSqlInput = {
      sourceRows: await runPlaceProgressPhase(
        progress,
        'Prepare',
        'Place source hashes',
        () => loadCurrentPlaceSources(context.sourceTargets),
      ),
      activeHistoryBindingName: findTargetBindingName(
        context.historyTargets,
        context.historyDb,
      ),
      activeSourceBindingName: findTargetBindingName(
        context.sourceTargets,
        context.sourceDb,
      ),
      sourceBindingNames: context.sourceTargets.map(target => target.bindingName),
      datasetId,
      message,
      snapshots,
      publicationPrevious,
      places: [],
      historyRows,
    }
    const sqlTimestamp = new Date().toISOString()
    const sqlDelivery = {
      timings: { mirrorPreparationMs },
      directory: resolve(releaseRoot, 'sql-delivery-places'),
      context,
      releaseId,
      inputs: {
        sourceSqlStrategy: 'changed-payloads-v1',
        message,
        snapshots,
        enrichedSha256: await deliveryFileSha256(stagedEnrichedPlaces.path),
      },
      accountId: importOptions.accountId,
      apiToken: importOptions.apiToken,
    }

    await runPlaceProgressPhase(
      progress,
      'Calculate',
      'release statistics',
      () =>
        replaceDatasetStats(
          metaDb,
          releaseId,
          buildPlaceReleaseStatsRowsFromAccumulator(stagedEnrichedPlaces.stats),
        ),
      stagedEnrichedPlaces.processedRows,
    )

    await runPlaceProgressPhase(progress, 'Write', 'release metadata', () =>
      upsertPlaceMetadata(
        metaDb,
        { ...snapshots, supplementaryAddressSnapshotId: supplementary.snapshotId },
        datasetId,
        releaseId,
        previewPlan,
        target,
      ),
    )
    if (target.remote) {
      await runPlaceProgressPhase(progress, 'Import SQL', 'snapshot metadata', () =>
        deliverSqlPhase(
          {
            context,
            releaseId,
            phase: 'places-metadata',
            inputs: sqlDelivery?.inputs ?? {},
          },
          () =>
            buildPlaceMetadataSql(metaDb, snapshots.snapshotId, releaseId).then(sql =>
              executeSqlText(targets.meta, sql, importOptions),
            ),
        ),
      )
    }
    await runPlaceProgressPhase(
      progress,
      'Generate and import SQL',
      'Places',
      reportProgress =>
        importPlaceSqlBatches(
          targets,
          sqlInput,
          stagedEnrichedPlaces.path,
          stagedEnrichedPlaces.processedRows,
          sqlTimestamp,
          importOptions,
          event =>
            reportProgress(
              event.current,
              event.detail ?? (event.phase === 'generate' ? 'generation' : 'import'),
            ),
          sqlDelivery,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    await runPlaceProgressPhase(
      progress,
      'Mark as',
      "'completed'",
      () =>
        processingClient.stageCompleted(
          releaseId,
          'extractPlaces',
          {
            processedRows: stagedEnrichedPlaces.processedRows,
            addressLinkedRows: stagedEnrichedPlaces.stats.addressLinkedRows,
            divisionLinkedRows: stagedEnrichedPlaces.stats.divisionLinkedRows,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    await runPlaceProgressPhase(
      progress,
      'Mark as',
      "'completed'",
      () =>
        processingClient.stageCompleted(
          releaseId,
          'extractPlacesI18n',
          {
            localisedRows: stagedEnrichedPlaces.stats.localisedRows,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.stats.localisedRows,
    )
    await runPlaceProgressPhase(
      progress,
      'Retain',
      'Places processing provenance',
      async () =>
        deliverProducerAudit({
          target,
          directory: resolve(releaseRoot, `provenance-${releaseId}`),
          identity: JSON.stringify({
            source: await deliveryFileSha256(stagedPlaces.path),
            enriched: sqlDelivery.inputs.enrichedSha256,
            supplementary: supplementary.audit.materialisationHash,
          }),
          retain: store =>
            retainPlaceProvenance(store, {
              releaseId,
              datasetCode,
              staged: stagedPlaces,
              addresses: supplementary.audit,
            }),
        }),
    )
    await runPlaceProgressPhase(progress, 'Publish', 'curated Address collection', () =>
      processingClient.publishDataset(
        supplementary.releaseId,
        supplementary.releaseCode,
        {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'default',
            },
            {
              resourceType: 'division',
              snapshotId: snapshots.divisionSnapshotId,
              variant: 'overture',
            },
          ],
          deferSourcePublish: true,
          deferApiReleaseSet: options.deferApiReleaseSet,
          skipSnapshotCleanup: true,
        },
      ),
    )
    publishResult = (await runPlaceProgressPhase(
      progress,
      'Publish',
      'source release',
      () =>
        processingClient.publishDataset(releaseId, releaseCode, {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'default',
            },
            {
              resourceType: 'division',
              snapshotId: snapshots.divisionSnapshotId,
              variant: 'overture',
            },
          ],
          deferApiReleaseSet: options.deferApiReleaseSet,
          skipSnapshotCleanup: options.skipSnapshotCleanup,
        }),
    )) as PublishDatasetResult | void
    if (target.remote) {
      try {
        const cacheImportOptions: SqlImportExecutionOptions = {
          ...importOptions,
          accountId: undefined,
          apiToken: undefined,
          isLocal: true,
        }
        await runPlaceProgressPhase(
          progress,
          'Sync down',
          'remote cache',
          reportProgress =>
            replayRemoteCacheWithRetry(
              target.environment === 'production' ? 'production' : 'preview',
              context.state.dbCacheDir,
              releaseCode,
              async () => {
                await importPlaceSqlBatches(
                  targets,
                  sqlInput,
                  stagedEnrichedPlaces.path,
                  stagedEnrichedPlaces.processedRows,
                  sqlTimestamp,
                  cacheImportOptions,
                  event =>
                    reportProgress(
                      event.current,
                      event.detail ?? `remote cache SQL ${event.phase}`,
                    ),
                  sqlDelivery,
                )
              },
            ),
          stagedEnrichedPlaces.processedRows,
        )
        shouldRefreshRemoteMetaCache = true
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (postPublishCacheError) throw postPublishCacheError
    if (!options.deferApiReleaseSet) {
      await calculateAndStoreApiReleaseSetStats({
        family: 'place',
        currentDb: context.currentDb as unknown as HarbourReadableDb,
        harbourClient: processingClient,
        importOptions: {
          accountId: importOptions.accountId,
          apiToken: importOptions.apiToken,
          isLocal: importOptions.isLocal,
          metaDatabaseId: importOptions.metaDatabaseId,
        },
        metaDb,
        progress,
        releaseCode,
        releaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await runPlaceProgressPhase(
      progress,
      'Complete',
      'Places processing',
      () =>
        processingClient.stageCompleted(
          releaseId,
          'processDataset',
          {
            processedRows: stagedEnrichedPlaces.processedRows,
            snapshotId: snapshots.snapshotId,
          },
          releaseCode,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    progress.finish('Places processing complete')
    completed = true
  } catch (error) {
    await retainProcessingFailure({
      error,
      target,
      releaseId,
      datasetCode,
      store: new LocalPipelineBucket(resolve(releaseRoot, `provenance-${releaseId}`)),
    })
    progress.fail(error)
    await client
      ?.stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    await dependencies?.close()
    if (recordCache) {
      for (const [stage, counts] of recordCache.counts)
        console.info(
          `Places ${stage}: ${counts.reused} reused, ${counts.computed} computed`,
        )
      recordCache.close()
    }
    if (!target.remote && completed && dbContext)
      await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
    dbContext?.cleanup()
    if (shouldRefreshRemoteMetaCache && target.remote && dbContext) {
      try {
        await refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
          releaseId,
        )
        if (!postPublishCacheError)
          await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
  }

  if (postPublishCacheError) throw postPublishCacheError

  return { publishResult }
}

export {
  buildPlaceCountryReviewProcessingActions,
  buildPlaceLocaleConflictProcessingActions,
  isExcludedOverturePlace,
} from './processLocalPlaceSqlUploadPreparation.ts'

export { prepareSupplementaryAddresses } from './processLocalPlaceSqlUploadSupplementary.ts'

export { buildPlaceSql } from './processLocalPlaceSqlUploadRows.ts'

export { buildPlaceReleaseStatsRows } from './processLocalPlaceSqlUploadStatistics.ts'
