import { retainedDivisionScopeId } from '@repo/core/pipeline/services/publication/scope'
import { readDivisionBaseline } from './readDivisionBaseline'
import { curatedDivisionPolicy } from '@repo/core/pipeline/services/divisions/curatedDivisionPolicy'
import {
  retainCuratedSourceReleases,
  curatedInventorySnapshots,
} from '../curatedDivisions/sourceReleases'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
import { supplementalNeighbourhoods } from '@repo/core/pipeline/services/divisions/divisionFixtures'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import { createHash } from '@repo/core/pipeline/utils'
import {
  divisionClassificationFixture,
  divisionExclusionFixture,
} from '@repo/core/pipeline/services/divisions'
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
import {
  retainDivisionProvenance,
  retainDivisionSourceAudit,
} from './divisionProvenance'
import { deliverProcessingResult } from '../../api/provenance'
import { getMergedCurrentSourceDivisionMap } from '@repo/core/pipeline/db/source'
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
import { applyPublishMetadataDeltaToRemoteCache } from '../../dbCache/localDbCache.ts'
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
import { resolveDivisionDeliveryPhase } from './divisionDeliveryPhase.ts'

export async function processLocalDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: UploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    sourceAuditGuards?: import('@repo/core/provenance').AuditGuard[]
    /** Publish source data and snapshots, but leave the API release set draft. */
    deferApiReleaseSet?: boolean
    deferSourcePublish?: boolean
    reuseExistingRelease?: boolean
    rebuildPublishedSnapshot?: boolean
    skipSnapshotCleanup?: boolean
    /** Canonical input decoded directly from the registered native archive. */
    curatedSourceReleases?: import('../curatedDivisions/archiveInput').CuratedSourceRelease[]
    nativeRows?: Record<string, unknown>[]
    sourceSelectionAudit?: ReturnType<
      typeof import('../../sources/hkgov/landsd/settlementSelection').landsdSettlementSelectionAudit
    >
    /** Curated rows added to the Overture Geographic canonical snapshot. */
    supplementalRows?: Record<string, unknown>[]
  } = {},
) {
  const resourceReleaseId = requireString(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
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

  let dbContext: Awaited<ReturnType<typeof resolveCurrentWriteContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveCurrentWriteContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },

        resumeSqlDeliveryReleaseId: resourceReleaseId,
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
      resourceReleaseId,
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
    resourceReleaseId,
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

  let failureAuditScope: import('@repo/core/provenance').AuditScope = {
    stage: 'preparation',
    ownerId: resourceReleaseId,
  }

  try {
    await harbourClient.stageRunning(
      resourceReleaseId,
      'processDataset',
      { resourceType: previewPlan.resourceType, sourceRows: previewPlan.rowCount },
      releaseCode,
    )
    await harbourClient.stageRunning(
      resourceReleaseId,
      'extractDivisions',
      undefined,
      releaseCode,
    )
    await harbourClient.stageRunning(
      resourceReleaseId,
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
      {
        rebuildPublishedSnapshot:
          options.rebuildPublishedSnapshot ?? options.reuseExistingRelease,
      },
    )
    failureAuditScope = { stage: 'assembly', ownerId: versionInsertContext.snapshotId }
    if (options.curatedSourceReleases)
      await retainCuratedSourceReleases(
        dbContext.metaDb as never,
        versionInsertContext.snapshotId,
        resourceReleaseId,
        options.curatedSourceReleases,
      )
    if (!target.remote) {
      progress.update(8, {
        label: formatLocalSetupProgressLabel('current state', 8, setupStepCount),
      })
    }
    let sqlArtefactCount = 0
    let completionCounts: Record<string, number> = {}
    let importProgressClient: HarbourClient = harbourClient
    const activePublication = await getPreparedPublication(
      dbContext.currentDb as never,
      'divisionPublicationState',
      versionInsertContext.snapshotLineageId,
    )
    // A historical branch must not replace the current scope used by dependent families.
    const historicalBackfill = Boolean(
      versionInsertContext.parentSnapshotId &&
        activePublication &&
        activePublication.snapshotId !== versionInsertContext.parentSnapshotId,
    )
    const publication: PublicationPreparation = {
      table: 'divisionPublicationState',
      scopeId: historicalBackfill
        ? retainedDivisionScopeId(
            versionInsertContext.snapshotLineageId,
            versionInsertContext.snapshotId,
          )
        : versionInsertContext.snapshotLineageId,
      snapshotId: versionInsertContext.snapshotId,
      publicationToken: resourceReleaseId,
      timestamp: processingRunStartedAt,
    }
    const deliveryInputs = {
      ...(previewPlan.source === 'saanseoi'
        ? { sourceLedgerPolicy: 'curated-source-v1' }
        : {}),
      classificationFixtureHash: await createHash({
        classification: divisionClassificationFixture,
        curatedDivisionPolicy,
        exclusions: divisionExclusionFixture,
      }),
      preparedSha256: await deliveryFileSha256(preparedUpload.filePath),
      snapshotId: versionInsertContext.snapshotId,
      publicationScopeId: publication.scopeId,
      // Curated Geographic rows are an input to the captured SQL plan.
      // Include their content in the cache key so a curation change cannot
      // reuse a source-only delivery for an already registered release.
      supplementalRowsHash: await createHash({
        rows: options.supplementalRows ?? [],
        supplementalNeighbourhoods,
      }),
      ...(options.nativeRows
        ? { nativeRowsHash: await createHash(options.nativeRows) }
        : {}),
    }
    const deliveryPhase = await resolveDivisionDeliveryPhase({
      ...deliveryInputs,
      rebuildPublishedSnapshot: options.rebuildPublishedSnapshot,
    })
    const deliveryOutputs = await deliverSqlPhase(
      {
        context: dbContext,
        resourceReleaseId,
        phase: deliveryPhase,
        resolvedFamily: 'division',
        publicationTables: ['divisionPublicationState'],
        nativeLocal: true,
        inputs: deliveryInputs,
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
        const ownerShardKeys = dbContext.historyTargets.map(target =>
          buildHistoryOwnerKey(previewPlan.regionCode, shardYear, target.bindingName),
        )
        const currentRows = versionInsertContext.parentSnapshotId
          ? await readDivisionBaseline(
              dbContext,
              versionInsertContext.parentSnapshotId,
              ownerShardKeys,
            )
          : new Map<string, DivisionVersionSnapshot>()
        const servingRows = await getDivisionVersionMapForSnapshot(
          dbContext.currentDb as never,
          publication.scopeId,
          { buildDivisionBaseHashInput, normaliseDivisionI18nSnapshotRow },
          ownerShardKeys,
        )
        const currentSourceRows =
          previewPlan.source === 'overture' || previewPlan.source === 'saanseoi'
            ? await getMergedCurrentSourceDivisionMap(
                dbContext.sourceTargets.map((target, index) => ({
                  db: target.db as never,
                  key: buildSourceOwnerKey(
                    previewPlan.regionCode,
                    shardYear,
                    target.bindingName,
                  ),
                  sortOrder: index,
                })),
                previewPlan.source,
              )
            : new Map()
        await assertDivisionCurrentSnapshotComplete(
          dbContext.currentDb,
          servingRows,
          publication.previous?.snapshotId ?? null,
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
            resourceReleaseId,
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
                  resourceReleaseId,
                  'extractDivisions',
                  {
                    processedRows: current,
                  },
                  releaseCode,
                )
              },
              dbContext.sourceTargets.map(target => target.db as never),
              options.nativeRows,
              options.supplementalRows,
            ),
        )
        await harbourClient.stageCompleted(
          resourceReleaseId,
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
            resourceReleaseId,
            releaseCode,
            'generateDivisionSqlSource',
            previewPlan.rowCount,
            colorRed('source'),
          ),
          reportProgress =>
            buildDivisionSourceSqlFile(initialMessage, divisionState, reportProgress),
        )
        await harbourClient.stageCompleted(
          resourceReleaseId,
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
            resourceReleaseId,
            releaseCode,
            'generateDivisionSqlHistory',
            previewPlan.rowCount,
            colorRed('history'),
          ),
          reportProgress =>
            buildDivisionHistorySqlFile(initialMessage, divisionState, reportProgress),
        )
        await harbourClient.stageCompleted(
          resourceReleaseId,
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
            resourceReleaseId,
            releaseCode,
            'generateDivisionSqlCurrent',
            previewPlan.rowCount,
            colorRed('current'),
          ),
          reportProgress =>
            buildDivisionCurrentSqlFile(
              initialMessage,
              {
                ...divisionState,
                currentRows: servingRows,
                records: divisionState.records.map(record => ({
                  ...record,
                  currentChanged:
                    servingRows.get(record.id)?.churnHash !==
                    divisionState.processedRowsById.get(record.id)?.churnHash,
                  baseChanged:
                    servingRows.get(record.id)?.versionHash !== record.versionHash,
                })),
              },
              reportProgress,
              publication.scopeId,
            ),
        )
        await harbourClient.stageCompleted(
          resourceReleaseId,
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
        // Keep the transition in the same current artefact as its guarded writes.
        // Resolved planning excludes receipt rows from the net diff and emits the
        // equivalent begin/complete envelopes around the sealed mutations.
        currentFile.sql = `${buildBeginPublicationSql(publication)}\n${currentFile.sql}`

        const provenanceRetainStartedAt = Date.now()
        progress.beginPhase(
          formatRunningPhaseLabel(
            colorTeal('Retain'),
            colorRed('processing provenance'),
          ),
          {},
        )
        if (previewPlan.source === 'overture' || previewPlan.source === 'saanseoi') {
          const sourceAudit = await retainDivisionSourceAudit(bucket, {
            resourceReleaseId,
            datasetCode,
            source: previewPlan.source,
            resourceType: previewPlan.resourceType,
            sourceVersion: previewPlan.sourceVersion,
            guards: [
              ...(options.sourceAuditGuards ?? []),
              ...divisionState.auditGuards.filter(guard =>
                [
                  'division-source-identities',
                  'overture-division-source-assumptions',
                ].includes(guard.id),
              ),
            ],
            inputCount: previewPlan.rowCount,
            outputCount: divisionState.records.filter(record => !record.isSupplemental)
              .length,
          })
          await deliverProcessingResult(target, bucket, sourceAudit.ref)
        }
        const audit = await retainDivisionProvenance(bucket, {
          scope: { stage: 'assembly', ownerId: divisionState.snapshotId },
          resourceReleaseId,
          datasetCode,
          actions: [
            ...divisionState.processingActions,
            ...(options.sourceSelectionAudit
              ? [
                  {
                    action: options.sourceSelectionAudit.declaration.id,
                    affectedRecordCount: options.sourceSelectionAudit.recordsAffected,
                    evidence: options.sourceSelectionAudit.decisions,
                    mode: 'automatic' as const,
                    summary: options.sourceSelectionAudit.declaration.summary,
                  },
                ]
              : []),
          ],
          ...(options.sourceSelectionAudit
            ? {
                actionDeclarations: {
                  [options.sourceSelectionAudit.declaration.id]:
                    options.sourceSelectionAudit.declaration,
                },
                actionCounts: {
                  [options.sourceSelectionAudit.declaration.id]: {
                    inputs: options.sourceSelectionAudit.inputs,
                    outputs: options.sourceSelectionAudit.outputs,
                    decisions: options.sourceSelectionAudit.decisions,
                  },
                },
              }
            : {}),
          branchCounts: divisionState.branchCounts,
          curationDocuments: divisionState.curationDocuments,
          guards: divisionState.auditGuards.filter(
            guard =>
              !['overture', 'saanseoi'].includes(previewPlan.source) ||
              ![
                'division-source-identities',
                'overture-division-source-assumptions',
              ].includes(guard.id),
          ),
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
            resourceReleaseId,
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
          resourceReleaseId,
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
          resourceReleaseId,
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
                resourceReleaseId,
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
                resourceReleaseId,
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
              const currentInitKey = manifest.currentInitKey

              if (currentInitKey) {
                await runReportedSqlImportPhase(
                  importProgressClient,
                  resourceReleaseId,
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
                resourceReleaseId,
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
                resourceReleaseId,
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
      resourceReleaseId,
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
      resourceReleaseId,
      'extractDivisionsI18n',
      {
        localisedRows: retained.localisedRows,
      },
      releaseCode,
    )

    await runReportedSqlImportPhase(
      importProgressClient,
      resourceReleaseId,
      releaseCode,
      'publishDataset',
      async () => {
        publishResult = await importProgressClient.publishDataset(
          resourceReleaseId,
          releaseCode,
          {
            carriedSnapshots: curatedInventorySnapshots(options.curatedSourceReleases),
            deferApiReleaseSet: options.deferApiReleaseSet,
            deferSourcePublish: options.deferSourcePublish,
            skipSnapshotCleanup: options.skipSnapshotCleanup,
            rebuildPublishedSnapshot: options.rebuildPublishedSnapshot,
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
        resourceReleaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await harbourClient.stageCompleted(
      resourceReleaseId,
      'processDataset',
      {
        resourceType: previewPlan.resourceType,
        sourceRows: previewPlan.rowCount,
        ...retained,
        sqlArtefactCount,
      } satisfies DatasetProcessingStats & Record<string, unknown>,
      releaseCode,
    )
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
    await harbourClient.stageFailed(
      resourceReleaseId,
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
          resourceReleaseId,
        )
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (!postPublishCacheError && published)
      await completeSqlDeliveryRelease(dbContext.state.dbCacheDir, resourceReleaseId)
  }

  if (postPublishCacheError) {
    throw postPublishCacheError
  }

  return { publishResult }
}

export { runDivisionSqlImportOperations } from './processLocalDivisionSqlUploadImport.ts'
