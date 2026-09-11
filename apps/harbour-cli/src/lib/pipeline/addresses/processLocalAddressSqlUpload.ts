import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HistoryDatabase } from '@repo/db'
import { captureResolvedAddressDelivery } from './resolvedAddressDelivery.ts'
import {
  prepareAddressMembershipBaseline,
  addressMembershipMirrorFile,
} from './addressMembershipBaseline.ts'
import { sha256, writeDeliveryFile } from '../local/sqlDeliveryFiles.ts'
import {
  getReplayedAddressVersionMap,
  prepareAddressVersionInsertContext,
} from '@repo/core/pipeline/db/address'
import {
  resolveLatestPublishedSnapshotForLineage,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { fileSha256, validateAddress3dPreparation } from './address3dImport'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  readAddressPreparationAudit,
  retainAddressProvenance,
} from './addressProvenance'
import { deliverProducerAudit } from '../../api/producerAuditDelivery'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { buildAddressSqlImportRunId } from '@repo/core/pipeline/services/addresses/sqlImport'
import {
  completeAddressSqlGenerationPhases,
  publishImportedAddressSqlRelease,
  type AddressSqlImportStageOptions,
} from '@repo/core/pipeline/services/addresses/sqlImportStages'
import {
  normaliseAddressSqlChunkStage,
  writeAddressReleaseMetaSqlFile,
  writeAddressCurrentSqlChunkStage,
  writeAddressHistorySqlChunkStage,
  writeAddressSourceSqlChunkStage,
} from '@repo/core/pipeline/services/addresses/sqlStages'
import {
  addAddressPipelineStats,
  EMPTY_ADDRESS_PIPELINE_STATS,
  type AddressPipelineMessage,
} from '@repo/core/pipeline/services/addresses/types'
import {
  buildAddressReleaseStatsRows,
  type AddressDivisionQualityCounts,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import {
  buildAddressBaseHashInput,
  buildMatchKey,
  normaliseAddressI18nSnapshotRow,
} from '@repo/core/pipeline/services/addresses/normalisation'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import type { UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import {
  createLocalImportProgressClient,
  runLocalGenerationPhase,
  runLocalProgressPhase,
  writeLocalPipelineState,
} from '../local/orchestrator.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import {
  calculateAndStoreApiReleaseSetStats,
  resolveApiReleaseSetStatsTarget,
} from '../../api/apiReleaseSetStats.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRetryLabel,
  formatRunningPhaseLabel,
} from '../local/progressFormatting.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
  readDeliveryPlan,
} from '../local/releaseSqlDelivery.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import { runReportedSqlImportPhase } from '../local/sqlImport.ts'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
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
    if (prepared3d.source2dCount === undefined) {
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
    (retainedDelivery.context.inputs.planner !== 'resolved-address-publication-v1' ||
      retainedDelivery.context.inputs.preparedSha256 !== preparedSha256 ||
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
  // Every dataset writer uses the same complete mirror; family subsets cannot
  // establish shared ownership or preserve other sources' materialisations.

  let dbContext: Awaited<ReturnType<typeof resolveCurrentWriteContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveCurrentWriteContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        resumeSqlDeliveryReleaseId: releaseId,
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
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
  const initialMessage: AddressPipelineMessage = {
    addressDivisionSnapshotId: preparationAudit.divisionSnapshotId,
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
    const parentReplayPlan = versionInsertContext.parentSnapshotId
      ? await resolveSnapshotReplayPlan(
          dbContext.metaDb as unknown as HarbourReadableDb,
          versionInsertContext.parentSnapshotId,
        )
      : []
    const priorVersions = [
      ...(
        await resolveSnapshotVersionState(
          parentReplayPlan,
          new Map(
            dbContext.historyTargets.map(target => [
              target.bindingName,
              {
                bindingName: target.bindingName,
                db: target.db as HarbourReadableDb,
              },
            ]),
          ),
          ['address2d', 'address2dI18n', 'address3d', 'address3dI18n'],
        )
      ).values(),
    ]
    const prior3d = priorVersions.filter(row =>
      ['address3d', 'address3dI18n'].includes(row.recordType),
    )
    if (
      activeSnapshot &&
      activeSnapshot.id !== versionInsertContext.parentSnapshotId &&
      activeSnapshot.id !== versionInsertContext.snapshotId
    )
      throw new Error(
        'Address deltas must extend the latest published snapshot. Prepare historical releases in a chronological local rebuild.',
      )
    const parentVersions = versionInsertContext.parentSnapshotId
      ? await getReplayedAddressVersionMap(
          dbContext.metaDb as unknown as HarbourReadableDb,
          versionInsertContext.parentSnapshotId,
          new Map(
            dbContext.historyTargets.map(target => [
              target.bindingName,
              {
                bindingName: target.bindingName,
                db: target.db as HarbourReadableDb,
              },
            ]),
          ),
          { buildAddressBaseHashInput, buildMatchKey, normaliseAddressI18nSnapshotRow },
        )
      : undefined
    const addressCurrentLookupCache = parentVersions
      ? {
          byId: new Map(
            [...parentVersions].map(([id, version]) => [
              id,
              { churnHash: version.churnHash, id: version.id },
            ]),
          ),
          byMatchKey: buildHistoricalAddressMatchKeyLookup(parentVersions),
          snapshotId: versionInsertContext.parentSnapshotId as string,
        }
      : undefined
    const reviewMembership = () =>
      prepareAddressMembershipBaseline({
        cacheDir: dbContext.state.dbCacheDir,
        currentPath: requireString(
          dbContext.state.files?.DB_CURRENT,
          'current mirror path',
        ),
        scopeId: versionInsertContext.snapshotLineageId,
        parentSnapshotId: versionInsertContext.parentSnapshotId,
        preparedFile: preparedUpload.filePath,
        sourceVersion: previewPlan.sourceVersion,
        reportFile: resolve(releaseRoot, 'address-deletions.json'),
      })
    const membership =
      prepared3d && !retainedDelivery ? await reviewMembership() : undefined
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
                ...initialMessage,
                addressCurrentScopeId: versionInsertContext.snapshotLineageId,
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
          finalMessage.addressCurrentScopeId = versionInsertContext.snapshotLineageId
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
          onProgress: message => progress.message(message),
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

    const resolvedDeliveryInputs = retainedDelivery?.context.inputs ?? {
      planner: 'resolved-address-publication-v1',
      preparedSha256,
      address3dSha256: prepared3d?.digest ?? null,
      membershipSha256: membership ? sha256(JSON.stringify(membership.current)) : null,
      predecessorMembershipSha256: membership?.previousBytes
        ? sha256(membership.previousBytes)
        : null,
      message: finalMessageWithMeta,
    }
    const generateResolved = async (
      capture: Parameters<typeof captureResolvedAddressDelivery>[0]['capture'],
    ) => {
      // Recheck the preparation and exact predecessor under the shared delivery lock.
      if (membership) {
        const checked = await reviewMembership()
        if (
          sha256(JSON.stringify(checked.current)) !==
            resolvedDeliveryInputs.membershipSha256 ||
          (checked.previousBytes ? sha256(checked.previousBytes) : null) !==
            resolvedDeliveryInputs.predecessorMembershipSha256
        )
          throw new Error(
            'Address membership changed during planning; prepare the release again.',
          )
      }
      const result = await captureResolvedAddressDelivery({
        context: dbContext,
        metaDb: dbContext.metaDb,
        bucket,
        message: finalMessageWithMeta,
        options: importOptions,
        snapshotId: versionInsertContext.snapshotId,
        scopeId: versionInsertContext.snapshotLineageId,
        expectedAddressCount:
          membership?.current.addresses.length ?? previewPlan.rowCount,
        retiredAddressIds: membership?.retiredIds ?? [],
        membership: membership?.current,
        parentReplayPlan,
        priorVersions,
        ...(prepared3d
          ? {
              address3d: {
                path: address3dPath,
                sourceVersion: previewPlan.sourceVersion,
                digest: prepared3d.digest,
                priorMembership: prior3d,
              },
            }
          : {}),
        capture,
      })
      if (!membership) return result
      const bytes = JSON.stringify(membership.current)
      await writeDeliveryFile(deliveryDirectory, 'address-membership.json', bytes)
      return {
        ...result,
        acknowledgedMirrorFiles: [
          {
            file: 'address-membership.json',
            sha256: sha256(bytes),
            mirrorFile: addressMembershipMirrorFile(
              versionInsertContext.snapshotLineageId,
              versionInsertContext.snapshotId,
            ),
          },
        ],
      }
    }
    if (target.remote) {
      await timed('Prepare SQL delivery', 'address', () =>
        prepareReleaseSqlDelivery({
          directory: deliveryDirectory,
          context: dbContext,
          releaseId,
          phase: 'address-data',
          inputs: resolvedDeliveryInputs,
          timings: {
            mirrorPreparationMs,
            sqlGenerationMs: Date.now() - Date.parse(processingRunStartedAt),
          },
          generate: generateResolved,
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
          inputs: resolvedDeliveryInputs,
          generate: append =>
            generateResolved(async (destination, bytes, kind) => {
              const binding =
                destination.bindingName ??
                Object.entries(dbContext.state.bindings).find(
                  ([, value]) => value.databaseId === destination.databaseId,
                )?.[0]
              if (!binding || !files[binding])
                throw new Error('Unknown native Address binding.')
              await append({ bindingName: binding, databaseId: binding }, bytes, kind)
            }),
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
          releaseId,
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
