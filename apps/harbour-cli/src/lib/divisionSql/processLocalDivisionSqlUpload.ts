import { mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  resolveLatestPublishedSnapshotForResourceTypeRegion,
  resolveShardForTypeRegionYear,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  and,
  eq,
  metaReleaseShardAssignments,
  metaSnapshotAssemblyRuns,
  metaSnapshotSources,
  metaSnapshots,
  releaseProcessingActions,
  stats,
} from '@repo/db'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import type { MetaDatabase } from '@repo/db'
import type { DivisionI18nPayload, NewDivisionRow } from '@repo/db/currentSchema'

import type { CurrentSourceRecord } from '@repo/core/pipeline/db/source'
import {
  replaceReleaseProcessingActions,
  type ReleaseProcessingAction,
} from '@repo/core/pipeline/db/processingActions'
import {
  buildSourceReleaseId,
  getMergedCurrentSourceOvertureDivisionMap,
} from '@repo/core/pipeline/db/source'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { DivisionVersionSnapshot } from '@repo/core/pipeline/db/division'
import {
  countDivisionCurrentSnapshotI18nRows,
  countDivisionCurrentSnapshotRows,
  getDivisionCurrentSnapshotTraceState,
  getMergedCurrentDivisionVersionMap,
  getDivisionVersionMapForSnapshot,
  prepareDivisionVersionInsertContext,
} from '@repo/core/pipeline/db/division'
import {
  logDivisionTrace,
  logDivisionTraceGroup,
  resolveDivisionTraceIds,
} from '@repo/core/pipeline/logging'
import { createAsyncBufferFromR2 } from '@repo/core/pipeline/parquetR2'
import {
  buildCanonicalDivisionApiI18n,
  buildDivisionBaseHashInput,
  buildDivisionHierarchyLookup,
  buildOvertureDivisionLocaleProcessingActions,
  normaliseDivisionI18nSnapshotRow,
  normaliseDivisionRow,
  resolveAdminLevelValue,
  resolveDistrictId,
} from '@repo/core/pipeline/services/division'
import { readDivisionRowsWithFixtures } from '@repo/core/pipeline/services/divisionFixtures'
import {
  buildChurnCounts,
  buildChurnStatsRows,
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  buildQualityCounts,
  buildQualityStatsRows,
  createLocaleStatsAccumulator,
  hasLocaleRegression,
  hasNameRegression,
  updateLocaleStatsAccumulator,
} from '@repo/core/pipeline/services/stats'
import {
  createHash,
  chunkArray,
  getMaxItemsPerInClause,
} from '@repo/core/pipeline/utils'
import {
  buildSqlPipelineArtefactKey,
  writeTextArtefact,
} from '@repo/core/pipeline/services/pipelineArtefacts'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
  createLocalImportProgressClient,
  runLocalStreamingPhase,
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
import {
  executeSqlText,
  importSqlArtefactKeys,
  runReportedSqlImportPhase,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import { LocalPipelineBucket } from '../addressSql/localBucket.ts'
import {
  invalidateRemoteDbCache,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  type LocalDbCacheProgressEvent,
} from '../addressSql/localDbCache.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type UploadPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'hkgov-landsd' | 'overture'
  sourceVersion: string
  theme: 'divisions'
  type: 'division'
}

type DivisionPreparedRecord = {
  base: Omit<NewDivisionRow, 'snapshotId'>
  baseChanged: boolean
  canonicalI18n: DivisionI18nPayload[]
  currentChanged: boolean
  currentExists: boolean
  id: string
  i18nVersionHash: string
  raw: Record<string, unknown>
  sourceChanged: boolean
  sourcePayloadHash: string
  versionHash: string
}

type DivisionSqlImportFile = {
  bytes: number
  filename: string
  sql: string
  statementCount: number
  target: 'current' | 'history' | 'meta' | 'source'
}

type DivisionSqlState = {
  currentRows: Map<string, OwnedDivisionVersionSnapshot>
  currentSourceRows: Map<string, OwnedCurrentSourceRecord>
  deletedRows: number
  insertedVersions: number
  isInitialSourceLoad: boolean
  localisedRows: number
  previousRows: Map<string, DivisionVersionSnapshot>
  processedRows: number
  processedRowsById: Map<string, DivisionVersionSnapshot>
  processingActions: ReleaseProcessingAction[]
  records: DivisionPreparedRecord[]
  seenIds: Set<string>
  snapshotId: string
  sourceChangedRows: number
  sourceUnchangedRows: number
  statsRows: ReleaseScopedStatsRow[]
  unchangedRows: number
}

type DivisionSqlArtefactManifest = {
  currentKey: string
  currentInitKey: string | null
  historyKey: string
  metaKey: string
  sourceKey: string
}

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const DIVISION_BATCH_SIZE = 1024
const LOCAL_SQL_WRITE_RETRY_LIMIT = 8
const REMOTE_IMPORT_BATCH_BYTES = 64 * 1024 * 1024
const SQL_STATEMENT_BYTE_TARGET = 99_000
const PRIMARY_HISTORY_OWNER_KEY = 'history-current'
const PRIMARY_SOURCE_OWNER_KEY = 'source-current'

type OwnedDivisionVersionSnapshot = DivisionVersionSnapshot & {
  ownerShardKeys?: string[]
}

type OwnedCurrentSourceRecord = CurrentSourceRecord & {
  ownerShardKeys?: string[]
}

type ExtraSqlImportOperation = {
  sql: string
  target: SqlImportTargetContext
}

export async function processLocalDivisionSqlUpload(
  target: UploadTarget,
  previewPlan: UploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
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
  const progress = new LocalUploadProgress()
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
  const cacheTableProfile = target.remote ? undefined : 'division'
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
    type: previewPlan.type,
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
    const currentRows = versionInsertContext.parentSnapshotId
      ? await getDivisionVersionMapForSnapshot(
          dbContext.currentDb as never,
          versionInsertContext.parentSnapshotId,
          {
            buildDivisionBaseHashInput,
            normaliseDivisionI18nSnapshotRow,
          },
          dbContext.historyTargets.map((target, index) =>
            buildHistoryOwnerKey(previewPlan.regionCode, shardYear, target.bindingName),
          ),
        )
      : new Map<string, DivisionVersionSnapshot>()
    if (versionInsertContext.parentSnapshotId && currentRows.size === 0) {
      throw new Error(
        `Parent division snapshot ${versionInsertContext.parentSnapshotId} is not materialised in current storage; refusing to branch from another snapshot.`,
      )
    }
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
      dbContext.metaDb,
      dbContext.currentDb,
      currentRows,
      previewPlan.regionCode,
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
          currentRows,
          currentSourceRows,
          versionInsertContext.snapshotId,
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

    const currentInitFile = await buildDivisionCurrentInitSqlFile(
      versionInsertContext.parentSnapshotId,
      divisionState.snapshotId,
      initialMessage.processingRunStartedAt ?? processingRunStartedAt,
    )
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
        buildDivisionCurrentSqlFile(initialMessage, divisionState, reportProgress),
    )
    await harbourClient.stageCompleted(
      releaseId,
      'generateDivisionSqlCurrent',
      {
        processedRows: divisionState.processedRows,
      },
      releaseCode,
    )

    await replaceReleaseProcessingActions(
      dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
      releaseId,
      divisionState.processingActions,
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
      initialMessage,
      divisionState,
      importTargets,
    )
    const importProgressClient = createLocalImportProgressClient(
      harbourClient,
      progress,
      buildDivisionImportProgressConfig(
        manifest,
        extraSourceSqlOperations.length + extraHistorySqlOperations.length,
      ),
    )

    await Promise.all([
      runReportedSqlImportPhase(
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
      ).then(async result => {
        for (const operation of extraSourceSqlOperations) {
          await executeSqlText(operation.target, operation.sql, importOptions)
        }

        return result
      }),
      runReportedSqlImportPhase(
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
      ).then(async result => {
        for (const operation of extraHistorySqlOperations) {
          await executeSqlText(operation.target, operation.sql, importOptions)
        }

        return result
      }),
      (async () => {
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
      })(),
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
    ])

    await harbourClient.stageCompleted(
      releaseId,
      'extractDivisions',
      {
        deletedRows: divisionState.deletedRows,
        insertedVersions: divisionState.insertedVersions,
        processedRows: divisionState.processedRows,
        unchangedRows: divisionState.unchangedRows,
      },
      releaseCode,
    )
    await harbourClient.stageCompleted(
      releaseId,
      'extractDivisionsI18n',
      {
        localisedRows: divisionState.localisedRows,
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
            skipSnapshotCleanup: options.skipSnapshotCleanup,
          },
        )

        return {
          stepCount: 1,
        }
      },
    )
    if (target.remote) {
      try {
        shouldRefreshRemoteMetaCache = await replayDivisionSqlIntoRemoteCache(
          target,
          dbContext,
          bucket,
          importTargets,
          manifest,
          extraSourceSqlOperations,
          extraHistorySqlOperations,
          importOptions,
        )
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    await calculateAndStoreApiReleaseSetStats({
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
    await harbourClient.stageCompleted(
      releaseId,
      'processDataset',
      {
        sqlArtefactCount:
          countDivisionImportFiles(manifest) +
          extraSourceSqlOperations.length +
          extraHistorySqlOperations.length,
      },
      releaseCode,
    )
  } catch (error) {
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
  }

  if (postPublishCacheError) {
    throw postPublishCacheError
  }

  return { publishResult }
}

async function replayDivisionSqlIntoRemoteCache(
  target: UploadTarget,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  bucket: LocalPipelineBucket,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
  manifest: DivisionSqlArtefactManifest,
  extraSourceSqlOperations: ExtraSqlImportOperation[],
  extraHistorySqlOperations: ExtraSqlImportOperation[],
  importOptions: SqlImportExecutionOptions,
) {
  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheImportOptions: SqlImportExecutionOptions = {
    ...importOptions,
    accountId: undefined,
    apiToken: undefined,
    isLocal: true,
  }

  try {
    await Promise.all([
      importSqlArtefactKeys(
        bucket,
        importTargets.source,
        [manifest.sourceKey],
        cacheImportOptions,
        async () => undefined,
      ).then(async () => {
        for (const operation of extraSourceSqlOperations) {
          await executeSqlText(operation.target, operation.sql, cacheImportOptions)
        }
      }),
      importSqlArtefactKeys(
        bucket,
        importTargets.history,
        [manifest.historyKey],
        cacheImportOptions,
        async () => undefined,
      ).then(async () => {
        for (const operation of extraHistorySqlOperations) {
          await executeSqlText(operation.target, operation.sql, cacheImportOptions)
        }
      }),
      (async () => {
        if (manifest.currentInitKey) {
          await importSqlArtefactKeys(
            bucket,
            importTargets.current,
            [manifest.currentInitKey],
            cacheImportOptions,
            async () => undefined,
          )
        }

        await importSqlArtefactKeys(
          bucket,
          importTargets.current,
          [manifest.currentKey],
          cacheImportOptions,
          async () => undefined,
        )
      })(),
    ])

    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    await invalidateRemoteDbCache(targetName, dbContext.state.dbCacheDir, reason)
    throw new Error(
      `Remote upload succeeded, but updating the ${targetName} local cache failed. The cache was invalidated and future uploads will stop until it is rebuilt explicitly. ${reason}`,
    )
  }
}

async function refreshRemoteMetaCacheAfterReplay(
  targetName: 'preview' | 'production',
  cacheDir: string,
) {
  try {
    await refreshRemoteMetaCache(targetName, cacheDir)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    await invalidateRemoteDbCache(targetName, cacheDir, reason)
    throw new Error(
      `Remote upload succeeded, but refreshing the ${targetName} local meta cache failed. The cache was invalidated and future uploads will stop until it is rebuilt explicitly. ${reason}`,
    )
  }
}

function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const label = formatDbCacheProgressLabel(event)
  const current = Math.min(event.current, event.total)

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, {
      current,
      max: event.total,
    })
  } else {
    progress.update(current, {
      label,
      max: event.total,
    })
  }

  if (event.action === 'reuse-cache') {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Cache'), colorRed('hit'), 0),
        ['0 ms'],
      ),
    )
  }
}

function formatLocalSetupProgressLabel(
  subject: string,
  current: number,
  total: number,
) {
  return formatRunningPhaseLabel(
    colorTeal('Prepare'),
    colorRed(subject),
    current,
    total,
  )
}

function formatDbCacheProgressLabel(event: LocalDbCacheProgressEvent) {
  const subject = describeDbCacheSubject(event)

  return formatRunningPhaseLabel(
    colorTeal('Clone cache'),
    colorRed(subject),
    Math.min(event.current, event.total),
    event.total,
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

async function assertDivisionCurrentSnapshotComplete(
  metaDb: MetaDatabase,
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  currentRows: Map<string, DivisionVersionSnapshot>,
  regionCode: RegionCode,
) {
  const traceDivisionIds = resolveDivisionTraceIds()
  const activeSnapshot = await resolveLatestPublishedSnapshotForResourceTypeRegion(
    metaDb as unknown as HarbourReadableDb,
    'division',
    regionCode,
  )

  if (!activeSnapshot) {
    return
  }

  const [activeSnapshotRowCount, activeSnapshotI18nRowCount] = await Promise.all([
    countDivisionCurrentSnapshotRows(currentDb as never, activeSnapshot.id),
    countDivisionCurrentSnapshotI18nRows(currentDb as never, activeSnapshot.id),
  ])
  const expectedI18nRowCount = [...currentRows.values()].reduce(
    (total, row) => total + row.localisedRows.length,
    0,
  )

  const traceState = await getDivisionCurrentSnapshotTraceState(
    currentDb as never,
    activeSnapshot.id,
    [...traceDivisionIds],
  )

  for (const divisionId of traceDivisionIds) {
    const snapshotState = traceState.get(divisionId)

    logDivisionTrace(traceDivisionIds, divisionId, {
      activeSnapshotCode: activeSnapshot.code,
      activeSnapshotId: activeSnapshot.id,
      event: 'baseline',
      historyCurrentExists: currentRows.has(divisionId),
      historyCurrentLocaleCount: currentRows.get(divisionId)?.localisedRows.length ?? 0,
      phase: 'assertDivisionCurrentSnapshotComplete',
      snapshotI18nRowCount: snapshotState?.i18nRowCount ?? 0,
      snapshotRowExists: snapshotState?.isPresent ?? false,
    })
  }

  if (currentRows.size > 0 && activeSnapshotRowCount < currentRows.size) {
    for (const divisionId of traceDivisionIds) {
      const snapshotState = traceState.get(divisionId)

      logDivisionTrace(traceDivisionIds, divisionId, {
        activeSnapshotCode: activeSnapshot.code,
        activeSnapshotId: activeSnapshot.id,
        event: 'activeSnapshotMismatch',
        historyCurrentExists: currentRows.has(divisionId),
        historyCurrentLocaleCount:
          currentRows.get(divisionId)?.localisedRows.length ?? 0,
        phase: 'assertDivisionCurrentSnapshotComplete',
        snapshotI18nRowCount: snapshotState?.i18nRowCount ?? 0,
        snapshotRowExists: snapshotState?.isPresent ?? false,
      })
    }

    throw new Error(
      `Active division snapshot ${activeSnapshot.id} is incomplete in current storage: expected at least ${currentRows.size} rows, found ${activeSnapshotRowCount}.`,
    )
  }

  if (expectedI18nRowCount > 0 && activeSnapshotI18nRowCount < expectedI18nRowCount) {
    throw new Error(
      `Active division snapshot ${activeSnapshot.id} is incomplete in current i18n storage: expected at least ${expectedI18nRowCount} rows, found ${activeSnapshotI18nRowCount}.`,
    )
  }
}

async function buildDivisionSqlState(
  bucket: LocalPipelineBucket,
  message: DatasetProcessingMessage,
  currentRows: Map<string, OwnedDivisionVersionSnapshot>,
  currentSourceRows: Map<string, OwnedCurrentSourceRecord>,
  snapshotId: string,
  reportProgress: (current: number) => Promise<void>,
) {
  const traceDivisionIds = resolveDivisionTraceIds()
  const previousRows = new Map(currentRows)
  const processedRowsById = new Map<string, DivisionVersionSnapshot>()
  const statsAccumulator = createLocaleStatsAccumulator()
  const districtCounts = new Map<string, number>()
  const processingActions: ReleaseProcessingAction[] = []
  const records: DivisionPreparedRecord[] = []
  const seenIds = new Set<string>()
  const isInitialSourceLoad = currentSourceRows.size === 0
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const hierarchyLookup = await buildDivisionHierarchyLookup(file)

  let processedRows = 0
  let insertedVersions = 0
  let localisedRows = 0
  let sourceChangedRows = 0
  let sourceUnchangedRows = 0
  let unchangedRows = 0

  for (const divisionId of traceDivisionIds) {
    logDivisionTrace(traceDivisionIds, divisionId, {
      event: 'baseline',
      historyCurrentExists: currentRows.has(divisionId),
      historyCurrentLocaleCount: currentRows.get(divisionId)?.localisedRows.length ?? 0,
      phase: 'buildDivisionSqlState',
      snapshotId,
      sourceCurrentExists: currentSourceRows.has(divisionId),
      sourceVersion: message.sourceVersion,
    })
  }

  for await (const { isSupplemental, rows: batch } of readDivisionRowsWithFixtures(
    file,
    message,
    DIVISION_BATCH_SIZE,
  )) {
    for (const row of batch) {
      const raw = row as Record<string, unknown>
      const normalised = normaliseDivisionRow(raw, { hierarchyLookup })
      const canonicalI18n = buildCanonicalDivisionApiI18n(normalised.i18n)
      processingActions.push(
        ...buildOvertureDivisionLocaleProcessingActions({
          canonicalI18n,
          division: normalised.base,
          rawNames: raw.names,
          sourceI18n: normalised.i18n,
        }),
      )
      const versionHash = await createHash(buildDivisionBaseHashInput(normalised.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalised.base),
        i18n: canonicalI18n,
      })
      const sourcePayloadHash = await createHash(raw)
      const current = currentRows.get(normalised.base.id)
      const currentChanged = current?.churnHash !== churnHash
      const baseChanged = current?.versionHash !== versionHash
      const i18nVersionHash =
        !baseChanged && currentChanged
          ? await createHash({
              baseVersionHash: versionHash,
              i18n: canonicalI18n.map(localised => ({
                isLocaleInferred: localised.isLocaleInferred,
                locale: localised.locale,
                name: localised.name ?? null,
                nameAlts: localised.nameAlts ?? null,
                nameRules: localised.nameRules,
                nameVariant: localised.nameVariant,
              })),
              kind: 'division-i18n',
            })
          : versionHash
      const currentSource = currentSourceRows.get(normalised.base.id) ?? null
      const sourceChanged = currentSource?.sourcePayloadHash !== sourcePayloadHash

      processedRows += 1
      localisedRows += canonicalI18n.length
      seenIds.add(normalised.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        canonicalI18n.map(localised => ({
          hasAltName: Boolean(localised.nameAlts),
          hasName: Boolean(localised.name),
          isLocaleInferred: localised.isLocaleInferred,
          locale: localised.locale,
        })),
      )
      const districtId = resolveDistrictId(normalised.base)
      if (districtId) {
        districtCounts.set(districtId, (districtCounts.get(districtId) ?? 0) + 1)
      }
      processedRowsById.set(normalised.base.id, {
        churnHash,
        geometry: normalised.base.geometry,
        id: normalised.base.id,
        localisedRows: canonicalI18n,
        parentId: resolveParentDivisionIdFromHierarchy(normalised.base.hierarchy),
        type: normalised.base.type,
        versionHash,
      })

      logDivisionTrace(traceDivisionIds, normalised.base.id, {
        baseChanged,
        currentChanged,
        currentExists: Boolean(current),
        event: 'rowSeen',
        historyCurrentLocaleCount: current?.localisedRows.length ?? 0,
        localeCount: canonicalI18n.length,
        phase: 'buildDivisionSqlState',
        sourceChanged,
        sourceCurrentExists: Boolean(currentSource),
        sourceVersion: message.sourceVersion,
      })

      if (sourceChanged) {
        sourceChangedRows += 1
      } else if (currentSource) {
        sourceUnchangedRows += 1
      }

      if (!currentChanged) {
        unchangedRows += 1
      } else if (baseChanged) {
        insertedVersions += 1
      }

      records.push({
        base: normalised.base,
        baseChanged,
        canonicalI18n,
        currentChanged,
        currentExists: Boolean(current),
        id: normalised.base.id,
        i18nVersionHash,
        raw,
        sourceChanged,
        sourcePayloadHash,
        versionHash,
      })
    }

    if (!isSupplemental) {
      await reportProgress(processedRows)
    }
  }

  logDivisionTraceGroup(
    traceDivisionIds,
    [...currentRows.keys()].filter(id => !seenIds.has(id)),
    {
      event: 'missingFromDataset',
      phase: 'buildDivisionSqlState',
      snapshotId,
      sourceVersion: message.sourceVersion,
    },
  )

  const statsRows = [
    ...buildLocaleStatsRows(statsAccumulator),
    ...buildDistrictDistributionStatsRows(districtCounts),
    ...buildChurnStatsRows(buildChurnCounts(previousRows, processedRowsById)),
    ...buildQualityStatsRows(
      buildQualityCounts(previousRows, processedRowsById, {
        hasLocaleRegression,
        hasNameRegression,
      }),
    ),
  ]

  return {
    currentRows,
    currentSourceRows,
    deletedRows: [...currentRows.keys()].filter(id => !seenIds.has(id)).length,
    insertedVersions,
    isInitialSourceLoad,
    localisedRows,
    previousRows,
    processedRows,
    processedRowsById,
    processingActions,
    records,
    seenIds,
    snapshotId,
    sourceChangedRows,
    sourceUnchangedRows,
    statsRows,
    unchangedRows,
  } satisfies DivisionSqlState
}

async function buildDivisionSourceSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  if (message.source !== 'overture') {
    return buildSqlImportFile(
      'source',
      `${buildDivisionSqlRunId(message)}-source.sql`,
      ['SELECT 1;'],
    )
  }

  const releaseId = buildSourceReleaseId(message)
  const changedBaseRows: Record<string, SqlValue>[] = []
  const changedIds: string[] = []
  const unchangedIds: string[] = []

  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (record.sourceChanged) {
        changedIds.push(record.id)
        changedBaseRows.push({
          sourceRecordId: record.id,
          names: jsonText(record.raw.names),
          admin_level: resolveAdminLevelValue(record.raw),
          subtype: sourceString(record.raw.subtype),
          class: sourceString(record.raw.class),
          wikidata: record.base.wikidata,
          hierarchies: jsonText(record.raw.hierarchies),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          rawProperties: jsonText(record.raw),
          version: asOptionalInteger(record.raw.version),
          versionHash: record.sourcePayloadHash,
          releaseId,
          validFromRelease: message.sourceVersion,
          validToRelease: null,
          isCurrent: true,
        })
      } else if (state.currentSourceRows.has(record.id)) {
        unchangedIds.push(record.id)
      }
    }
  })

  const missingIds = [...state.currentSourceRows.keys()].filter(
    id => !state.seenIds.has(id),
  )
  const changedIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      changedIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const unchangedIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      unchangedIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const missingIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentSourceRows,
      missingIds,
      PRIMARY_SOURCE_OWNER_KEY,
    ).get(PRIMARY_SOURCE_OWNER_KEY) ?? []
  const now = new Date().toISOString()
  const statements = [
    ...buildAdvanceSourceReleaseStatements(unchangedIdsInPrimary, releaseId, now),
    ...buildCloseSourceVersionStatements(
      changedIdsInPrimary,
      message.sourceVersion,
      now,
    ),
    ...buildCloseSourceVersionStatements(
      missingIdsInPrimary,
      message.sourceVersion,
      now,
    ),
    ...buildInsertStatements(
      'overtureDivisions',
      [
        'sourceRecordId',
        'names',
        'admin_level',
        'subtype',
        'class',
        'wikidata',
        'hierarchies',
        'cartography',
        'sources',
        'rawProperties',
        'version',
        'versionHash',
        'releaseId',
        'validFromRelease',
        'validToRelease',
        'isCurrent',
      ],
      changedBaseRows,
      {
        suffix: `
ON CONFLICT(sourceRecordId, versionHash) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = ${sqlLiteral(now)}`.trim(),
      },
    ),
  ]

  return buildSqlImportFile(
    'source',
    `${buildDivisionSqlRunId(message)}-source.sql`,
    statements,
  )
}

async function buildDivisionHistorySqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const changedExistingIds: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (!record.currentChanged) {
        continue
      }

      if (record.currentExists) {
        changedExistingIds.push(record.id)
      }

      baseRows.push({
        id: record.id,
        versionHash: record.versionHash,
        sourceReleaseId: message.releaseId ?? message.datasetId,
        snapshotId: state.snapshotId,
        isCurrent: true,
        level: record.base.level,
        type: record.base.type,
        sourceKeys: jsonText(record.base.sourceKeys),
        wikidata: record.base.wikidata,
        hierarchy: jsonText(record.base.hierarchy),
        cartography: jsonText(record.base.cartography),
        sources: jsonText(record.base.sources),
        geometry: jsonText(record.base.geometry),
        bbox: jsonText(record.base.bbox),
        createdAt: record.base.createdAt,
        updatedAt: record.base.updatedAt,
      })
      i18nRows.push(
        ...record.canonicalI18n.map(localised => ({
          divisionId: record.id,
          versionHash: record.baseChanged ? record.versionHash : record.i18nVersionHash,
          sourceReleaseId: message.releaseId ?? message.datasetId,
          snapshotId: state.snapshotId,
          isCurrent: true,
          locale: localised.locale,
          name: localised.name ?? null,
          nameVariant: jsonText(localised.nameVariant),
          nameAlts: localised.nameAlts ?? null,
          nameRules: jsonText(localised.nameRules),
          isLocaleInferred: localised.isLocaleInferred,
          createdAt: record.base.updatedAt,
          updatedAt: record.base.updatedAt,
        })),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const changedExistingIdsInPrimary =
    groupIdsByOwnerShard(
      state.currentRows,
      changedExistingIds,
      PRIMARY_HISTORY_OWNER_KEY,
    ).get(PRIMARY_HISTORY_OWNER_KEY) ?? []
  const missingIdsInPrimary =
    groupIdsByOwnerShard(state.currentRows, missingIds, PRIMARY_HISTORY_OWNER_KEY).get(
      PRIMARY_HISTORY_OWNER_KEY,
    ) ?? []
  const now = new Date().toISOString()
  const statements = [
    ...buildCloseHistoryVersionStatements(changedExistingIdsInPrimary, now),
    ...buildCloseHistoryVersionStatements(missingIdsInPrimary, now),
    ...buildInsertStatements(
      'divisions',
      [
        'id',
        'versionHash',
        'sourceReleaseId',
        'snapshotId',
        'isCurrent',
        'level',
        'type',
        'sourceKeys',
        'wikidata',
        'hierarchy',
        'cartography',
        'sources',
        'geometry',
        'bbox',
        'createdAt',
        'updatedAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(id, versionHash) DO UPDATE SET
  isCurrent = 1,
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'divisionId',
        'versionHash',
        'sourceReleaseId',
        'snapshotId',
        'isCurrent',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'isLocaleInferred',
        'createdAt',
        'updatedAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(divisionId, versionHash, locale) DO UPDATE SET
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  isCurrent = 1,
  name = excluded.name,
  nameVariant = excluded.nameVariant,
  nameAlts = excluded.nameAlts,
  nameRules = excluded.nameRules,
  isLocaleInferred = excluded.isLocaleInferred,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotVersionChanges',
      [
        'snapshotId',
        'recordType',
        'recordId',
        'locale',
        'versionHash',
        'operation',
        'sourceReleaseId',
        'createdAt',
        'updatedAt',
      ],
      [
        ...baseRows.map(row => ({
          snapshotId: state.snapshotId,
          recordType: 'division',
          recordId: row.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
        ...i18nRows.map(row => ({
          snapshotId: state.snapshotId,
          recordType: 'divisionI18n',
          recordId: row.divisionId,
          locale: row.locale,
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
        ...missingIds.map(recordId => ({
          snapshotId: state.snapshotId,
          recordType: 'division',
          recordId,
          locale: '',
          versionHash: null,
          operation: 'delete',
          sourceReleaseId: message.releaseId ?? message.datasetId,
          createdAt: now,
          updatedAt: now,
        })),
      ],
      {
        suffix: `
ON CONFLICT(snapshotId, recordType, recordId, locale) DO UPDATE SET
  versionHash = excluded.versionHash,
  operation = excluded.operation,
  sourceReleaseId = excluded.sourceReleaseId,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
  ]

  return buildSqlImportFile(
    'history',
    `${buildDivisionSqlRunId(message)}-history.sql`,
    statements,
  )
}

async function buildDivisionCurrentInitSqlFile(
  parentSnapshotId: string | null,
  snapshotId: string,
  clonedAt: string,
) {
  const statements: string[] = []

  if (parentSnapshotId && parentSnapshotId !== snapshotId) {
    statements.push(
      `
INSERT INTO divisions (
  snapshotId, id, level, type, sourceKeys, wikidata, hierarchy,
  cartography, sources, geometry, bbox, createdAt, updatedAt
)
SELECT
  ${sqlLiteral(snapshotId)}, id, level, type, sourceKeys, wikidata, hierarchy,
  cartography, sources, geometry, bbox, ${sqlLiteral(clonedAt)}, ${sqlLiteral(clonedAt)}
FROM divisions
WHERE snapshotId = ${sqlLiteral(parentSnapshotId)}
ON CONFLICT(snapshotId, id) DO NOTHING;`.trim(),
    )
    statements.push(
      `
INSERT INTO divisionsI18n (
  snapshotId, divisionId, locale, name, nameVariant, nameAlts, nameRules,
  isLocaleInferred, createdAt, updatedAt
)
SELECT
  ${sqlLiteral(snapshotId)}, divisionId, locale, name, nameVariant, nameAlts, nameRules,
  isLocaleInferred, ${sqlLiteral(clonedAt)}, ${sqlLiteral(clonedAt)}
FROM divisionsI18n
WHERE snapshotId = ${sqlLiteral(parentSnapshotId)}
ON CONFLICT(snapshotId, divisionId, locale) DO NOTHING;`.trim(),
    )
  }

  if (statements.length === 0) {
    return null
  }

  return buildSqlImportFile('current', `${snapshotId}-current-init.sql`, statements)
}

async function buildDivisionCurrentSqlFile(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const baseRows: Record<string, SqlValue>[] = []
  const i18nRows: Record<string, SqlValue>[] = []
  const changedIds: string[] = []
  await processDivisionRecordBatches(state.records, reportProgress, batch => {
    for (const record of batch) {
      if (!record.currentChanged) {
        continue
      }

      changedIds.push(record.id)

      if (record.baseChanged) {
        baseRows.push({
          snapshotId: state.snapshotId,
          id: record.id,
          level: record.base.level,
          type: record.base.type,
          sourceKeys: jsonText(record.base.sourceKeys),
          wikidata: record.base.wikidata,
          hierarchy: jsonText(record.base.hierarchy),
          cartography: jsonText(record.base.cartography),
          sources: jsonText(record.base.sources),
          geometry: jsonText(record.base.geometry),
          bbox: jsonText(record.base.bbox),
          createdAt: record.base.createdAt,
          updatedAt: record.base.updatedAt,
        })
      }

      i18nRows.push(
        ...record.canonicalI18n.map(localised => ({
          snapshotId: state.snapshotId,
          divisionId: record.id,
          locale: localised.locale,
          name: localised.name ?? null,
          nameVariant: jsonText(localised.nameVariant),
          nameAlts: localised.nameAlts ?? null,
          nameRules: jsonText(localised.nameRules),
          isLocaleInferred: localised.isLocaleInferred,
          createdAt: record.base.updatedAt,
          updatedAt: record.base.updatedAt,
        })),
      )
    }
  })

  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const statements = [
    ...buildInsertStatements(
      'divisions',
      [
        'snapshotId',
        'id',
        'level',
        'type',
        'sourceKeys',
        'wikidata',
        'hierarchy',
        'cartography',
        'sources',
        'geometry',
        'bbox',
        'createdAt',
        'updatedAt',
      ],
      baseRows,
      {
        suffix: `
ON CONFLICT(snapshotId, id) DO UPDATE SET
  level = excluded.level,
  type = excluded.type,
  sourceKeys = excluded.sourceKeys,
  wikidata = excluded.wikidata,
  hierarchy = excluded.hierarchy,
  cartography = excluded.cartography,
  sources = excluded.sources,
  geometry = excluded.geometry,
  bbox = excluded.bbox,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildDeleteCurrentI18nStatements(state.snapshotId, changedIds),
    ...buildInsertStatements(
      'divisionsI18n',
      [
        'snapshotId',
        'divisionId',
        'locale',
        'name',
        'nameVariant',
        'nameAlts',
        'nameRules',
        'isLocaleInferred',
        'createdAt',
        'updatedAt',
      ],
      i18nRows,
      {
        suffix: `
ON CONFLICT(snapshotId, divisionId, locale) DO UPDATE SET
  name = excluded.name,
  nameVariant = excluded.nameVariant,
  nameAlts = excluded.nameAlts,
  nameRules = excluded.nameRules,
  isLocaleInferred = excluded.isLocaleInferred,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildDeleteCurrentDivisionStatements(state.snapshotId, missingIds),
  ]

  return buildSqlImportFile(
    'current',
    `${buildDivisionSqlRunId(message)}-current.sql`,
    statements,
  )
}

async function buildDivisionMetaSqlFile(
  metaDb: MetaDatabase,
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  reportProgress: (current: number) => Promise<void>,
) {
  const releaseId = message.releaseId ?? message.datasetId
  const snapshotRow = await metaDb
    .select({
      id: metaSnapshots.id,
      resourceType: metaSnapshots.resourceType,
      code: metaSnapshots.code,
      cohortKey: metaSnapshots.cohortKey,
      status: metaSnapshots.status,
      publishedAt: metaSnapshots.publishedAt,
      validFrom: metaSnapshots.validFrom,
      validTo: metaSnapshots.validTo,
      notes: metaSnapshots.notes,
      createdAt: metaSnapshots.createdAt,
      updatedAt: metaSnapshots.updatedAt,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, state.snapshotId))
    .limit(1)
    .get()

  if (!snapshotRow) {
    throw new Error(
      `Division snapshot metadata missing from local meta cache: ${state.snapshotId}.`,
    )
  }

  const snapshotSourceRows = await metaDb
    .select({
      snapshotId: metaSnapshotSources.snapshotId,
      datasetId: metaSnapshotSources.datasetId,
      sourceReleaseId: metaSnapshotSources.sourceReleaseId,
      role: metaSnapshotSources.role,
      selectedByRule: metaSnapshotSources.selectedByRule,
      selectionMode: metaSnapshotSources.selectionMode,
      anchorReleaseId: metaSnapshotSources.anchorReleaseId,
      sourceCohortKey: metaSnapshotSources.sourceCohortKey,
      createdAt: metaSnapshotSources.createdAt,
    })
    .from(metaSnapshotSources)
    .where(eq(metaSnapshotSources.snapshotId, state.snapshotId))
    .all()

  if (!snapshotSourceRows.some(row => row.sourceReleaseId === releaseId)) {
    throw new Error(
      `Division snapshot source metadata missing for release ${releaseId} and snapshot ${state.snapshotId}.`,
    )
  }

  const snapshotAssemblyRunRows = await metaDb
    .select({
      id: metaSnapshotAssemblyRuns.id,
      snapshotId: metaSnapshotAssemblyRuns.snapshotId,
      snapshotAssemblyId: metaSnapshotAssemblyRuns.snapshotAssemblyId,
      anchorReleaseId: metaSnapshotAssemblyRuns.anchorReleaseId,
      anchorCohortKey: metaSnapshotAssemblyRuns.anchorCohortKey,
      status: metaSnapshotAssemblyRuns.status,
      selectionSummaryJson: metaSnapshotAssemblyRuns.selectionSummaryJson,
      createdAt: metaSnapshotAssemblyRuns.createdAt,
      updatedAt: metaSnapshotAssemblyRuns.updatedAt,
    })
    .from(metaSnapshotAssemblyRuns)
    .where(eq(metaSnapshotAssemblyRuns.snapshotId, state.snapshotId))
    .all()
  const serialisedSnapshotAssemblyRunRows = snapshotAssemblyRunRows.map(row => ({
    ...row,
    selectionSummaryJson: jsonText(row.selectionSummaryJson),
  }))

  const releaseShardAssignmentRows = await metaDb
    .select({
      releaseId: metaReleaseShardAssignments.releaseId,
      dataShardId: metaReleaseShardAssignments.dataShardId,
    })
    .from(metaReleaseShardAssignments)
    .where(eq(metaReleaseShardAssignments.releaseId, releaseId))
    .all()

  if (releaseShardAssignmentRows.length === 0) {
    throw new Error(
      `Division release shard assignment missing from local meta cache: ${releaseId}.`,
    )
  }

  const [processingActionRows, processingStatsRows] = await Promise.all([
    metaDb
      .select()
      .from(releaseProcessingActions)
      .where(eq(releaseProcessingActions.releaseId, releaseId))
      .all(),
    metaDb
      .select()
      .from(stats)
      .where(and(eq(stats.releaseId, releaseId), eq(stats.type, 'processing')))
      .all(),
  ])

  const rows: Record<string, SqlValue>[] = []

  for (let index = 0; index < state.statsRows.length; index += DIVISION_BATCH_SIZE) {
    const batch = state.statsRows.slice(index, index + DIVISION_BATCH_SIZE)

    for (const row of batch) {
      rows.push({
        id: crypto.randomUUID(),
        type: row.type,
        releaseId: message.releaseId ?? message.datasetId,
        dimension: row.dimension,
        metric: row.metric,
        metricUnit: row.metricUnit,
        value: row.value,
        groupBy: row.groupBy ?? null,
        groupValue: row.groupValue ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    }

    await reportProgress(Math.min(index + batch.length, state.statsRows.length))
  }

  for (const row of processingStatsRows) {
    rows.push({
      id: row.id,
      type: row.type,
      releaseId: row.releaseId,
      dimension: row.dimension,
      metric: row.metric,
      metricUnit: row.metricUnit,
      value: row.value,
      groupBy: row.groupBy ?? null,
      groupValue: row.groupValue ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }

  const actionRows = processingActionRows.map(row => ({
    id: row.id,
    releaseId: row.releaseId,
    action: row.action,
    mode: row.mode,
    summary: row.summary,
    affectedRecordCount: row.affectedRecordCount,
    evidence: jsonText(row.evidence),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))

  const statements = [
    ...buildInsertStatements(
      'snapshots',
      [
        'id',
        'resourceType',
        'code',
        'cohortKey',
        'status',
        'publishedAt',
        'validFrom',
        'validTo',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      [snapshotRow],
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  resourceType = excluded.resourceType,
  code = excluded.code,
  cohortKey = excluded.cohortKey,
  status = excluded.status,
  publishedAt = excluded.publishedAt,
  validFrom = excluded.validFrom,
  validTo = excluded.validTo,
  notes = excluded.notes,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotSources',
      [
        'snapshotId',
        'datasetId',
        'sourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      snapshotSourceRows,
      {
        suffix: `
ON CONFLICT(snapshotId, sourceReleaseId) DO UPDATE SET
  datasetId = excluded.datasetId,
  role = excluded.role,
  selectedByRule = excluded.selectedByRule,
  selectionMode = excluded.selectionMode,
  anchorReleaseId = excluded.anchorReleaseId,
  sourceCohortKey = excluded.sourceCohortKey,
  createdAt = excluded.createdAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'snapshotAssemblyRuns',
      [
        'id',
        'snapshotId',
        'snapshotAssemblyId',
        'anchorReleaseId',
        'anchorCohortKey',
        'status',
        'selectionSummaryJson',
        'createdAt',
        'updatedAt',
      ],
      serialisedSnapshotAssemblyRunRows,
      {
        suffix: `
ON CONFLICT(id) DO UPDATE SET
  snapshotId = excluded.snapshotId,
  snapshotAssemblyId = excluded.snapshotAssemblyId,
  anchorReleaseId = excluded.anchorReleaseId,
  anchorCohortKey = excluded.anchorCohortKey,
  status = excluded.status,
  selectionSummaryJson = excluded.selectionSummaryJson,
  createdAt = excluded.createdAt,
  updatedAt = excluded.updatedAt`.trim(),
      },
    ),
    ...buildInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseShardAssignmentRows,
      {
        suffix: `ON CONFLICT(releaseId, dataShardId) DO NOTHING`,
      },
    ),
    `DELETE FROM releaseProcessingActions WHERE releaseId = ${sqlLiteral(releaseId)};`,
    ...buildInsertStatements(
      'releaseProcessingActions',
      [
        'id',
        'releaseId',
        'action',
        'mode',
        'summary',
        'affectedRecordCount',
        'evidence',
        'createdAt',
        'updatedAt',
      ],
      actionRows,
    ),
    `DELETE FROM stats WHERE releaseId = ${sqlLiteral(releaseId)};`,
    ...buildInsertStatements(
      'stats',
      [
        'id',
        'type',
        'releaseId',
        'dimension',
        'metric',
        'metricUnit',
        'value',
        'groupBy',
        'groupValue',
        'createdAt',
        'updatedAt',
      ],
      rows,
      {
        verb: 'INSERT INTO',
      },
    ),
  ]

  return buildSqlImportFile(
    'meta',
    `${buildDivisionSqlRunId(message)}-meta.sql`,
    statements,
  )
}

function buildExtraHistorySqlOperations(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
) {
  const changedExistingIds = state.records
    .filter(record => record.currentChanged && record.currentExists)
    .map(record => record.id)
  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const changedIdsByOwner = groupIdsByOwnerShard(
    state.currentRows,
    changedExistingIds,
    PRIMARY_HISTORY_OWNER_KEY,
  )
  const missingIdsByOwner = groupIdsByOwnerShard(
    state.currentRows,
    missingIds,
    PRIMARY_HISTORY_OWNER_KEY,
  )
  const now = new Date().toISOString()
  const operations: ExtraSqlImportOperation[] = []

  for (const [ownerKey, target] of importTargets.historyByOwnerKey) {
    if (ownerKey === PRIMARY_HISTORY_OWNER_KEY) {
      continue
    }

    const statements = [
      ...buildCloseHistoryVersionStatements(changedIdsByOwner.get(ownerKey) ?? [], now),
      ...buildCloseHistoryVersionStatements(missingIdsByOwner.get(ownerKey) ?? [], now),
    ]

    if (statements.length === 0) {
      continue
    }

    operations.push({
      sql: `${statements.join('\n\n')}\n`,
      target,
    })
  }

  return operations
}

function buildExtraSourceSqlOperations(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
) {
  const changedIds = state.records
    .filter(record => record.sourceChanged)
    .map(record => record.id)
  const unchangedIds = state.records
    .filter(record => !record.sourceChanged && state.currentSourceRows.has(record.id))
    .map(record => record.id)
  const missingIds = [...state.currentSourceRows.keys()].filter(
    id => !state.seenIds.has(id),
  )
  const changedIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    changedIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const unchangedIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    unchangedIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const missingIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    missingIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const releaseId = buildSourceReleaseId(message)
  const now = new Date().toISOString()
  const operations: ExtraSqlImportOperation[] = []

  for (const [ownerKey, target] of importTargets.sourceByOwnerKey) {
    if (ownerKey === PRIMARY_SOURCE_OWNER_KEY) {
      continue
    }

    const statements = [
      ...buildCloseSourceVersionStatements(
        changedIdsByOwner.get(ownerKey) ?? [],
        message.sourceVersion,
        now,
      ),
      ...buildAdvanceSourceReleaseStatements(
        unchangedIdsByOwner.get(ownerKey) ?? [],
        releaseId,
        now,
      ),
      ...buildCloseSourceVersionStatements(
        missingIdsByOwner.get(ownerKey) ?? [],
        message.sourceVersion,
        now,
      ),
    ]

    if (statements.length === 0) {
      continue
    }

    operations.push({
      sql: `${statements.join('\n\n')}\n`,
      target,
    })
  }

  return operations
}

async function writeDivisionSqlArtefacts(
  bucket: LocalPipelineBucket,
  message: DatasetProcessingMessage,
  files: {
    current: DivisionSqlImportFile
    currentInit: DivisionSqlImportFile | null
    history: DivisionSqlImportFile
    meta: DivisionSqlImportFile
    source: DivisionSqlImportFile
  },
): Promise<DivisionSqlArtefactManifest> {
  const manifest: DivisionSqlArtefactManifest = {
    currentInitKey: null,
    currentKey: buildSqlPipelineArtefactKey(message, 'current', files.current.filename),
    historyKey: buildSqlPipelineArtefactKey(message, 'history', files.history.filename),
    metaKey: buildSqlPipelineArtefactKey(message, 'meta', files.meta.filename),
    sourceKey: buildSqlPipelineArtefactKey(message, 'source', files.source.filename),
  }

  await writeTextArtefact(
    bucket,
    manifest.sourceKey,
    files.source.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.historyKey,
    files.history.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.currentKey,
    files.current.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.metaKey,
    files.meta.sql,
    'application/sql; charset=utf-8',
  )

  if (files.currentInit) {
    manifest.currentInitKey = buildSqlPipelineArtefactKey(
      message,
      'current',
      files.currentInit.filename,
    )
    await writeTextArtefact(
      bucket,
      manifest.currentInitKey,
      files.currentInit.sql,
      'application/sql; charset=utf-8',
    )
  }

  return manifest
}

async function resolveDivisionImportTargets(
  metaDb: MetaDatabase,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
) {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const shardYear = resolveShardYear(message.cohortKey, message.sourceVersion)
  const [currentShard, historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(metaRepoDb, 'current', environment),
    resolveShardForTypeRegionYear(
      metaRepoDb,
      'history',
      environment,
      message.regionCode,
      shardYear,
    ),
    resolveShardForTypeRegionYear(
      metaRepoDb,
      'source',
      environment,
      message.regionCode,
      shardYear,
    ),
  ])

  return {
    current: {
      binding: dbContext.currentBinding,
      databaseId: currentShard?.databaseId ?? null,
      name: 'current',
    } satisfies SqlImportTargetContext,
    history: {
      binding: dbContext.historyBinding,
      databaseId: historyShard?.databaseId ?? null,
      name: 'history',
    } satisfies SqlImportTargetContext,
    meta: {
      binding: dbContext.metaBinding,
      databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    } satisfies SqlImportTargetContext,
    source: {
      binding: dbContext.sourceBinding,
      databaseId: sourceShard?.databaseId ?? null,
      name: 'source',
    } satisfies SqlImportTargetContext,
    historyByOwnerKey: new Map(
      dbContext.historyTargets.map(target => [
        buildHistoryOwnerKey(message.regionCode, shardYear, target.bindingName),
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'history',
        } satisfies SqlImportTargetContext,
      ]),
    ),
    sourceByOwnerKey: new Map(
      dbContext.sourceTargets.map(target => [
        buildSourceOwnerKey(message.regionCode, shardYear, target.bindingName),
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'source',
        } satisfies SqlImportTargetContext,
      ]),
    ),
  }
}

function buildDivisionImportProgressConfig(
  manifest: DivisionSqlArtefactManifest,
  extraImportFileCount = 0,
) {
  const totalImportFiles = countDivisionImportFiles(manifest) + extraImportFileCount

  return {
    cleanup: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Cleanup'),
        colorRed('staging'),
      ),
      phase: 'cleanupDivisionSqlStaging',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Cleanup'),
          colorRed('staging'),
          current,
          1,
        )
      },
      totalUnits: 1,
    },
    importPhases: [
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlSource',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlHistory',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlCurrentInit',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: manifest.currentInitKey ? 1 : 0,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlCurrent',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
      {
        completedLabel: formatCompletedPhaseLabel(
          colorTeal('Import'),
          colorRed('SQL'),
          totalImportFiles,
        ),
        phase: 'importDivisionSqlStats',
        runningLabel(current: number) {
          return formatRunningPhaseLabel(
            colorTeal('Import'),
            colorRed('SQL'),
            current,
            totalImportFiles,
          )
        },
        totalUnits: 1,
      },
    ],
    publish: {
      completedLabel: formatCompletedPhaseLabel(
        colorTeal('Publish'),
        colorRed('release'),
      ),
      phase: 'publishDataset',
      runningLabel(current: number) {
        return formatRunningPhaseLabel(
          colorTeal('Publish'),
          colorRed('release'),
          current,
          1,
        )
      },
      totalUnits: 1,
    },
  }
}

function buildStreamingPhase(
  releaseId: string,
  releaseCode: string,
  phase: string,
  totalUnits: number,
  right: string,
) {
  return {
    completionLabel: formatCompletedPhaseLabel(
      colorTeal('Generate SQL'),
      right,
      totalUnits,
    ),
    label: formatRunningPhaseLabel(colorTeal('Generate SQL'), right, 0, totalUnits),
    labelForProgress(current: number) {
      return formatRunningPhaseLabel(
        colorTeal('Generate SQL'),
        right,
        current,
        totalUnits,
      )
    },
    phase,
    releaseCode,
    releaseId,
    totalUnits,
  } as const
}

function collectOwnerShardKeys(
  ownerShardKeys: string[] | undefined,
  fallbackKey: string,
) {
  return ownerShardKeys && ownerShardKeys.length > 0 ? ownerShardKeys : [fallbackKey]
}

function groupIdsByOwnerShard<
  TRow extends {
    ownerShardKeys?: string[]
  },
>(rows: Map<string, TRow>, ids: Iterable<string>, fallbackKey: string) {
  const idsByOwnerKey = new Map<string, string[]>()

  for (const id of ids) {
    const row = rows.get(id)

    if (!row) {
      continue
    }

    for (const ownerKey of collectOwnerShardKeys(row.ownerShardKeys, fallbackKey)) {
      const ownerIds = idsByOwnerKey.get(ownerKey) ?? []
      ownerIds.push(id)
      idsByOwnerKey.set(ownerKey, ownerIds)
    }
  }

  return idsByOwnerKey
}

function buildHistoryOwnerKey(
  regionCode: string,
  shardYear: string,
  bindingName: string,
) {
  return bindingName ===
    `DB_HISTORY_${regionCode.toUpperCase()}_${resolveShardScope(shardYear)}`
    ? PRIMARY_HISTORY_OWNER_KEY
    : `history-${bindingName.slice(bindingName.lastIndexOf('_') + 1)}`
}

function buildSourceOwnerKey(
  regionCode: string,
  shardYear: string,
  bindingName: string,
) {
  return bindingName ===
    `DB_SOURCE_${regionCode.toUpperCase()}_${resolveShardScope(shardYear)}`
    ? PRIMARY_SOURCE_OWNER_KEY
    : `source-${bindingName.slice(bindingName.lastIndexOf('_') + 1)}`
}

function resolveShardScope(shardYear: string) {
  const year = Number.parseInt(shardYear, 10)

  return Number.isInteger(year) && year < 2025 ? 'BEFORE' : shardYear
}

function buildDivisionSqlRunId(message: DatasetProcessingMessage) {
  const releaseId = message.releaseId ?? message.datasetId
  const shard = message.shardYear ?? message.sourceVersion.slice(0, 4)

  return [
    'division',
    message.source,
    message.regionCode,
    shard,
    releaseId,
    message.sourceVersion,
  ]
    .join('-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
}

function buildAdvanceSourceReleaseStatements(
  sourceRecordIds: string[],
  releaseId: string,
  now: string,
) {
  return chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 3)).map(chunk =>
    `
UPDATE overtureDivisions
SET releaseId = ${sqlLiteral(releaseId)}, updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND sourceRecordId IN (${chunk.map(sqlLiteral).join(', ')});`.trim(),
  )
}

function buildCloseSourceVersionStatements(
  sourceRecordIds: string[],
  validToRelease: string,
  now: string,
) {
  return chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 4)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
UPDATE overtureDivisions
SET isCurrent = 0, validToRelease = ${sqlLiteral(validToRelease)}, updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND sourceRecordId IN (${values});`.trim(),
    ]
  })
}

function buildCloseHistoryVersionStatements(divisionIds: string[], now: string) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 6)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
UPDATE divisions
SET isCurrent = 0,
  updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND id IN (${values});`.trim(),
      `
UPDATE divisionsI18n
SET isCurrent = 0,
  updatedAt = ${sqlLiteral(now)}
WHERE isCurrent = 1
  AND divisionId IN (${values});`.trim(),
    ]
  })
}

function buildDeleteCurrentI18nStatements(snapshotId: string, divisionIds: string[]) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 1)).map(chunk =>
    `
DELETE FROM divisionsI18n
WHERE snapshotId = ${sqlLiteral(snapshotId)}
  AND divisionId IN (${chunk.map(sqlLiteral).join(', ')});`.trim(),
  )
}

function buildDeleteCurrentDivisionStatements(
  snapshotId: string,
  divisionIds: string[],
) {
  return chunkArray(divisionIds, getMaxItemsPerInClause(1, 2)).flatMap(chunk => {
    if (chunk.length === 0) {
      return []
    }

    const values = chunk.map(sqlLiteral).join(', ')

    return [
      `
DELETE FROM divisionsI18n
WHERE snapshotId = ${sqlLiteral(snapshotId)}
  AND divisionId IN (${values});`.trim(),
      `
DELETE FROM divisions
WHERE snapshotId = ${sqlLiteral(snapshotId)}
  AND id IN (${values});`.trim(),
    ]
  })
}

function buildInsertStatements(
  tableName: string,
  columns: readonly string[],
  rows: Record<string, SqlValue>[],
  options: {
    maxStatementBytes?: number
    suffix?: string
    verb?: string
  } = {},
) {
  if (rows.length === 0) {
    return []
  }

  const statements: string[] = []
  const maxStatementBytes = options.maxStatementBytes ?? SQL_STATEMENT_BYTE_TARGET
  const suffix = options.suffix ? ` ${options.suffix.trim()}` : ''
  const verb = options.verb ?? 'INSERT INTO'
  let currentValues: string[] = []
  const prefix = `${verb} ${tableName} (${columns.join(', ')}) VALUES `

  for (const row of rows) {
    const valueSql = `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`
    const candidate = `${prefix}${[...currentValues, valueSql].join(', ')}${suffix};`

    if (
      currentValues.length > 0 &&
      new TextEncoder().encode(candidate).byteLength > maxStatementBytes
    ) {
      statements.push(`${prefix}${currentValues.join(', ')}${suffix};`)
      currentValues = [valueSql]
      continue
    }

    currentValues.push(valueSql)
  }

  if (currentValues.length > 0) {
    statements.push(`${prefix}${currentValues.join(', ')}${suffix};`)
  }

  return statements
}

async function processDivisionRecordBatches(
  records: DivisionPreparedRecord[],
  reportProgress: (current: number) => Promise<void>,
  worker: (batch: DivisionPreparedRecord[]) => void | Promise<void>,
) {
  for (let index = 0; index < records.length; index += DIVISION_BATCH_SIZE) {
    const batch = records.slice(index, index + DIVISION_BATCH_SIZE)

    await worker(batch)
    await reportProgress(Math.min(index + batch.length, records.length))
  }
}

function buildSqlImportFile(
  target: DivisionSqlImportFile['target'],
  filename: string,
  statements: string[],
) {
  const sql = `${statements.filter(Boolean).join('\n\n')}\n`

  return {
    bytes: new TextEncoder().encode(sql).byteLength,
    filename,
    sql,
    statementCount: statements.reduce(
      (count, statement) => count + statement.split(';').filter(Boolean).length,
      0,
    ),
    target,
  } satisfies DivisionSqlImportFile
}

function countDivisionImportFiles(manifest: DivisionSqlArtefactManifest) {
  return manifest.currentInitKey ? 5 : 4
}

function requireString(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`Missing ${label} for local SQL processing.`)
  }

  return value
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const cohortYear = cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  const sourceYear = sourceVersion.slice(0, 4)

  if (/^\d{4}$/.test(sourceYear)) {
    return sourceYear
  }

  throw new Error(
    `Could not resolve shard year from cohortKey=${cohortKey} and sourceVersion=${sourceVersion}.`,
  )
}

function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function resolveImportEnvironment(target: UploadTarget): 'preview' | 'production' {
  return target.remote && target.environment === 'production' ? 'production' : 'preview'
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

  if (fromEnv) {
    return fromEnv
  }

  const rawConfig = readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')
  const config = JSON.parse(rawConfig) as {
    vars?: Record<string, unknown>
    env?: {
      preview?: {
        vars?: Record<string, unknown>
      }
      production?: {
        vars?: Record<string, unknown>
      }
    }
  }
  const targetName = resolveTargetName(target)
  const vars =
    targetName === 'production'
      ? config.env?.production?.vars
      : targetName === 'preview'
        ? config.env?.preview?.vars
        : config.vars
  const accountId = vars?.CLOUDFLARE_ACCOUNT_ID

  if (typeof accountId === 'string' && accountId.trim()) {
    return accountId.trim()
  }

  return undefined
}

function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}

function assertRemoteDivisionImportPrerequisites(
  target: UploadTarget,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
  options: SqlImportExecutionOptions,
) {
  if (!target.remote) {
    return
  }

  const missing: string[] = []

  if (!options.accountId?.trim()) {
    missing.push('CLOUDFLARE_ACCOUNT_ID')
  }

  if (!options.apiToken?.trim()) {
    missing.push('CLOUDFLARE_D1_TOKEN')
  }

  const targets = [
    importTargets.current,
    importTargets.history,
    importTargets.meta,
    importTargets.source,
  ]

  for (const targetContext of targets) {
    if (!targetContext.databaseId?.trim()) {
      missing.push(`${targetContext.name}.databaseId`)
    }
  }

  if (missing.length === 0) {
    return
  }

  throw new Error(
    [
      `Remote SQL import prerequisites are incomplete for ${resolveTargetName(target)}.`,
      `Missing: ${missing.join(', ')}.`,
      'Define CLOUDFLARE_D1_TOKEN in your shell or repo .env before running preview/production SQL uploads.',
    ].join(' '),
  )
}

function sqlLiteral(value: SqlValue) {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

function jsonText(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

function resolveParentDivisionIdFromHierarchy(hierarchy: unknown): string | null {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return null
  }

  const parent = hierarchy[hierarchy.length - 1]
  if (!parent || typeof parent !== 'object') {
    return null
  }

  const divisionId = (parent as Record<string, unknown>).division_id
  return typeof divisionId === 'string' && divisionId.trim().length > 0
    ? divisionId
    : null
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function sourceString(value: unknown) {
  return typeof value === 'string' ? value : null
}

type SqlValue = boolean | number | string | null | undefined
