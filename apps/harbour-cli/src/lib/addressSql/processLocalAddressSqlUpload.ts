import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HistoryDatabase } from '@repo/db'
import { boundedHistoryApply } from './boundedHistoryApply.ts'
import {
  getReplayedAddressVersionMap,
  prepareAddressVersionInsertContext,
} from '@repo/core/pipeline/db/address'
import {
  resolveLatestPublishedSnapshotForLineage,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import {
  createAddress3dExecutor,
  fileSha256,
  importAddress3dCollections,
  validateAddress3dPreparation,
} from './address3dImport'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  readAddressPreparationAudit,
  retainAddressProvenance,
} from './addressProvenance'
import { deliverProducerAudit } from '../api/producerAuditDelivery'
import { retainProcessingFailure } from '../api/processingFailureAudit'
import { buildAddressSqlImportRunId } from '@repo/core/pipeline/services/addressPipeline/sqlImport'
import {
  importAddressSqlArtefacts,
  completeAddressSqlGenerationPhases,
  publishImportedAddressSqlRelease,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import {
  normaliseAddressSqlChunkStage,
  writeAddressReleaseMetaSqlFile,
  writeAddressCurrentSqlChunkStage,
  writeAddressHistorySqlChunkStage,
  writeAddressSourceSqlChunkStage,
} from '@repo/core/pipeline/services/addressPipeline/sqlStages'
import {
  addAddressPipelineStats,
  EMPTY_ADDRESS_PIPELINE_STATS,
  type AddressPipelineMessage,
} from '@repo/core/pipeline/services/addressPipeline/types'
import {
  buildAddressReleaseStatsRows,
  type AddressDivisionQualityCounts,
} from '@repo/core/pipeline/services/stats'
import {
  buildAddressBaseHashInput,
  buildMatchKey,
  normaliseAddressI18nSnapshotRow,
} from '@repo/core/pipeline/services/addressPipeline/normalisation'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
  createLocalImportProgressClient,
  runLocalGenerationPhase,
  runLocalProgressPhase,
  writeLocalPipelineState,
} from '../localPipeline/orchestrator.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import {
  calculateAndStoreApiReleaseSetStats,
  resolveApiReleaseSetStatsTarget,
} from '../api/apiReleaseSetStats.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRetryLabel,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import {
  loadAddressCurrentLookupCache,
  writeAddressCurrentLookupCache,
} from './addressCurrentLookupCache.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
  readDeliveryPlan,
} from '../localPipeline/releaseSqlDelivery.ts'
import { completeSqlDeliveryRelease } from '../localPipeline/sqlDeliveryPending.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../localPipeline/nativeSqlDelivery.ts'
import { runReportedSqlImportPhase } from '../localPipeline/sqlImport.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import type { UploadPlan, UploadResult } from './processLocalAddressSqlUploadTypes.ts'
import {
  assertRemoteAddressImportPrerequisites,
  buildChunkRanges,
  buildFinalImportMessage,
  buildHistoricalAddressMatchKeyLookup,
  normaliseError,
  refreshRemoteMetaCacheAfterReplay,
  requireString,
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
  resolveShardYear,
  resolveTargetName,
  shouldIncludePreviousShardYears,
} from './processLocalAddressSqlUploadImport.ts'
import {
  ADDRESS_CHUNK_SIZE,
  GENERATION_CONCURRENCY,
  LOCAL_RELEASE_ROOT,
  LOCAL_SQL_WRITE_RETRY_LIMIT,
  REMOTE_IMPORT_BATCH_BYTES,
  SQL_STATEMENT_BYTE_TARGET,
} from './processLocalAddressSqlUploadConfig.ts'
import {
  buildAddressImportProgressConfig,
  updateDbCacheProgress,
} from './processLocalAddressSqlUploadProgress.ts'

export async function processLocalAddressSqlUpload(
  target: UploadTarget,
  previewPlan: UploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    quality?: AddressDivisionQualityCounts
    processingActions?: ReleaseProcessingAction[]
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const dataShardEnvironment =
    target.remote && target.environment === 'production' ? 'production' : 'preview'
  // The shared address stages resolve their shard environment from this
  // process variable. Keep CLI processing aligned with the selected target.
  process.env.DATA_SHARD_ENV = dataShardEnvironment
  const address3dPath = `${preparedUpload.filePath}.address3d.jsonl`
  const prepared3d =
    previewPlan.source === 'hkgov-dpo'
      ? await validateAddress3dPreparation(address3dPath, previewPlan.sourceVersion)
      : undefined
  if (prepared3d) {
    if (!prepared3d.source2dCount) {
      throw new Error(
        'ALS preparation has no original 2D publisher ledger; prepare the release again.',
      )
    }
    const seal = JSON.parse(
      await readFile(`${preparedUpload.filePath}.address3d.meta.json`, 'utf8'),
    )
    if (
      seal.sourceVersion !== previewPlan.sourceVersion ||
      seal.sidecarSha256 !== prepared3d.digest ||
      seal.parquetSha256 !== (await fileSha256(preparedUpload.filePath))
    ) {
      throw new Error(
        'ALS 2D and 3D preparation do not belong together; prepare the release again',
      )
    }
  }
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const datasetId = requireString(uploadResult.datasetId, 'datasetId')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = resolveShardYear(previewPlan.cohortKey, previewPlan.sourceVersion)
  const releaseRoot = resolve(
    LOCAL_RELEASE_ROOT,
    resolveTargetName(target),
    releaseCode,
  )

  await mkdir(releaseRoot, { recursive: true })
  const deliveryDirectory = resolve(releaseRoot, 'sql-delivery-address')
  const retainedDelivery = await readDeliveryPlan(deliveryDirectory)
  const preparedSha256 = await fileSha256(preparedUpload.filePath)
  const preparationAudit = await readAddressPreparationAudit(
    preparedUpload.filePath,
    preparedSha256,
    previewPlan.sourceVersion,
  )
  if (
    retainedDelivery &&
    (retainedDelivery.context.inputs.preparedSha256 !== preparedSha256 ||
      retainedDelivery.context.inputs.address3dSha256 !==
        (prepared3d?.digest ?? null) ||
      retainedDelivery.context.releaseId !== releaseId)
  ) {
    throw new Error(
      'Prepared ALS data does not match the retained SQL delivery. Resume its exact plan with sql:resume.',
    )
  }

  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  const progress = new OperationProgress()
  const timed = <T>(action: string, subject: string, operation: () => Promise<T>) =>
    runLocalProgressPhase(progress, { action, subject }, operation)
  const resolvedTargetName = resolveTargetName(target)
  const cacheTableProfile = 'address'
  const remoteCacheScopeKey = undefined

  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        resumeSqlDeliveryReleaseId: releaseId,
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
        cacheTableProfile,
        includeAllHistoryShardYears: true,
        includePreviousShardYears: shouldIncludePreviousShardYears(
          previewPlan.cohortKey,
        ),
        refreshRemoteTables: false,
        remoteCacheScopeKey,
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }

  if (target.remote && progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal('Clone cache'),
          colorRed(resolvedTargetName),
        ),
        [formatDurationMs(Date.now() - dbCacheStartedAt)],
      ),
    )
  }
  const mirrorPreparationMs = Date.now() - dbCacheStartedAt
  await syncStagedReleaseIntoLocalMetaCache(
    dbContext.metaDb,
    {
      datasetCode,
      rawObjectKey,
      releaseCode,
      releaseId,
    },
    previewPlan,
    { retainedDeliveryCacheDir: dbContext.state.dbCacheDir },
  )
  const remoteHarbourClient = createHarbourControlClient(target) as HarbourClient
  const harbourClient = target.remote
    ? remoteHarbourClient
    : createLocalControlClient(
        dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        {
          maxRetries: LOCAL_SQL_WRITE_RETRY_LIMIT,
          onRetry(event) {
            progress.message(
              formatRetryLabel(
                `database lock ${event.target}`,
                event.attempt,
                event.maxRetries,
                event.delayMs,
              ),
            )
          },
          publishClient: remoteHarbourClient,
        },
      )
  const initialMessage: DatasetProcessingMessage = {
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
  const importOptions: AddressSqlImportStageOptions = {
    accountId: resolveCloudflareAccountId(target),
    apiToken: resolveCloudflareD1ApiToken(),
    currentBinding: dbContext.currentBinding,
    dataShardEnvironment: target.remote
      ? target.environment === 'production'
        ? 'production'
        : 'preview'
      : 'preview',
    historyBinding: dbContext.historyBinding,
    isLocal: !target.remote,
    localWriteMaxRetries: LOCAL_SQL_WRITE_RETRY_LIMIT,
    metaBinding: dbContext.metaBinding,
    metaDatabaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    onRetry(event) {
      progress.message(
        formatRetryLabel(
          `database lock ${event.target}`,
          event.attempt,
          event.maxRetries,
          event.delayMs,
        ),
      )
    },
    remoteImportBatchBytes: REMOTE_IMPORT_BATCH_BYTES,
    sourceBinding: dbContext.sourceBinding,
  }

  assertRemoteAddressImportPrerequisites(target, dbContext, importOptions)
  const processingRunStartedAt = retainedDelivery
    ? String(
        (retainedDelivery.context.inputs.message as AddressPipelineMessage)
          .processingRunStartedAt,
      )
    : new Date().toISOString()
  let shouldRefreshRemoteMetaCache = false
  let postPublishCacheError: Error | null = null
  let publishResult: PublishDatasetResult | void | null = null

  await writeLocalPipelineState(releaseRoot, {
    addressChunkSize: ADDRESS_CHUNK_SIZE,
    addressSqlRunId: buildAddressSqlImportRunId(initialMessage),
    generationConcurrency: GENERATION_CONCURRENCY,
    preparedAt: processingRunStartedAt,
    rawObjectKey,
    releaseCode,
    releaseId,
    shardYear,
    sqlStatementByteTarget: SQL_STATEMENT_BYTE_TARGET,
    target: resolvedTargetName,
    workingDbCacheDir: dbContext.state.dbCacheDir,
  })

  try {
    await harbourClient.stageRunning(
      releaseId,
      'processDataset',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractAddresses',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractAddressesI18n',
      undefined,
      releaseCode,
    )

    const versionInsertContext = await prepareAddressVersionInsertContext(
      dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
      initialMessage,
      dataShardEnvironment,
    )
    const activeSnapshot = await resolveLatestPublishedSnapshotForLineage(
      dbContext.metaDb as unknown as HarbourReadableDb,
      versionInsertContext.snapshotLineageId,
    )
    const prior3d =
      prepared3d && versionInsertContext.parentSnapshotId
        ? [
            ...(
              await resolveSnapshotVersionState(
                await resolveSnapshotReplayPlan(
                  dbContext.metaDb as unknown as HarbourReadableDb,
                  versionInsertContext.parentSnapshotId,
                ),
                new Map(
                  dbContext.historyTargets.map(target => [
                    target.bindingName,
                    {
                      bindingName: target.bindingName,
                      db: target.db as HarbourReadableDb,
                    },
                  ]),
                ),
                ['address3d', 'address3dI18n'],
              )
            ).values(),
          ]
        : []
    const import3d = async (writeOptions: AddressSqlImportStageOptions) => {
      if (!prepared3d) return
      const generate3d = async (executionOptions: AddressSqlImportStageOptions) => {
        await importAddress3dCollections({
          path: address3dPath,
          sourceVersion: previewPlan.sourceVersion,
          snapshotId: versionInsertContext.snapshotId,
          releaseId,
          expectedDigest: prepared3d.digest,
          timestamp: processingRunStartedAt,
          priorMembership: prior3d,
          execute: await createAddress3dExecutor(
            dbContext.metaDb,
            initialMessage,
            executionOptions,
          ),
        })
      }
      const directory = resolve(releaseRoot, 'sql-delivery-address3d')
      const retained3dDelivery = await readDeliveryPlan(directory)
      if (!target.remote) {
        const files = dbContext.state.files
        if (!files) throw new Error('Missing native Address database paths.')
        await prepareNativeSqlDelivery({
          directory,
          files,
          ownershipDirectory: dbContext.state.dbCacheDir,
          releaseId,
          phase: 'address3d-data',
          inputs: retained3dDelivery?.context.inputs ?? {
            independentBoundTargets: true,
            // Address2D prerequisites are already delivered. These three D1
            // projections share no cross-database write dependencies.
            parallelTargets: true,
            digest: prepared3d.digest,
            snapshotId: versionInsertContext.snapshotId,
            sourceVersion: previewPlan.sourceVersion,
          },
          generate: append =>
            generate3d({
              ...writeOptions,
              captureQueries: async (destination, statements) => {
                const binding = destination.binding?.bindingName
                if (!binding || !files[binding])
                  throw new Error('Unknown native Address3D binding.')
                await append(
                  { bindingName: binding, databaseId: binding },
                  new TextEncoder().encode(JSON.stringify(statements)),
                  'bound',
                )
              },
            }),
        })
        await runNativeSqlDelivery(directory, {
          files,
          onProgress: (completed, total) =>
            progress.message(`Local Address3D SQL: ${completed}/${total} batches`),
        })
        return
      }
      if (!writeOptions.isLocal) {
        await prepareReleaseSqlDelivery({
          directory,
          context: dbContext,
          releaseId,
          phase: 'address3d-data',
          inputs: retained3dDelivery?.context.inputs ?? {
            independentBoundTargets: true,
            digest: prepared3d.digest,
            snapshotId: versionInsertContext.snapshotId,
            sourceVersion: previewPlan.sourceVersion,
          },
          generate: capture =>
            generate3d({
              ...writeOptions,
              captureQueries: (target, statements) =>
                capture(
                  target,
                  new TextEncoder().encode(JSON.stringify(statements)),
                  'bound',
                ),
            }),
        })
      }
      await executeReleaseSqlDelivery({
        directory,
        context: dbContext,
        ...importOptions,
        mode: writeOptions.isLocal ? 'local' : 'remote',
        onProgress: (completed, total) =>
          progress.message(
            `Address3D ${writeOptions.isLocal ? 'replay' : 'delivery'}: ${completed}/${total} batches`,
          ),
      })
    }
    importOptions.beforePublish = () => import3d(importOptions)
    const isHistoricalBranch =
      versionInsertContext.parentSnapshotId !== null &&
      activeSnapshot?.id !== versionInsertContext.parentSnapshotId
    const historicalParentVersions = isHistoricalBranch
      ? await getReplayedAddressVersionMap(
          dbContext.metaDb as unknown as HarbourReadableDb,
          versionInsertContext.parentSnapshotId as string,
          new Map(
            dbContext.historyTargets.map(target => [
              target.bindingName,
              {
                bindingName: target.bindingName,
                db: target.db as HarbourReadableDb,
              },
            ]),
          ),
          {
            buildAddressBaseHashInput,
            buildMatchKey,
            normaliseAddressI18nSnapshotRow,
          },
        )
      : undefined
    const addressCurrentLookupCache = historicalParentVersions
      ? {
          byId: new Map(
            [...historicalParentVersions].map(([id, version]) => [
              id,
              { churnHash: version.churnHash, id: version.id },
            ]),
          ),
          byMatchKey: buildHistoricalAddressMatchKeyLookup(historicalParentVersions),
          snapshotId: versionInsertContext.parentSnapshotId as string,
        }
      : await loadAddressCurrentLookupCache(
          resolvedTargetName,
          previewPlan.regionCode,
          versionInsertContext.parentSnapshotId,
        )
    const finalMessageWithMeta = retainedDelivery
      ? (retainedDelivery.context.inputs.message as AddressPipelineMessage)
      : await (async () => {
          const chunkMessages: AddressPipelineMessage[] = buildChunkRanges(
            previewPlan.rowCount,
            ADDRESS_CHUNK_SIZE,
          ).map(
            range =>
              ({
                addressCurrentLookupCache: addressCurrentLookupCache ?? undefined,
                addressHistoricalParentSnapshotId: historicalParentVersions
                  ? (versionInsertContext.parentSnapshotId ?? undefined)
                  : undefined,
                addressHistoricalParentVersions: historicalParentVersions,
                ...initialMessage,
                addressStage: 'normalise',
                chunkSize: ADDRESS_CHUNK_SIZE,
                processingRunStartedAt,
                rowStart: range.rowStart,
                rowEnd: range.rowEnd,
                totalRows: previewPlan.rowCount,
              }) satisfies AddressPipelineMessage,
          )

          const normalisedMessages = await runLocalGenerationPhase(
            progress,
            harbourClient,
            {
              completionLabel: formatCompletedPhaseLabel(
                colorTeal('Normalise'),
                colorTeal('records'),
                previewPlan.rowCount,
              ),
              label: formatRunningPhaseLabel(
                colorTeal('Normalise'),
                colorTeal('records'),
                0,
                previewPlan.rowCount,
              ),
              labelForProgress(current: number) {
                return formatRunningPhaseLabel(
                  colorTeal('Normalise'),
                  colorTeal('records'),
                  current,
                  previewPlan.rowCount,
                )
              },
              phase: 'normaliseAddressSql',
              releaseCode,
              releaseId,
              totalUnits: previewPlan.rowCount,
              unitsForMessage(message) {
                return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
              },
            },
            chunkMessages,
            GENERATION_CONCURRENCY,
            message =>
              normaliseAddressSqlChunkStage(
                dbContext.metaDb,
                dbContext.currentDb,
                bucket,
                message,
              ),
          )
          const sourceMessages = await runLocalGenerationPhase(
            progress,
            harbourClient,
            {
              completionLabel: formatCompletedPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('source'),
                previewPlan.rowCount,
              ),
              label: formatRunningPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('source'),
                0,
                previewPlan.rowCount,
              ),
              labelForProgress(current: number) {
                return formatRunningPhaseLabel(
                  colorTeal('Generate SQL'),
                  colorRed('source'),
                  current,
                  previewPlan.rowCount,
                )
              },
              phase: 'generateAddressSqlSource',
              releaseCode,
              releaseId,
              totalUnits: previewPlan.rowCount,
              unitsForMessage(message) {
                return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
              },
            },
            normalisedMessages,
            GENERATION_CONCURRENCY,
            message =>
              writeAddressSourceSqlChunkStage(dbContext.sourceDb, bucket, message),
          )
          const historyMessages = await runLocalGenerationPhase(
            progress,
            harbourClient,
            {
              completionLabel: formatCompletedPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('history'),
                previewPlan.rowCount,
              ),
              label: formatRunningPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('history'),
                0,
                previewPlan.rowCount,
              ),
              labelForProgress(current: number) {
                return formatRunningPhaseLabel(
                  colorTeal('Generate SQL'),
                  colorRed('history'),
                  current,
                  previewPlan.rowCount,
                )
              },
              phase: 'generateAddressSqlHistory',
              releaseCode,
              releaseId,
              totalUnits: previewPlan.rowCount,
              unitsForMessage(message) {
                return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
              },
            },
            sourceMessages,
            GENERATION_CONCURRENCY,
            message =>
              writeAddressHistorySqlChunkStage(
                dbContext.metaDb,
                dbContext.historyDb,
                bucket,
                message,
                {
                  previousHistoryDbs: dbContext.historyTargets
                    .filter(targetContext => targetContext.db !== dbContext.historyDb)
                    .map(targetContext => targetContext.db as HistoryDatabase),
                },
              ),
          )
          const currentMessages = await runLocalGenerationPhase(
            progress,
            harbourClient,
            {
              completionLabel: formatCompletedPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('current'),
                previewPlan.rowCount,
              ),
              label: formatRunningPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('current'),
                0,
                previewPlan.rowCount,
              ),
              labelForProgress(current: number) {
                return formatRunningPhaseLabel(
                  colorTeal('Generate SQL'),
                  colorRed('current'),
                  current,
                  previewPlan.rowCount,
                )
              },
              phase: 'generateAddressSqlCurrent',
              releaseCode,
              releaseId,
              totalUnits: previewPlan.rowCount,
              unitsForMessage(message) {
                return Math.max(0, (message.rowEnd ?? 0) - (message.rowStart ?? 0))
              },
            },
            historyMessages,
            GENERATION_CONCURRENCY,
            message =>
              writeAddressCurrentSqlChunkStage(
                dbContext.metaDb,
                dbContext.currentDb,
                bucket,
                message,
              ),
          )

          const finalMessage = buildFinalImportMessage(
            initialMessage,
            processingRunStartedAt,
            currentMessages,
            previewPlan.rowCount,
          )
          const addressStats = addAddressPipelineStats(
            EMPTY_ADDRESS_PIPELINE_STATS,
            finalMessage.addressStats ?? {},
          )
          await replaceDatasetStats(
            dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
            releaseId,
            buildAddressReleaseStatsRows({
              ...addressStats,
              address3dCount: prepared3d?.collectionCount,
              address3dI18nCount: prepared3d?.localisedCollectionCount,
              quality: options.quality,
            }),
          )
          return writeAddressReleaseMetaSqlFile(dbContext.metaDb, bucket, finalMessage)
        })()
    const retainAudit = () =>
      timed('Retain', 'Address processing provenance', () =>
        deliverProducerAudit({
          target,
          directory: resolve(releaseRoot, 'provenance-address'),
          identity: JSON.stringify({ preparedSha256, preparationAudit }),
          retain: store =>
            retainAddressProvenance(store, {
              releaseId,
              datasetCode,
              preparation: preparationAudit,
              address3d: prepared3d,
              outputCount:
                finalMessageWithMeta.addressStats?.processedRows ??
                previewPlan.rowCount,
            }),
        }),
      )
    const importProgressClient = createLocalImportProgressClient(
      harbourClient,
      progress,
      buildAddressImportProgressConfig(
        finalMessageWithMeta.addressSqlArtefactKeys ?? [],
      ),
    )

    const noopClient = {
      async publishDataset() {},
      async stageRunning() {},
      async stageCompleted() {},
      async stageFailed() {},
    }
    if (target.remote) {
      await timed('Prepare SQL delivery', 'address', () =>
        prepareReleaseSqlDelivery({
          directory: deliveryDirectory,
          context: dbContext,
          releaseId,
          phase: 'address-data',
          inputs: retainedDelivery?.context.inputs ?? {
            preparedSha256,
            address3dSha256: prepared3d?.digest ?? null,
            message: finalMessageWithMeta,
          },
          timings: {
            mirrorPreparationMs,
            sqlGenerationMs: Date.now() - Date.parse(processingRunStartedAt),
          },
          generate: captureSql =>
            importAddressSqlArtefacts(
              noopClient,
              dbContext.metaDb,
              bucket,
              finalMessageWithMeta,
              {
                ...importOptions,
                captureSql: async (destination, bytes) => {
                  for (const part of boundedHistoryApply(bytes, previewPlan.rowCount))
                    await captureSql(destination, part)
                },
              },
            ),
        }),
      )
      await completeAddressSqlGenerationPhases(harbourClient, finalMessageWithMeta)
      await timed('Deliver SQL', 'address', () =>
        runReportedSqlImportPhase(
          harbourClient,
          releaseId,
          releaseCode,
          'deliverAddressSql',
          report =>
            executeReleaseSqlDelivery({
              directory: deliveryDirectory,
              context: dbContext,
              ...importOptions,
              mode: 'remote',
              onProgress: (completed, total) => {
                progress.message(`Deliver SQL: ${completed}/${total} batches`)
                return report({ processedFiles: completed, totalFiles: total })
              },
            }),
        ),
      )
      if (prepared3d)
        await timed('Prepare and import', 'Address3D', () => import3d(importOptions))
      await retainAudit()
      publishResult = await publishImportedAddressSqlRelease(
        importProgressClient,
        finalMessageWithMeta,
        { deferApiReleaseSet: options.deferApiReleaseSet },
      )
    } else {
      const files = dbContext.state.files
      if (!files) throw new Error('Missing native Address database paths.')
      await timed('Prepare SQL delivery', 'address', () =>
        prepareNativeSqlDelivery({
          directory: deliveryDirectory,
          files,
          ownershipDirectory: dbContext.state.dbCacheDir,
          releaseId,
          phase: 'address-data',
          inputs: retainedDelivery?.context.inputs ?? {
            preparedSha256,
            address3dSha256: prepared3d?.digest ?? null,
            message: finalMessageWithMeta,
          },
          generate: append =>
            importAddressSqlArtefacts(
              noopClient,
              dbContext.metaDb,
              bucket,
              finalMessageWithMeta,
              {
                ...importOptions,
                captureSql: async (destination, bytes) => {
                  const binding = destination.binding?.bindingName
                  if (!binding || !files[binding])
                    throw new Error('Unknown native Address binding.')
                  await append({ bindingName: binding, databaseId: binding }, bytes)
                },
              },
            ),
        }),
      )
      await completeAddressSqlGenerationPhases(harbourClient, finalMessageWithMeta)
      await timed('Import SQL', 'address', () =>
        runNativeSqlDelivery(deliveryDirectory, {
          files,
          onProgress: (completed, total) =>
            progress.message(`Local Address SQL: ${completed}/${total} batches`),
        }),
      )
      if (prepared3d)
        await timed('Prepare and import', 'Address3D', () => import3d(importOptions))
      await retainAudit()
      publishResult = await publishImportedAddressSqlRelease(
        importProgressClient,
        finalMessageWithMeta,
        { deferApiReleaseSet: options.deferApiReleaseSet },
      )
    }
    if (target.remote) {
      try {
        await timed('Replay SQL', 'address', () =>
          runReportedSqlImportPhase(
            harbourClient,
            releaseId,
            releaseCode,
            'replayAddressSql',
            () =>
              executeReleaseSqlDelivery({
                directory: deliveryDirectory,
                context: dbContext,
                ...importOptions,
                mode: 'local',
                onProgress: (completed, total) =>
                  progress.message(`Replay SQL: ${completed}/${total} batches`),
              }),
          ),
        )
        shouldRefreshRemoteMetaCache = true
        if (prepared3d)
          await timed('Replay SQL', 'Address3D', () =>
            import3d({ ...importOptions, isLocal: true }),
          )
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (!options.deferApiReleaseSet) {
      await calculateAndStoreApiReleaseSetStats({
        currentDb: dbContext.currentDb as unknown as HarbourReadableDb,
        historyTargets: dbContext.historyTargets,
        family: 'address',
        harbourClient,
        importOptions,
        metaDb: dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        progress,
        releaseCode,
        releaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
        addressQuality: options.quality,
      })
    }
    await timed('Write lookup cache', 'address', () =>
      writeAddressCurrentLookupCache(
        resolvedTargetName,
        previewPlan.regionCode,
        releaseCode,
        dbContext.historyDb,
        versionInsertContext.snapshotId,
      ),
    )
    if (!target.remote)
      await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
  } catch (error) {
    await retainProcessingFailure({
      error,
      target,
      releaseId,
      datasetCode,
      store: new LocalPipelineBucket(resolve(releaseRoot, 'provenance-address')),
    })
    progress.fail()
    await harbourClient.stageFailed(
      releaseId,
      'processDataset',
      error instanceof Error ? error.message : String(error),
      undefined,
      releaseCode,
    )
    throw error
  } finally {
    dbContext.cleanup()
    if (shouldRefreshRemoteMetaCache && target.remote) {
      try {
        await refreshRemoteMetaCacheAfterReplay(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
        )
        if (!postPublishCacheError)
          await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
  }

  if (postPublishCacheError) {
    throw postPublishCacheError
  }

  return { publishResult }
}
