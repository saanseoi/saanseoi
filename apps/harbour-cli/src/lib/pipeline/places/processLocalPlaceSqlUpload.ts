import { readPlaceSnapshotSource } from './placeAttribution'
import {
  deliverRecordEvidence,
  readRetainedProvenanceObject,
} from '../../api/provenance'
import { hydratePlaceIdentityHistory } from './placeIdentityHistory'
import {
  stagePlaceIdentities,
  canonicalAddressResolutions,
} from './placeIdentityPreparation'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
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
import { retainPlaceSourceAudit } from './placeSourceAudit'
import { buildPlaceReleaseStatsRowsFromAccumulator } from './processLocalPlaceSqlUploadStatistics.ts'
import { getPreparedPublication } from '../local/snapshotPublication.ts'
import { PlaceDependencyView } from './placeDependencyView.ts'
import { buildPlaceSourceStats } from './placeSourceStats.ts'

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
  const resourceReleaseId = required(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
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

  let failureAuditScope: import('@repo/core/provenance').AuditScope = {
    stage: 'preparation',
    ownerId: resourceReleaseId,
  }

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
          resumeSqlDeliveryReleaseId: resourceReleaseId,
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
      resourceReleaseId,
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
        { datasetCode, rawObjectKey, releaseCode, resourceReleaseId },
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
        resourceReleaseId,
        'processDataset',
        { resourceType: previewPlan.resourceType, sourceRows: previewPlan.rowCount },
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
          resourceReleaseId,
          dependencies,
        ),
    )
    failureAuditScope = { stage: 'assembly', ownerId: snapshots.snapshotId }
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
    const identities = await runPlaceProgressPhase(
      progress,
      'Match',
      'Place identities',
      async () => {
        await hydratePlaceIdentityHistory(metaDb, historyRows, ref =>
          readRetainedProvenanceObject(target, ref),
        )
        return stagePlaceIdentities({
          sourcePath: stagedPlaces.path,
          historyRows,
          scope: snapshots.snapshotLineageId,
          predecessorSnapshotId: publicationPrevious?.snapshotId ?? null,
          sourceVersion: previewPlan.sourceVersion,
          releaseRoot,
        })
      },
    )
    const supplementary = await runPlaceProgressPhase(
      progress,
      'Analyse',
      'official Address definitions',
      reportProgress =>
        prepareSupplementaryAddresses({
          placeIdentities: identities.bySourceId,
          recordCache,
          context,
          dependencyDb: dependencyView.db,
          metaDb,
          snapshots,
          places: readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
          historyRows,
          releaseRoot,
          plan: previewPlan,
          resourceReleaseId,
          datasetId,
          targets,
          importOptions,
          retainAudit: async (auditReleaseId, auditDatasetCode, addresses) =>
            deliverProducerAudit({
              target,
              directory: resolve(
                releaseRoot,
                `provenance-${auditReleaseId}-${addresses.snapshotId}`,
              ),
              allowFailed: auditReleaseId === resourceReleaseId,
              identity: JSON.stringify({
                addresses: addresses.materialisationHash ?? {
                  resolutions: await deliveryFileSha256(addresses.resolutionPath),
                  fixture: addresses.fixture,
                },
                ...(auditReleaseId === resourceReleaseId
                  ? {
                      identities: await deliveryFileSha256(identities.path),
                      computationContract: recordCache?.contract,
                    }
                  : {}),
              }),
              retain: store =>
                retainPlaceProvenance(store, {
                  snapshotId: addresses.snapshotId,
                  resourceReleaseId: auditReleaseId,
                  datasetCode: auditDatasetCode,
                  addresses,
                  ...(auditReleaseId === resourceReleaseId
                    ? {
                        staged: stagedPlaces,
                        identityPath: identities.path,
                        identityLedger: identities.ledger,
                      }
                    : {}),
                }),
            }),
          onProgress: current => reportProgress(current, 'Place Address candidates'),
          onStage: subject => reportProgress(0, subject),
        }),
      stagedPlaces.includedRows,
    )
    const divisionSource = await readPlaceSnapshotSource(
      metaDb,
      snapshots.divisionSnapshotId,
    )
    const addressSource = await readPlaceSnapshotSource(
      metaDb,
      snapshots.addressSnapshotId,
    )
    const stagedEnrichedPlaces = await runPlaceProgressPhase(
      progress,
      'Match and enrich',
      'Places',
      reportProgress =>
        stageEnrichedPlaces(
          dependencyView.db,
          { ...snapshots, divisionSource, addressSource },
          readStagedJsonLines<NormalisedPlace>(identities.path),
          canonicalAddressResolutions(
            supplementary.resolutionPath,
            identities.bySourceId,
          ),
          releaseRoot,
          current => reportProgress(current),
          supplementary,
          identities.path,
          recordCache,
        ),
      stagedPlaces.includedRows,
    )
    // The sealed enriched file and identity ledger now carry preparation output.
    // SQL generation reloads its exact predecessor under the delivery lock, so
    // retaining the earlier matching view would duplicate the full history graph.
    historyRows.length = 0
    identities.bySourceId.clear()
    await dependencies.close()
    dependencies = undefined
    Bun.gc(true)
    const sourceRows = await runPlaceProgressPhase(
      progress,
      'Prepare',
      'Place source hashes',
      () => loadCurrentPlaceSources(context.sourceTargets),
    )
    const activeHistoryBindingName = findTargetBindingName(
      context.historyTargets,
      context.historyDb,
    )
    const activeSourceBindingName = findTargetBindingName(
      context.sourceTargets,
      context.sourceDb,
    )
    const sourceShardNames = [
      activeSourceBindingName,
      ...new Set([...sourceRows.values()].map(row => row.bindingName)),
    ]
    const sqlInput: BuildPlaceSqlInput = {
      retainEvidence: documents => deliverRecordEvidence(target, documents),
      sourceRows,
      activeHistoryBindingName,
      activeSourceBindingName,
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
      resourceReleaseId,
      inputs: {
        sourceSqlStrategy: 'cross-shard-source-continuity-v1',
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
      async () =>
        replaceDatasetStats(metaDb, resourceReleaseId, [
          ...buildPlaceReleaseStatsRowsFromAccumulator(stagedEnrichedPlaces.stats),
          ...(await buildPlaceSourceStats({
            metaDb,
            sourceDbs: context.sourceTargets.map(
              target => target.db as HarbourReadableDb,
            ),
            datasetId,
            sourceVersion: previewPlan.sourceVersion,
            places: readStagedJsonLines<NormalisedPlace>(stagedPlaces.path),
          })),
        ]),
      stagedEnrichedPlaces.processedRows,
    )

    await runPlaceProgressPhase(progress, 'Write', 'release metadata', () =>
      upsertPlaceMetadata(
        metaDb,
        { ...snapshots, supplementaryAddressSnapshotId: supplementary.snapshotId },
        datasetId,
        resourceReleaseId,
        previewPlan,
        target,
        { sourceBindingNames: sourceShardNames },
      ),
    )
    if (target.remote) {
      await runPlaceProgressPhase(progress, 'Import SQL', 'snapshot metadata', () =>
        deliverSqlPhase(
          {
            context,
            resourceReleaseId,
            phase: 'places-metadata',
            inputs: sqlDelivery?.inputs ?? {},
          },
          () =>
            buildPlaceMetadataSql(metaDb, snapshots.snapshotId, resourceReleaseId).then(
              sql => executeSqlText(targets.meta, sql, importOptions),
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
          resourceReleaseId,
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
          resourceReleaseId,
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
      'Places source ingestion provenance',
      () =>
        deliverProducerAudit({
          target,
          directory: resolve(releaseRoot, `source-provenance-${resourceReleaseId}`),
          identity: JSON.stringify({
            source: sqlDelivery.inputs.enrichedSha256,
            retainedCount: stagedEnrichedPlaces.processedRows,
          }),
          retain: store =>
            retainPlaceSourceAudit(store, {
              resourceReleaseId,
              datasetCode,
              retainedCount: stagedEnrichedPlaces.processedRows,
            }),
        }),
    )
    await runPlaceProgressPhase(
      progress,
      'Retain',
      'Places processing provenance',
      async () =>
        deliverProducerAudit({
          target,
          directory: resolve(
            releaseRoot,
            `provenance-${resourceReleaseId}-${snapshots.snapshotId}`,
          ),
          identity: JSON.stringify({
            source: await deliveryFileSha256(stagedPlaces.path),
            enriched: sqlDelivery.inputs.enrichedSha256,
            supplementary: supplementary.audit.materialisationHash,
            identityLedger: identities.ledger.hash,
          }),
          retain: store =>
            retainPlaceProvenance(store, {
              snapshotId: snapshots.snapshotId,
              resourceReleaseId,
              datasetCode,
              staged: stagedPlaces,
              addresses: supplementary.audit,
              identityPath: identities.path,
              identityLedger: identities.ledger,
            }),
        }),
    )
    await runPlaceProgressPhase(progress, 'Publish', 'curated Address collection', () =>
      processingClient.publishDataset(
        supplementary.resourceReleaseId,
        supplementary.releaseCode,
        {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'hkgov-dpo',
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
        processingClient.publishDataset(resourceReleaseId, releaseCode, {
          carriedSnapshots: [
            {
              resourceType: 'address',
              snapshotId: snapshots.addressSnapshotId,
              variant: 'hkgov-dpo',
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
      // The replay comparison needs the publication branch just committed remotely.
      if (target.remote)
        await refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          context.state.dbCacheDir,
          resourceReleaseId,
        )
      await calculateAndStoreApiReleaseSetStats({
        family: 'place',
        historyTargets: context.historyTargets,
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
        resourceReleaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await runPlaceProgressPhase(
      progress,
      'Complete',
      'Places processing',
      () =>
        processingClient.stageCompleted(
          resourceReleaseId,
          'processDataset',
          {
            resourceType: previewPlan.resourceType,
            sourceRows: previewPlan.rowCount,
            processedRows: stagedEnrichedPlaces.processedRows,
            snapshotId: snapshots.snapshotId,
          } satisfies DatasetProcessingStats & Record<string, unknown>,
          releaseCode,
        ),
      stagedEnrichedPlaces.processedRows,
    )
    progress.finish('Places processing complete')
    completed = true
  } catch (error) {
    await retainProcessingFailure({
      scope: failureAuditScope,
      error,
      target,
      resourceReleaseId,
      datasetCode,
      store: new LocalPipelineBucket(
        resolve(
          releaseRoot,
          `provenance-${resourceReleaseId}-${failureAuditScope.ownerId}`,
        ),
      ),
    })
    progress.fail(error)
    await client
      ?.stageFailed(
        resourceReleaseId,
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
      await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, resourceReleaseId)
    dbContext?.cleanup()
    if (shouldRefreshRemoteMetaCache && target.remote && dbContext) {
      try {
        await refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
          resourceReleaseId,
        )
        if (!postPublishCacheError)
          await completeSqlDeliveryRelease(
            dbContext.state.dbCacheDir,
            resourceReleaseId,
          )
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
