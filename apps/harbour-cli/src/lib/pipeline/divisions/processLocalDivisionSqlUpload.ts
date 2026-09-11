import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import { getPreparedPublication } from '@repo/core/pipeline/services/publication/execute.ts'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildGuardedPublicationSql,
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { retainProcessingFailure } from '../../api/processingFailureAudit'
import { mkdir } from 'node:fs/promises'
import {
  buildDivisionBaseHashInput,
  normaliseDivisionI18nSnapshotRow,
} from '@repo/core/pipeline/services/divisions/division'
import { resolve } from 'node:path'
import { deliverSqlPhase } from '../local/sqlDeliveryPhase.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import { readDivisionDeliveryOutputs } from './divisionDeliveryOutputs.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { retainDivisionProvenance } from './divisionProvenance'
import { deliverProcessingResult } from '../../api/provenance'
import { getMergedCurrentSourceOvertureDivisionMap } from '@repo/core/pipeline/db/source'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { DivisionVersionSnapshot } from '@repo/core/pipeline/db/division'
import {
  getDivisionVersionMapForSnapshot,
  prepareDivisionVersionInsertContext,
} from '@repo/core/pipeline/db/division'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import type { UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import {
  createLocalImportProgressClient,
  runLocalStreamingPhase,
  writeLocalPipelineState,
} from '../local/orchestrator.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import {
  calculateAndStoreApiReleaseSetStats,
  isApiReleaseSetStatsReady,
  resolveApiReleaseSetStatsTarget,
} from '../../api/apiReleaseSetStats.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import {
  appendPhaseDetails,
  colorGrey,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatCount,
  formatDurationMs,
  formatRetryLabel,
  formatRunningPhaseLabel,
} from '../local/progressFormatting.ts'
import {
  executeSqlText,
  importSqlArtefactKeys,
  runReportedSqlImportPhase,
  type SqlImportExecutionOptions,
} from '../local/sqlImport.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  applyPublishMetadataDeltaToRemoteCache,
  resolveLocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import type { UploadPlan, UploadResult } from './processLocalDivisionSqlUploadTypes.ts'
import {
  assertRemoteDivisionImportPrerequisites,
  buildExtraHistorySqlOperations,
  buildExtraSourceSqlOperations,
  buildHistoryOwnerKey,
  buildSourceOwnerKey,
  normaliseError,
  refreshRemoteMetaCacheAfterReplay,
  requireString,
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
  resolveDivisionImportTargets,
  resolveImportEnvironment,
  resolveShardYear,
  resolveTargetName,
  runDivisionSqlImportOperations,
  writeDivisionSqlArtefacts,
} from './processLocalDivisionSqlUploadImport.ts'
import {
  DIVISION_BATCH_SIZE,
  LOCAL_RELEASE_ROOT,
  LOCAL_SQL_WRITE_RETRY_LIMIT,
  REMOTE_IMPORT_BATCH_BYTES,
  SQL_STATEMENT_BYTE_TARGET,
} from './processLocalDivisionSqlUploadConfig.ts'
import {
  buildDivisionImportProgressConfig,
  buildStreamingPhase,
  countDivisionImportFiles,
  formatLocalSetupProgressLabel,
  updateDbCacheProgress,
} from './processLocalDivisionSqlUploadProgress.ts'
import {
  assertDivisionCurrentSnapshotComplete,
  buildDivisionSqlState,
} from './processLocalDivisionSqlUploadPreparation.ts'
import {
  buildDivisionCurrentSqlFile,
  buildDivisionHistorySqlFile,
  buildDivisionSourceSqlFile,
} from './processLocalDivisionSqlUploadRows.ts'
import { buildDivisionMetaSqlFile } from './processLocalDivisionSqlUploadMetadata.ts'

export async function processLocalDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: UploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    deferSourcePublish?: boolean
    reuseExistingRelease?: boolean
    skipSnapshotCleanup?: boolean
  } = {},
) {
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
  const progress = new OperationProgress()
  const setupStepCount = 8
  const setupStartedAt = Date.now()

  if (!target.remote) {
    progress.beginPhase(formatLocalSetupProgressLabel('workspace', 0, setupStepCount), {
      current: 0,
      max: setupStepCount,
    })
  }

  await mkdir(releaseRoot, { recursive: true })
  if (!target.remote) {
    progress.update(1, {
      label: formatLocalSetupProgressLabel('raw object', 1, setupStepCount),
    })
  }

  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  if (!target.remote) {
    progress.update(2, {
      label: formatLocalSetupProgressLabel('local DB', 2, setupStepCount),
    })
  }
  const resolvedTargetName = resolveTargetName(target)
  const cacheTableProfile = 'division'
  const remoteCacheScopeKey = undefined

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
        cacheTableProfile,
        includePreviousShardYears: true,
        refreshRemoteTables: false,
        resumeSqlDeliveryReleaseId: releaseId,
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
  if (!target.remote) {
    progress.update(3, {
      label: formatLocalSetupProgressLabel('release metadata', 3, setupStepCount),
    })
  }
  await syncStagedReleaseIntoLocalMetaCache(
    dbContext.metaDb,
    {
      datasetCode,
      rawObjectKey,
      releaseCode,
      releaseId,
    },
    previewPlan,
    {
      reuseExistingRelease: options.reuseExistingRelease,
      retainedDeliveryCacheDir: dbContext.state.dbCacheDir,
    },
  )
  if (!target.remote) {
    progress.update(4, {
      label: formatLocalSetupProgressLabel('import targets', 4, setupStepCount),
    })
  }
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
    resourceType: previewPlan.resourceType,
    processingMode: 'sql',
    ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  }
  const importOptions: SqlImportExecutionOptions = {
    accountId: resolveCloudflareAccountId(target),
    apiToken: resolveCloudflareD1ApiToken(),
    isLocal: !target.remote,
    metaDatabaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    localWriteMaxRetries: LOCAL_SQL_WRITE_RETRY_LIMIT,
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
  }
  const environment = resolveImportEnvironment(target)
  const importTargets = await resolveDivisionImportTargets(
    dbContext.metaDb,
    dbContext,
    initialMessage,
    environment,
  )
  if (!target.remote) {
    progress.update(5, {
      label: formatLocalSetupProgressLabel('pipeline state', 5, setupStepCount),
    })
  }

  assertRemoteDivisionImportPrerequisites(target, importTargets, importOptions)
  const processingRunStartedAt = new Date().toISOString()
  let shouldRefreshRemoteMetaCache = false
  let postPublishCacheError: Error | null = null
  let publishResult: Awaited<ReturnType<HarbourClient['publishDataset']>> | null = null
  let published = false

  await writeLocalPipelineState(releaseRoot, {
    divisionBatchSize: DIVISION_BATCH_SIZE,
    preparedAt: processingRunStartedAt,
    rawObjectKey,
    releaseCode,
    releaseId,
    shardYear,
    sqlStatementByteTarget: SQL_STATEMENT_BYTE_TARGET,
    target: resolvedTargetName,
    workingDbCacheDir: dbContext.state.dbCacheDir,
  })
  if (!target.remote) {
    progress.update(6, {
      label: formatLocalSetupProgressLabel('running state', 6, setupStepCount),
    })
  }

  try {
    await harbourClient.stageRunning(
      releaseId,
      'processDataset',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractDivisions',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      releaseId,
      'extractDivisionsI18n',
      undefined,
      releaseCode,
    )
    if (!target.remote) {
      progress.update(7, {
        label: formatLocalSetupProgressLabel('snapshot context', 7, setupStepCount),
      })
    }

    const versionInsertContext = await prepareDivisionVersionInsertContext(
      dbContext.metaDb as never,
      initialMessage,
      environment,
    )
    if (!target.remote) {
      progress.update(8, {
        label: formatLocalSetupProgressLabel('current state', 8, setupStepCount),
      })
    }
    let sqlArtefactCount = 0
    let completionCounts: Record<string, number> = {}
    let importProgressClient: HarbourClient = harbourClient
    const publication: PublicationPreparation = {
      table: 'divisionPublicationState',
      scopeId: versionInsertContext.snapshotLineageId,
      snapshotId: versionInsertContext.snapshotId,
      publicationToken: releaseId,
      timestamp: processingRunStartedAt,
    }
    const deliveryOutputs = await deliverSqlPhase(
      {
        context: dbContext,
        releaseId,
        phase: 'division-data',
        resolvedFamily: 'division',
        publicationTables: ['divisionPublicationState'],
        nativeLocal: true,
        inputs: {
          preparedSha256: await deliveryFileSha256(preparedUpload.filePath),
          snapshotId: versionInsertContext.snapshotId,
        },
        captureOutputs: () => ({ sqlArtefactCount, ...completionCounts }),
        validateOutputs: readDivisionDeliveryOutputs,
        onProgress: (completed, total) =>
          progress.message(`Division SQL delivery: ${completed}/${total} batches`),
      },
      async () => {
        publication.previous = await getPreparedPublication(
          dbContext.currentDb as never,
          publication.table,
          publication.scopeId,
        )
        const currentRows = versionInsertContext.parentSnapshotId
          ? await getDivisionVersionMapForSnapshot(
              dbContext.currentDb as never,
              publication.scopeId,
              {
                buildDivisionBaseHashInput,
                normaliseDivisionI18nSnapshotRow,
              },
              dbContext.historyTargets.map(target =>
                buildHistoryOwnerKey(
                  previewPlan.regionCode,
                  shardYear,
                  target.bindingName,
                ),
              ),
            )
          : new Map<string, DivisionVersionSnapshot>()
        const currentSourceRows =
          previewPlan.source === 'overture'
            ? await getMergedCurrentSourceOvertureDivisionMap(
                dbContext.sourceTargets.map((target, index) => ({
                  db: target.db as never,
                  key: buildSourceOwnerKey(
                    previewPlan.regionCode,
                    shardYear,
                    target.bindingName,
                  ),
                  sortOrder: index,
                })),
              )
            : new Map()
        await assertDivisionCurrentSnapshotComplete(
          dbContext.currentDb,
          currentRows,
          versionInsertContext.parentSnapshotId,
          publication.scopeId,
        )
        if (!target.remote) {
          progress.complete(
            appendPhaseDetails(
              formatCompletedPhaseLabel(
                colorTeal('Prepare'),
                colorRed('local'),
                setupStepCount,
              ),
              [formatDurationMs(Date.now() - setupStartedAt)],
            ),
          )
        }

        const divisionState = await runLocalStreamingPhase(
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
            phase: 'normaliseDivisionSql',
            releaseCode,
            releaseId,
            totalUnits: previewPlan.rowCount,
          },
          async reportProgress =>
            buildDivisionSqlState(
              bucket,
              initialMessage,
              dbContext.metaDb,
              currentRows,
              currentSourceRows,
              versionInsertContext.snapshotId,
              !target.remote,
              async current => {
                await reportProgress(current)
                await harbourClient.stageRunning(
                  releaseId,
                  'extractDivisions',
                  {
                    processedRows: current,
                  },
                  releaseCode,
                )
              },
              dbContext.sourceTargets.map(target => target.db as never),
            ),
        )
        await harbourClient.stageCompleted(
          releaseId,
          'normaliseDivisionSql',
          {
            localisedRows: divisionState.localisedRows,
            processedRows: divisionState.processedRows,
          },
          releaseCode,
        )

        completionCounts = {
          deletedRows: divisionState.deletedRows,
          insertedVersions: divisionState.insertedVersions,
          processedRows: divisionState.processedRows,
          unchangedRows: divisionState.unchangedRows,
          localisedRows: divisionState.localisedRows,
        }
        const sourceFile = await runLocalStreamingPhase(
          progress,
          harbourClient,
          buildStreamingPhase(
            releaseId,
            releaseCode,
            'generateDivisionSqlSource',
            previewPlan.rowCount,
            colorRed('source'),
          ),
          reportProgress =>
            buildDivisionSourceSqlFile(initialMessage, divisionState, reportProgress),
        )
        await harbourClient.stageCompleted(
          releaseId,
          'generateDivisionSqlSource',
          {
            processedRows: divisionState.processedRows,
          },
          releaseCode,
        )

        const historyFile = await runLocalStreamingPhase(
          progress,
          harbourClient,
          buildStreamingPhase(
            releaseId,
            releaseCode,
            'generateDivisionSqlHistory',
            previewPlan.rowCount,
            colorRed('history'),
          ),
          reportProgress =>
            buildDivisionHistorySqlFile(initialMessage, divisionState, reportProgress),
        )
        await harbourClient.stageCompleted(
          releaseId,
          'generateDivisionSqlHistory',
          {
            processedRows: divisionState.processedRows,
          },
          releaseCode,
        )

        const currentInitFile = null
        const currentFile = await runLocalStreamingPhase(
          progress,
          harbourClient,
          buildStreamingPhase(
            releaseId,
            releaseCode,
            'generateDivisionSqlCurrent',
            previewPlan.rowCount,
            colorRed('current'),
          ),
          reportProgress =>
            buildDivisionCurrentSqlFile(
              initialMessage,
              divisionState,
              reportProgress,
              publication.scopeId,
            ),
        )
        await harbourClient.stageCompleted(
          releaseId,
          'generateDivisionSqlCurrent',
          {
            processedRows: divisionState.processedRows,
          },
          releaseCode,
        )

        for (const file of [currentInitFile, currentFile]) {
          if (file)
            file.sql = buildGuardedPublicationSql(
              publication,
              splitSqlStatements(file.sql),
            )
        }

        const provenanceRetainStartedAt = Date.now()
        progress.beginPhase(
          formatRunningPhaseLabel(
            colorTeal('Retain'),
            colorRed('processing provenance'),
          ),
          {},
        )
        const audit = await retainDivisionProvenance(bucket, {
          releaseId,
          datasetCode,
          actions: divisionState.processingActions,
          branchCounts: divisionState.branchCounts,
          curationDocuments: divisionState.curationDocuments,
          guards: divisionState.auditGuards,
          inputCount: previewPlan.rowCount,
          outputCount: divisionState.processedRows,
        })
        progress.complete(
          appendPhaseDetails(
            formatCompletedPhaseLabel(
              colorTeal('Retain'),
              colorRed('processing provenance'),
            ),
            [formatDurationMs(Date.now() - provenanceRetainStartedAt)],
          ),
        )
        const provenanceDeliverStartedAt = Date.now()
        progress.beginPhase(
          formatRunningPhaseLabel(
            colorTeal('Deliver'),
            colorRed('processing provenance'),
          ),
          {},
        )
        let deliveredObjects = 0
        await deliverProcessingResult(
          target,
          bucket,
          audit.ref,
          (_message, retainedObjects) => {
            deliveredObjects = retainedObjects
            progress.update(retainedObjects, {
              label: `${formatRunningPhaseLabel(
                colorTeal('Deliver'),
                colorRed('processing provenance'),
              )} ${colorGrey(`(${formatCount(retainedObjects)} objects)`)}`,
            })
          },
        )
        progress.complete(
          appendPhaseDetails(
            formatCompletedPhaseLabel(
              colorTeal('Deliver'),
              colorRed('processing provenance'),
              deliveredObjects,
            ),
            [formatDurationMs(Date.now() - provenanceDeliverStartedAt)],
          ),
        )

        const metaFile = await runLocalStreamingPhase(
          progress,
          harbourClient,
          {
            completionLabel: formatCompletedPhaseLabel(
              colorTeal('Generate SQL'),
              colorRed('stats'),
              divisionState.statsRows.length,
            ),
            label: formatRunningPhaseLabel(
              colorTeal('Generate SQL'),
              colorRed('stats'),
              0,
              Math.max(divisionState.statsRows.length, 1),
            ),
            labelForProgress(current: number) {
              return formatRunningPhaseLabel(
                colorTeal('Generate SQL'),
                colorRed('stats'),
                current,
                Math.max(divisionState.statsRows.length, 1),
              )
            },
            phase: 'generateDivisionSqlStats',
            releaseCode,
            releaseId,
            totalUnits: Math.max(divisionState.statsRows.length, 1),
          },
          reportProgress =>
            buildDivisionMetaSqlFile(
              dbContext.metaDb,
              initialMessage,
              divisionState,
              reportProgress,
            ),
        )
        await harbourClient.stageCompleted(
          releaseId,
          'generateDivisionSqlStats',
          {
            processedRows: divisionState.statsRows.length,
            statsRows: divisionState.statsRows.length,
          },
          releaseCode,
        )

        const manifest = await writeDivisionSqlArtefacts(bucket, initialMessage, {
          current: currentFile,
          currentInit: currentInitFile,
          history: historyFile,
          meta: metaFile,
          source: sourceFile,
        })

        await writeLocalPipelineState(releaseRoot, {
          artefacts: manifest,
          divisionBatchSize: DIVISION_BATCH_SIZE,
          preparedAt: processingRunStartedAt,
          rawObjectKey,
          releaseCode,
          releaseId,
          shardYear,
          snapshotId: divisionState.snapshotId,
          sqlStatementByteTarget: SQL_STATEMENT_BYTE_TARGET,
          target: resolvedTargetName,
          workingDbCacheDir: dbContext.state.dbCacheDir,
        })

        const extraSourceSqlOperations = buildExtraSourceSqlOperations(
          initialMessage,
          divisionState,
          importTargets,
        )
        const extraHistorySqlOperations = buildExtraHistorySqlOperations(
          divisionState,
          importTargets,
        )
        importProgressClient = createLocalImportProgressClient(
          harbourClient,
          progress,
          buildDivisionImportProgressConfig(
            manifest,
            extraSourceSqlOperations.length + extraHistorySqlOperations.length,
          ),
        )

        sqlArtefactCount =
          countDivisionImportFiles(manifest) +
          extraSourceSqlOperations.length +
          extraHistorySqlOperations.length
        return runDivisionSqlImportOperations(
          [
            async () => {
              await runReportedSqlImportPhase(
                importProgressClient,
                releaseId,
                releaseCode,
                'importDivisionSqlSource',
                progressReporter =>
                  importSqlArtefactKeys(
                    bucket,
                    importTargets.source,
                    [manifest.sourceKey],
                    importOptions,
                    progressReporter,
                  ),
              )
              for (const operation of extraSourceSqlOperations) {
                await executeSqlText(operation.target, operation.sql, importOptions)
              }
            },
            async () => {
              await runReportedSqlImportPhase(
                importProgressClient,
                releaseId,
                releaseCode,
                'importDivisionSqlHistory',
                progressReporter =>
                  importSqlArtefactKeys(
                    bucket,
                    importTargets.history,
                    [manifest.historyKey],
                    importOptions,
                    progressReporter,
                  ),
              )
              for (const operation of extraHistorySqlOperations) {
                await executeSqlText(operation.target, operation.sql, importOptions)
              }
            },
            async () => {
              await executeSqlText(
                importTargets.current,
                buildBeginPublicationSql(publication),
                importOptions,
              )
              const currentInitKey = manifest.currentInitKey

              if (currentInitKey) {
                await runReportedSqlImportPhase(
                  importProgressClient,
                  releaseId,
                  releaseCode,
                  'importDivisionSqlCurrentInit',
                  progressReporter =>
                    importSqlArtefactKeys(
                      bucket,
                      importTargets.current,
                      [currentInitKey],
                      importOptions,
                      progressReporter,
                    ),
                )
              }

              await runReportedSqlImportPhase(
                importProgressClient,
                releaseId,
                releaseCode,
                'importDivisionSqlCurrent',
                progressReporter =>
                  importSqlArtefactKeys(
                    bucket,
                    importTargets.current,
                    [manifest.currentKey],
                    importOptions,
                    progressReporter,
                  ),
              )
              await executeSqlText(
                importTargets.current,
                buildCompletePublicationSql({
                  ...publication,
                  validationSql: [
                    buildPublicationRowCountSql(
                      'divisions',
                      publication.scopeId,
                      divisionState.processedRows,
                    ),
                    buildPublicationRowCountSql(
                      'divisionsI18n',
                      publication.scopeId,
                      divisionState.localisedRows,
                    ),
                  ].join(' AND '),
                }),
                importOptions,
              )
            },
            () =>
              runReportedSqlImportPhase(
                importProgressClient,
                releaseId,
                releaseCode,
                'importDivisionSqlStats',
                progressReporter =>
                  importSqlArtefactKeys(
                    bucket,
                    importTargets.meta,
                    [manifest.metaKey],
                    importOptions,
                    progressReporter,
                  ),
              ),
          ],
          target.remote,
        )
      },
    )

    const retained = readDivisionDeliveryOutputs(deliveryOutputs)
    sqlArtefactCount = retained.sqlArtefactCount

    await harbourClient.stageCompleted(
      releaseId,
      'extractDivisions',
      {
        deletedRows: retained.deletedRows,
        insertedVersions: retained.insertedVersions,
        processedRows: retained.processedRows,
        unchangedRows: retained.unchangedRows,
      },
      releaseCode,
    )
    await harbourClient.stageCompleted(
      releaseId,
      'extractDivisionsI18n',
      {
        localisedRows: retained.localisedRows,
      },
      releaseCode,
    )

    await runReportedSqlImportPhase(
      importProgressClient,
      releaseId,
      releaseCode,
      'publishDataset',
      async () => {
        publishResult = await importProgressClient.publishDataset(
          releaseId,
          releaseCode,
          {
            deferApiReleaseSet: options.deferApiReleaseSet,
            deferSourcePublish: options.deferSourcePublish,
            skipSnapshotCleanup: options.skipSnapshotCleanup,
          },
        )
        published = true

        return {
          stepCount: 1,
        }
      },
    )
    if (target.remote) {
      try {
        shouldRefreshRemoteMetaCache = true
        if (
          (options.deferApiReleaseSet || options.deferSourcePublish) &&
          publishResult
        ) {
          await applyPublishMetadataDeltaToRemoteCache(
            target.environment === 'production' ? 'production' : 'preview',
            dbContext.state.dbCacheDir,
            publishResult,
          )
          shouldRefreshRemoteMetaCache = false
        }
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (!options.deferApiReleaseSet && isApiReleaseSetStatsReady(publishResult)) {
      await calculateAndStoreApiReleaseSetStats({
        historyTargets: dbContext.historyTargets,
        currentDb: dbContext.currentDb as unknown as HarbourReadableDb,
        family: 'division',
        harbourClient,
        importOptions,
        metaDb: dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
        progress,
        releaseCode,
        releaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await harbourClient.stageCompleted(
      releaseId,
      'processDataset',
      {
        sqlArtefactCount,
      },
      releaseCode,
    )
  } catch (error) {
    await retainProcessingFailure({
      error,
      store: bucket,
      target,
      releaseId,
      datasetCode,
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
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (!postPublishCacheError && published)
      await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, releaseId)
  }

  if (postPublishCacheError) {
    throw postPublishCacheError
  }

  return { publishResult }
}

export { runDivisionSqlImportOperations } from './processLocalDivisionSqlUploadImport.ts'
