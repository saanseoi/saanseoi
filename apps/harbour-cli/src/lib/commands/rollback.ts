import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { and, desc, eq, metaSchema, ne } from '@repo/db'
import {
  buildDraftReleasePurgeSql,
  buildLatestReleaseRollbackSql,
  describeLatestReleaseRollbackPlan,
} from '@repo/core/pipeline/rollback'
import {
  resolveActiveReleaseSetForType,
  resolveDatasetRecord,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { datasetVariantForSource, type ResourceType } from '@repo/core'
import { confirm, isCancel, note, outro } from '@clack/prompts'
import { splitSqlStatements } from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
} from '../localPipeline/sqlImport.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import { withRemoteCacheMutation } from '../dbCache/remoteCacheMutation.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import {
  invalidateRemoteDbCache,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import type {
  ReleaseRecord,
  ResolvedReleaseRecord,
  RollbackArtefact,
  RollbackOperation,
} from './rollbackTypes.ts'
import {
  assertRemoteRollbackImportPrerequisites,
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
  resolveCurrentTarget,
  resolveHistoryTarget,
  resolveMetaTarget,
  resolveRemoteTargetName,
  resolveRollbackShardHints,
  resolveSourceTarget,
  resolveTargetName,
} from './rollbackTargets.ts'
import {
  formatRollbackPlan,
  formatRollbackResult,
  formatRollbackStepLabel,
  updateDbCacheProgress,
} from './rollbackDisplay.ts'
import {
  countRollbackPlanRows,
  verifyPurgeResult,
  verifyRollbackResult,
} from './rollbackVerification.ts'

export const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

const ROLLBACK_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/rollbacks')

export async function runRollbackReleaseCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    printUsage: () => void
    skipConfirm: boolean
  },
) {
  const releaseSpecifier = getStringOption(args, ['release']) ?? args.positionals[0]
  const operation: RollbackOperation = args.options.purge ? 'purge' : 'rollback'

  if (!releaseSpecifier) {
    options.printUsage()
    throw new Error('Missing release identifier. Pass `--release <release-id|code>`.')
  }

  const shardHints = resolveRollbackShardHints(args, releaseSpecifier)
  const progress = new OperationProgress()
  const targetName = resolveTargetName(target)
  const dbCacheStartedAt = Date.now()
  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>

  progress.beginPhase(
    formatRunningPhaseLabel(colorTeal('Rollback'), colorRed('resolve target'), 0, 1),
    {
      current: 0,
      max: 1,
    },
  )

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      shardHints.regionCode,
      shardHints.shardYear,
      {
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
        requireExistingRemoteCache: target.remote,
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }

  if (target.remote && progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Clone cache'), colorRed(targetName)),
        [formatDurationMs(Date.now() - dbCacheStartedAt)],
      ),
    )
  } else if (progress.hasActivePhase()) {
    progress.update(1, {
      label: formatRunningPhaseLabel(
        colorTeal('Rollback'),
        colorRed('resolve target'),
        1,
        1,
      ),
    })
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Rollback'), colorRed('target'), 1),
        [formatDurationMs(Date.now() - dbCacheStartedAt)],
      ),
    )
  }

  try {
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb
    const release = await resolveDatasetRecord(metaDb, {
      releaseCode: releaseSpecifier,
      releaseId: releaseSpecifier,
    })

    if (!release) {
      throw new Error(`Release not found: ${releaseSpecifier}`)
    }

    const resourceType = release.type as ResourceType
    const releaseSource = datasetVariantForSource(resourceType, release.source, {
      cohortKey: release.cohortKey ?? undefined,
      datasetCode: release.datasetCode,
    })
    const snapshot = await resolveSnapshotForRelease(
      metaDb,
      release.releaseId,
      resourceType,
    )

    if (!snapshot) {
      throw new Error(`Snapshot not found for release ${release.releaseCode}.`)
    }

    const releaseSet =
      (await resolveReleaseSetForRelease(metaDb, release.releaseId, resourceType)) ??
      (operation === 'purge'
        ? await resolveDraftReleaseSetForSnapshot(metaDb, snapshot.id)
        : null)
    const activeReleaseSet = await resolveActiveReleaseSetForType(metaDb, resourceType)

    if (
      operation === 'rollback' &&
      (!releaseSet || !activeReleaseSet || releaseSet.id !== activeReleaseSet.id)
    ) {
      throw new Error(
        `Rollback only supports the active latest ${resourceType} release. ${release.releaseCode} is not active.`,
      )
    }

    if (!releaseSet) {
      throw new Error(`API release set not found for ${release.releaseCode}.`)
    }

    await assertReleaseOperationPreconditions(metaDb, {
      activeReleaseSet,
      operation,
      release,
      releaseSet,
    })

    const previousReleaseId =
      operation === 'rollback'
        ? await resolvePreviousPublishedReleaseId(dbContext.metaDb, release.releaseId)
        : null
    const previousRelease = previousReleaseId
      ? await resolveDatasetRecord(metaDb, { releaseId: previousReleaseId })
      : null
    const previousReleaseSet = previousReleaseId
      ? await resolveReleaseSetForRelease(metaDb, previousReleaseId, resourceType)
      : null

    if (operation === 'rollback') {
      await assertRollbackPreconditions(release, previousRelease, previousReleaseSet)
    }
    const rollbackPlan = describeLatestReleaseRollbackPlan({
      source: releaseSource,
      type: resourceType,
    })
    const planCounts = await countRollbackPlanRows(dbContext, {
      apiReleaseSetId: releaseSet.id,
      previousApiReleaseSetId: previousReleaseSet?.id ?? null,
      previousReleaseId,
      release,
      snapshotId: snapshot.id,
      tables: rollbackPlan,
      operation,
    })
    const totalRows = Object.values(planCounts).reduce(
      (sum, counts) => sum + counts.rows,
      0,
    )

    note(
      formatRollbackPlan({
        counts: planCounts,
        operation,
        release,
        rowCount: totalRows,
        target,
      }).join('\n'),
      'ROLLBACK PLAN',
    )

    const rollbackInput = {
      apiReleaseSetId: releaseSet.id,
      previousApiReleaseSetId: previousReleaseSet?.id ?? null,
      previousReleaseId,
      releaseId: release.releaseId,
      snapshotId: snapshot.id,
      source: releaseSource,
      sourceVersion: release.sourceVersion,
      type: resourceType,
    }
    const rollbackSql =
      operation === 'purge'
        ? buildDraftReleasePurgeSql(rollbackInput)
        : buildLatestReleaseRollbackSql(rollbackInput)
    const rollbackRoot = resolve(
      ROLLBACK_ROOT,
      resolveTargetName(target),
      release.releaseCode,
    )
    const artefacts = [
      {
        name: 'source',
        sql: rollbackSql.source,
        target: resolveSourceTarget(dbContext),
      },
      {
        name: 'history',
        sql: rollbackSql.history,
        target: resolveHistoryTarget(dbContext),
      },
      {
        name: 'current',
        sql: rollbackSql.current,
        target: resolveCurrentTarget(dbContext),
      },
      { name: 'meta', sql: rollbackSql.meta, target: resolveMetaTarget(dbContext) },
    ] as const

    const artefactStats = artefacts.map(artefact => ({
      ...artefact,
      statementCount: splitSqlStatements(artefact.sql).length,
    }))

    await mkdir(rollbackRoot, { recursive: true })

    for (const artefact of artefactStats) {
      await writeFile(resolve(rollbackRoot, `${artefact.name}.sql`), artefact.sql)
    }

    const importOptions: SqlImportExecutionOptions = {
      accountId: resolveCloudflareAccountId(target),
      apiToken: resolveCloudflareD1ApiToken(),
      isLocal: !target.remote,
    }

    assertRemoteRollbackImportPrerequisites(target, artefactStats, importOptions)
    note('✓ Prerequisites', 'ROLLBACK CHECKS')

    if (!options.dryRun && !options.skipConfirm) {
      const shouldContinue = await confirm({
        message: `${operation === 'purge' ? 'Purge' : 'Rollback'} ${release.releaseCode} on ${resolveTargetName(target)}?`,
        initialValue: false,
      })

      if (isCancel(shouldContinue) || !shouldContinue) {
        throw new Error('Rollback cancelled.')
      }
    }

    if (!options.dryRun) {
      const execute = async () => {
        try {
          for (const artefact of artefactStats) {
            const counts = planCounts[artefact.name]
            const startedAt = Date.now()
            const label = formatRollbackStepLabel(
              artefact.name,
              counts,
              0,
              artefact.statementCount,
            )

            progress.beginPhase(label, {
              current: 0,
              max: Math.max(artefact.statementCount, 1),
            })
            const executedStatements = await executeSqlText(
              artefact.target,
              artefact.sql,
              importOptions,
            )

            progress.update(Math.max(executedStatements, artefact.statementCount), {
              label: formatRollbackStepLabel(
                artefact.name,
                counts,
                Math.max(executedStatements, artefact.statementCount),
                artefact.statementCount,
              ),
            })
            progress.complete(
              appendPhaseDetails(
                formatCompletedPhaseLabel(
                  colorTeal('Rollback'),
                  colorRed(artefact.name),
                  counts.rows,
                ),
                [formatDurationMs(Date.now() - startedAt)],
              ),
            )
          }
        } catch (error) {
          progress.fail()
          throw error
        }

        if (target.remote) {
          await replayRollbackSqlIntoRemoteCache(
            target,
            dbContext,
            artefactStats,
            progress,
            release.releaseCode,
          )
        }

        if (operation === 'purge') {
          await verifyPurgeResult(dbContext, {
            apiReleaseSetId: releaseSet.id,
            releaseId: release.releaseId,
            snapshotId: snapshot.id,
            tables: rollbackPlan,
          })
        } else {
          await verifyRollbackResult(metaDb, {
            previousReleaseId: previousRelease?.releaseId ?? null,
            previousReleaseSetId: previousReleaseSet?.id ?? null,
            releaseId: release.releaseId,
            resourceType,
          })
        }
      }
      if (target.remote) {
        await withRemoteCacheMutation(
          dbContext.state.dbCacheDir,
          `Rollback ${release.releaseCode} has not completed remote execution and local replay; rebuild the cache before continuing.`,
          execute,
        )
      } else {
        await execute()
      }
    }

    note(
      formatRollbackResult({
        dryRun: options.dryRun,
        operation,
        previousRelease,
        previousReleaseSet,
        release,
        rollbackRoot,
      }).join('\n'),
      'ROLLBACK RESULT',
    )
    outro('Harbour rollback complete')
  } finally {
    dbContext.cleanup()
  }
}

async function resolvePreviousPublishedReleaseId(
  metaDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  releaseId: string,
) {
  const journalRow =
    (await metaDb
      .select({
        releaseId: metaSchema.metaPublishedDataJournal.releaseId,
      })
      .from(metaSchema.metaPublishedDataJournal)
      .where(
        and(
          eq(metaSchema.metaPublishedDataJournal.relatedReleaseId, releaseId),
          ne(metaSchema.metaPublishedDataJournal.action, 'published'),
        ),
      )
      .orderBy(desc(metaSchema.metaPublishedDataJournal.createdAt))
      .limit(1)
      .get()) ?? null

  if (journalRow?.releaseId) {
    return journalRow.releaseId
  }

  const releaseRow =
    (await metaDb
      .select({
        releaseId: metaSchema.metaReleases.id,
      })
      .from(metaSchema.metaReleases)
      .where(eq(metaSchema.metaReleases.supersededByReleaseId, releaseId))
      .limit(1)
      .get()) ?? null

  return releaseRow?.releaseId ?? null
}

async function assertRollbackPreconditions(
  release: ResolvedReleaseRecord,
  previousRelease: ReleaseRecord,
  previousReleaseSet: Awaited<ReturnType<typeof resolveReleaseSetForRelease>>,
) {
  if (release.status !== 'published') {
    throw new Error(
      `Rollback only supports published latest releases. ${release.releaseCode} is ${release.status}.`,
    )
  }

  if (previousRelease && previousRelease.datasetId !== release.datasetId) {
    throw new Error(
      `Previous release ${previousRelease.releaseCode} belongs to a different dataset.`,
    )
  }

  if (previousRelease && !previousReleaseSet) {
    throw new Error(
      `Previous API release set not found for ${previousRelease.releaseCode}.`,
    )
  }
}

async function resolveDraftReleaseSetForSnapshot(
  metaDb: HarbourReadableDb,
  snapshotId: string,
) {
  const releaseSets = await metaDb
    .select({
      cohortKey: metaSchema.metaApiReleaseSets.cohortKey,
      code: metaSchema.metaApiReleaseSets.code,
      domainCode: metaSchema.metaApiReleaseSets.domainCode,
      id: metaSchema.metaApiReleaseSets.id,
      rulesetVersion: metaSchema.metaApiReleaseSets.rulesetVersion,
      schemaVersion: metaSchema.metaApiReleaseSets.schemaVersion,
      status: metaSchema.metaApiReleaseSets.status,
    })
    .from(metaSchema.metaApiReleaseSetSnapshots)
    .innerJoin(
      metaSchema.metaApiReleaseSets,
      eq(
        metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
        metaSchema.metaApiReleaseSets.id,
      ),
    )
    .where(eq(metaSchema.metaApiReleaseSetSnapshots.snapshotId, snapshotId))
    .limit(2)
    .all()

  if (releaseSets.length > 1) {
    throw new Error(
      `Purge is ambiguous: snapshot ${snapshotId} belongs to multiple API release sets.`,
    )
  }

  return releaseSets[0] ?? null
}

async function assertReleaseOperationPreconditions(
  metaDb: HarbourReadableDb,
  input: {
    activeReleaseSet: Awaited<ReturnType<typeof resolveActiveReleaseSetForType>>
    operation: RollbackOperation
    release: ResolvedReleaseRecord
    releaseSet: NonNullable<Awaited<ReturnType<typeof resolveReleaseSetForRelease>>>
  },
) {
  if (input.operation !== 'purge') {
    return
  }

  if (input.releaseSet.status !== 'draft') {
    throw new Error(
      `Purge only supports draft API release sets. ${input.release.releaseCode} belongs to ${input.releaseSet.status}.`,
    )
  }

  if (input.activeReleaseSet?.id === input.releaseSet.id) {
    throw new Error(
      `Purge only supports a non-current draft API release set. ${input.release.releaseCode} is active.`,
    )
  }

  const releaseSetSnapshots = await metaDb
    .select({ snapshotId: metaSchema.metaApiReleaseSetSnapshots.snapshotId })
    .from(metaSchema.metaApiReleaseSetSnapshots)
    .where(
      eq(metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId, input.releaseSet.id),
    )
    .all()

  if (new Set(releaseSetSnapshots.map(row => row.snapshotId)).size > 1) {
    throw new Error(
      `Purge only supports single-snapshot API release sets. ${input.release.releaseCode} belongs to a release set with multiple snapshots.`,
    )
  }
}

async function replayRollbackSqlIntoRemoteCache(
  target: UploadTarget,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  artefacts: ReadonlyArray<RollbackArtefact>,
  progress: OperationProgress,
  releaseCode: string,
) {
  const targetName = resolveRemoteTargetName(target)
  const cacheImportOptions: SqlImportExecutionOptions = {
    accountId: undefined,
    apiToken: undefined,
    isLocal: true,
  }

  try {
    for (const artefact of artefacts) {
      const startedAt = Date.now()
      const label = formatRunningPhaseLabel(
        colorTeal('Update cache'),
        colorRed(artefact.name),
        0,
        Math.max(artefact.statementCount, 1),
      )

      progress.beginPhase(label, {
        current: 0,
        max: Math.max(artefact.statementCount, 1),
      })
      const executedStatements = await executeSqlText(
        artefact.target,
        artefact.sql,
        cacheImportOptions,
      )

      progress.update(Math.max(executedStatements, artefact.statementCount), {
        label: formatRunningPhaseLabel(
          colorTeal('Update cache'),
          colorRed(artefact.name),
          Math.max(executedStatements, artefact.statementCount),
          Math.max(artefact.statementCount, 1),
        ),
      })
      progress.complete(
        appendPhaseDetails(
          formatCompletedPhaseLabel(
            colorTeal('Update cache'),
            colorRed(artefact.name),
            executedStatements,
          ),
          [formatDurationMs(Date.now() - startedAt)],
        ),
      )
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    progress.fail()
    await invalidateRemoteDbCache(
      targetName,
      dbContext.state.dbCacheDir,
      `rollback ${releaseCode} cache replay failed: ${reason}`,
    )
    throw new Error(
      `Remote rollback succeeded, but updating the ${targetName} local cache failed. The cache was invalidated and future rollbacks will stop until it is rebuilt explicitly. ${reason}`,
    )
  }
}
