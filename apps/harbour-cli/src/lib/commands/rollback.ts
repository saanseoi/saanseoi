import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq, metaSchema } from '@repo/db'
import {
  buildDraftReleasePurgeSql,
  describeDraftReleasePurgePlan,
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
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
} from '../pipeline/local/sqlImport.ts'
import { OperationProgress } from '../cli/operationProgress.ts'
import { withRemoteCacheMutation } from '../dbCache/remoteCacheMutation.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../pipeline/local/progressFormatting.ts'
import {
  invalidateRemoteDbCache,
  resolveLocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import type {
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
  resolveTargetName,
} from './rollbackTargets.ts'
import {
  formatRollbackPlan,
  formatRollbackResult,
  formatRollbackStepLabel,
  updateDbCacheProgress,
} from './rollbackDisplay.ts'
import { countRollbackPlanRows, verifyPurgeResult } from './rollbackVerification.ts'
import { assertDraftPurgePublicationAvailable } from './rollbackPublication.ts'
import { runReconstructRollbackCommand } from './reconstructRollback.ts'

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
  if (!args.options.purge) return runReconstructRollbackCommand(args, target, options)
  const releaseSpecifier = getStringOption(args, ['release']) ?? args.positionals[0]
  const operation: RollbackOperation = 'purge'

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
        includeAllSourceShardYears: true,
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

    const resourceType = release.resourceType as ResourceType
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
      (await resolveDraftReleaseSetForSnapshot(metaDb, snapshot.id))
    const activeReleaseSet = await resolveActiveReleaseSetForType(metaDb, resourceType)

    if (!releaseSet) {
      throw new Error(`API release set not found for ${release.releaseCode}.`)
    }

    await assertReleaseOperationPreconditions(metaDb, {
      activeReleaseSet,
      operation,
      release,
      releaseSet,
    })

    const purgedSnapshot = await metaDb
      .select({ parentSnapshotId: metaSchema.metaSnapshots.parentSnapshotId })
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.id, snapshot.id))
      .get()
    await assertDraftPurgePublicationAvailable(
      dbContext.currentDb as unknown as HarbourReadableDb,
      {
        resourceType,
        snapshotId: snapshot.id,
        previousSnapshotId: purgedSnapshot?.parentSnapshotId ?? null,
      },
    )
    const rollbackPlan = describeDraftReleasePurgePlan({
      source: releaseSource,
      resourceType: resourceType,
    })
    const planCounts = await countRollbackPlanRows(dbContext, {
      apiReleaseSetId: releaseSet.id,
      previousApiReleaseSetId: null,
      previousReleaseId: null,
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
      previousApiReleaseSetId: null,
      previousReleaseId: null,
      releaseId: release.releaseId,
      snapshotId: snapshot.id,
      source: releaseSource,
      sourceVersion: release.sourceVersion,
      resourceType,
    }
    const rollbackSql = buildDraftReleasePurgeSql(rollbackInput)
    const rollbackRoot = resolve(
      ROLLBACK_ROOT,
      resolveTargetName(target),
      release.releaseCode,
    )
    const sourceArtefacts: RollbackArtefact[] = dbContext.sourceTargets.map(
      sourceTarget => ({
        name: 'source',
        sql: rollbackSql.source,
        target: {
          binding: sourceTarget.binding,
          databaseId: sourceTarget.databaseId,
          name: 'source',
        },
      }),
    )
    const artefacts: RollbackArtefact[] = [
      ...sourceArtefacts,
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
    ]

    const artefactStats = artefacts.map(artefact => ({
      ...artefact,
      statementCount: splitSqlStatements(artefact.sql).length,
    }))

    await mkdir(rollbackRoot, { recursive: true })

    for (const [index, artefact] of artefactStats.entries()) {
      const suffix = artefact.name === 'source' ? `-${index}` : ''
      await writeFile(
        resolve(rollbackRoot, `${artefact.name}${suffix}.sql`),
        artefact.sql,
      )
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
        message: `Purge ${release.releaseCode} on ${resolveTargetName(target)}?`,
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

        await verifyPurgeResult(dbContext, {
          apiReleaseSetId: releaseSet.id,
          releaseId: release.releaseId,
          resourceType,
          sourceVersion: release.sourceVersion,
          snapshotId: snapshot.id,
          tables: rollbackPlan,
        })
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
        previousRelease: null,
        previousReleaseSet: null,
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
