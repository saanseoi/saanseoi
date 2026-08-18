import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  and,
  currentSchema,
  desc,
  eq,
  historySchema,
  metaSchema,
  ne,
  sourceSchema,
  sql,
} from '@repo/db'
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

import { describeTarget, formatField } from '../cli/display.ts'
import { resolveHarbourBaseUrl } from '../api/api.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatCount,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'
import {
  invalidateRemoteDbCache,
  resolveLocalAddressDbContext,
  type LocalDbCacheProgressEvent,
} from '../dbCache/localDbCache.ts'

type ReleaseRecord = Awaited<ReturnType<typeof resolveDatasetRecord>>
type ResolvedReleaseRecord = NonNullable<ReleaseRecord>
type RollbackPlanCounts = {
  current: RollbackStepCounts
  history: RollbackStepCounts
  meta: RollbackStepCounts
  source: RollbackStepCounts
}
type RollbackStepCounts = {
  rows: number
  tables: number
}
type RollbackArtefact = {
  name: keyof RollbackPlanCounts
  sql: string
  statementCount: number
  target: SqlImportTargetContext
}
type RollbackOperation = 'purge' | 'rollback'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const ROLLBACK_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/rollbacks')
const HARBOUR_API_WRANGLER_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')

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
  const progress = new LocalUploadProgress()
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
  progress: LocalUploadProgress,
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

async function countRollbackPlanRows(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    apiReleaseSetId: string
    previousApiReleaseSetId: string | null
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
    operation: RollbackOperation
  },
): Promise<RollbackPlanCounts> {
  const [sourceRows, historyRows, currentRows, metaRows] = await Promise.all([
    countSourceRollbackRows(dbContext.sourceDb, input),
    countHistoryRollbackRows(dbContext.historyDb, input),
    countCurrentRollbackRows(dbContext.currentDb, input),
    countMetaRollbackRows(dbContext.metaDb, input),
  ])

  return {
    current: {
      rows: currentRows,
      tables: input.tables.currentTables.length,
    },
    history: {
      rows: historyRows,
      tables: input.tables.historyTables.length,
    },
    meta: {
      rows: metaRows,
      tables: 1,
    },
    source: {
      rows: sourceRows,
      tables: input.tables.sourceTables.length,
    },
  }
}

async function countCurrentRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  input: {
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)

    total += await countRows(db, table, eq(table.snapshotId, input.snapshotId))
  }

  return total
}

async function countHistoryRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    release: ResolvedReleaseRecord
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  total += await countRows(
    db,
    historySchema.snapshotVersionChanges,
    eq(historySchema.snapshotVersionChanges.snapshotId, input.snapshotId),
  )

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    const cacheRows = await countRows(
      db,
      table,
      and(
        eq(table.sourceReleaseId, input.release.releaseId),
        eq(table.snapshotId, input.snapshotId),
      ),
    )
    total += cacheRows
  }

  return total
}

async function countSourceRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  input: {
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
    operation: RollbackOperation
  },
) {
  let total = 0

  for (const tableName of input.tables.sourceTables) {
    const table = resolveSourceTable(tableName)
    if (input.operation === 'purge') {
      total += await countRows(db, table, eq(table.releaseId, input.release.releaseId))
      continue
    }
    const deletedRows = await countRows(
      db,
      table,
      and(
        eq(table.releaseId, input.release.releaseId),
        eq(table.validFromRelease, input.release.sourceVersion),
      ),
    )
    const reopenedRows = await countRows(
      db,
      table,
      and(
        eq(table.isCurrent, false),
        eq(table.validToRelease, input.release.sourceVersion),
      ),
    )
    const reassignedRows = input.previousReleaseId
      ? await countRows(
          db,
          table,
          and(
            eq(table.releaseId, input.release.releaseId),
            ne(table.validFromRelease, input.release.sourceVersion),
          ),
        )
      : 0

    total += deletedRows + reopenedRows + reassignedRows
  }

  return total
}

async function countMetaRollbackRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  input: {
    apiReleaseSetId: string
    previousApiReleaseSetId: string | null
    previousReleaseId: string | null
    release: ResolvedReleaseRecord
    snapshotId: string
    operation: RollbackOperation
  },
) {
  const [
    provenanceRows,
    releaseSetSnapshotRows,
    journalRows,
    statsRows,
    ingestRunRows,
    processingActionRows,
    shardAssignmentRows,
    assemblyRunRows,
    snapshotSourceRows,
    releaseSetRows,
    snapshotRows,
    releaseRows,
    previousReleaseRows,
    previousReleaseSetRows,
  ] = await Promise.all([
    countRows(
      db,
      metaSchema.metaApiFieldProvenance,
      eq(metaSchema.metaApiFieldProvenance.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaApiReleaseSetSnapshots,
      eq(metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaPublishedDataJournal,
      sql`${metaSchema.metaPublishedDataJournal.releaseId} = ${input.release.releaseId} OR ${metaSchema.metaPublishedDataJournal.relatedReleaseId} = ${input.release.releaseId}`,
    ),
    countRows(
      db,
      metaSchema.stats,
      input.operation === 'purge'
        ? sql`${metaSchema.stats.releaseId} = ${input.release.releaseId} OR ${metaSchema.stats.snapshotId} = ${input.snapshotId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`
        : eq(metaSchema.stats.releaseId, input.release.releaseId),
    ),
    countRows(
      db,
      metaSchema.ingestRuns,
      eq(metaSchema.ingestRuns.releaseId, input.release.releaseId),
    ),
    input.operation === 'purge'
      ? countRows(
          db,
          metaSchema.releaseProcessingActions,
          eq(metaSchema.releaseProcessingActions.releaseId, input.release.releaseId),
        )
      : Promise.resolve(0),
    countRows(
      db,
      metaSchema.metaReleaseShardAssignments,
      eq(metaSchema.metaReleaseShardAssignments.releaseId, input.release.releaseId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotAssemblyRuns,
      eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshotSources,
      sql`${metaSchema.metaSnapshotSources.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotSources.sourceReleaseId} = ${input.release.releaseId}`,
    ),
    countRows(
      db,
      metaSchema.metaApiReleaseSets,
      eq(metaSchema.metaApiReleaseSets.id, input.apiReleaseSetId),
    ),
    countRows(
      db,
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, input.snapshotId),
    ),
    countRows(
      db,
      metaSchema.metaReleases,
      eq(metaSchema.metaReleases.id, input.release.releaseId),
    ),
    input.previousReleaseId
      ? countRows(
          db,
          metaSchema.metaReleases,
          eq(metaSchema.metaReleases.id, input.previousReleaseId),
        )
      : Promise.resolve(0),
    input.previousApiReleaseSetId
      ? countRows(
          db,
          metaSchema.metaApiReleaseSets,
          eq(metaSchema.metaApiReleaseSets.id, input.previousApiReleaseSetId),
        )
      : Promise.resolve(0),
  ])

  return (
    provenanceRows +
    releaseSetSnapshotRows +
    journalRows +
    statsRows +
    ingestRunRows +
    processingActionRows +
    shardAssignmentRows +
    assemblyRunRows +
    snapshotSourceRows +
    releaseSetRows +
    snapshotRows +
    releaseRows +
    previousReleaseRows +
    previousReleaseSetRows
  )
}

async function countRows(
  db: { select: (selection: Record<string, unknown>) => unknown },
  table: unknown,
  where: unknown,
) {
  const row = (await (db as any)
    .select({ count: sql<number>`count(*)` })
    .from(table as any)
    .where(where as any)
    .get()) as { count: number | bigint | string } | undefined

  return Number(row?.count ?? 0)
}

function resolveCurrentTable(tableName: string) {
  switch (tableName) {
    case 'address2d':
      return currentSchema.address2d
    case 'address2dI18n':
      return currentSchema.address2dI18n
    case 'address3d':
      return currentSchema.address3d
    case 'address3dI18n':
      return currentSchema.address3dI18n
    case 'divisions':
      return currentSchema.divisions
    case 'divisionsI18n':
      return currentSchema.divisionsI18n
    default:
      throw new Error(`Unsupported rollback current table: ${tableName}`)
  }
}

function resolveHistoryTable(tableName: string) {
  switch (tableName) {
    case 'address2d':
      return historySchema.address2d
    case 'address2dI18n':
      return historySchema.address2dI18n
    case 'address3d':
      return historySchema.address3d
    case 'address3dI18n':
      return historySchema.address3dI18n
    case 'divisions':
      return historySchema.divisions
    case 'divisionsI18n':
      return historySchema.divisionsI18n
    default:
      throw new Error(`Unsupported rollback history table: ${tableName}`)
  }
}

function resolveSourceTable(tableName: string) {
  switch (tableName) {
    case 'hkgovAlsAddresses2d':
      return sourceSchema.sourceHkgovAlsAddresses2d
    case 'overtureDivisions':
      return sourceSchema.sourceOvertureDivisions
    case 'hkgovPlandPlanningCells':
      return sourceSchema.sourceHkgovPlandPlanningCells
    case 'hkgovPlandNewTowns':
      return sourceSchema.sourceHkgovPlandNewTowns
    default:
      throw new Error(`Unsupported rollback source table: ${tableName}`)
  }
}

async function verifyPurgeResult(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  input: {
    apiReleaseSetId: string
    releaseId: string
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  const [
    releaseRows,
    snapshotRows,
    releaseSetRows,
    sourceRows,
    historyRows,
    currentRows,
    statsRows,
    journalRows,
    provenanceRows,
    snapshotSourceRows,
    ingestRunRows,
    processingActionRows,
  ] = await Promise.all([
    countRows(
      dbContext.metaDb,
      metaSchema.metaReleases,
      eq(metaSchema.metaReleases.id, input.releaseId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaSnapshots,
      eq(metaSchema.metaSnapshots.id, input.snapshotId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaApiReleaseSets,
      eq(metaSchema.metaApiReleaseSets.id, input.apiReleaseSetId),
    ),
    countPurgeSourceRows(dbContext.sourceDb, input),
    countPurgeHistoryRows(dbContext.historyDb, input),
    countPurgeCurrentRows(dbContext.currentDb, input),
    countRows(
      dbContext.metaDb,
      metaSchema.stats,
      sql`${metaSchema.stats.releaseId} = ${input.releaseId} OR ${metaSchema.stats.snapshotId} = ${input.snapshotId} OR ${metaSchema.stats.apiReleaseSetId} = ${input.apiReleaseSetId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaPublishedDataJournal,
      sql`${metaSchema.metaPublishedDataJournal.releaseId} = ${input.releaseId} OR ${metaSchema.metaPublishedDataJournal.relatedReleaseId} = ${input.releaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaApiFieldProvenance,
      eq(metaSchema.metaApiFieldProvenance.apiReleaseSetId, input.apiReleaseSetId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.metaSnapshotSources,
      sql`${metaSchema.metaSnapshotSources.snapshotId} = ${input.snapshotId} OR ${metaSchema.metaSnapshotSources.sourceReleaseId} = ${input.releaseId}`,
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.ingestRuns,
      eq(metaSchema.ingestRuns.releaseId, input.releaseId),
    ),
    countRows(
      dbContext.metaDb,
      metaSchema.releaseProcessingActions,
      eq(metaSchema.releaseProcessingActions.releaseId, input.releaseId),
    ),
  ])
  const remainingRows =
    releaseRows +
    snapshotRows +
    releaseSetRows +
    sourceRows +
    historyRows +
    currentRows +
    statsRows +
    journalRows +
    provenanceRows +
    snapshotSourceRows +
    ingestRunRows +
    processingActionRows

  if (remainingRows > 0) {
    throw new Error(
      `Purge verification failed: ${remainingRows} release-owned rows remain in the local mirror.`,
    )
  }
}

async function countPurgeSourceRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['sourceDb'],
  input: {
    releaseId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.sourceTables) {
    const table = resolveSourceTable(tableName)
    total += await countRows(db, table, eq(table.releaseId, input.releaseId))
  }

  return total
}

async function countPurgeHistoryRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  input: {
    releaseId: string
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = await countRows(
    db,
    historySchema.snapshotVersionChanges,
    eq(historySchema.snapshotVersionChanges.snapshotId, input.snapshotId),
  )

  for (const tableName of input.tables.historyTables) {
    const table = resolveHistoryTable(tableName)
    total += await countRows(
      db,
      table,
      and(
        eq(table.snapshotId, input.snapshotId),
        eq(table.sourceReleaseId, input.releaseId),
      ),
    )
  }

  return total
}

async function countPurgeCurrentRows(
  db: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  input: {
    snapshotId: string
    tables: ReturnType<typeof describeLatestReleaseRollbackPlan>
  },
) {
  let total = 0

  for (const tableName of input.tables.currentTables) {
    const table = resolveCurrentTable(tableName)
    total += await countRows(db, table, eq(table.snapshotId, input.snapshotId))
  }

  return total
}

async function verifyRollbackResult(
  metaDb: HarbourReadableDb,
  input: {
    previousReleaseId: string | null
    previousReleaseSetId: string | null
    releaseId: string
    resourceType: ResourceType
  },
) {
  const [rolledBackRelease, previousRelease, activeReleaseSet] = await Promise.all([
    resolveDatasetRecord(metaDb, { releaseId: input.releaseId }),
    input.previousReleaseId
      ? resolveDatasetRecord(metaDb, { releaseId: input.previousReleaseId })
      : Promise.resolve(null),
    resolveActiveReleaseSetForType(metaDb, input.resourceType),
  ])

  if (rolledBackRelease) {
    throw new Error(
      `Rollback verification failed: release ${rolledBackRelease.releaseCode} still exists in metadata.`,
    )
  }

  if (!input.previousReleaseId) {
    if (activeReleaseSet) {
      throw new Error(
        `Rollback verification failed: current API release set ${activeReleaseSet.id} still exists after rolling back the initial release.`,
      )
    }

    return
  }

  if (!previousRelease) {
    throw new Error(
      `Rollback verification failed: previous release ${input.previousReleaseId} was not found.`,
    )
  }

  if (previousRelease.status !== 'published') {
    throw new Error(
      `Rollback verification failed: previous release ${previousRelease.releaseCode} is ${previousRelease.status}, expected published.`,
    )
  }

  if (!activeReleaseSet) {
    throw new Error('Rollback verification failed: no current API release set found.')
  }

  if (!input.previousReleaseSetId) {
    throw new Error('Rollback verification failed: previous API release set missing.')
  }

  if (activeReleaseSet.id !== input.previousReleaseSetId) {
    throw new Error(
      `Rollback verification failed: current API release set is ${activeReleaseSet.id}, expected ${input.previousReleaseSetId}.`,
    )
  }
}

function formatRollbackPlan(input: {
  counts: RollbackPlanCounts
  operation: RollbackOperation
  release: ResolvedReleaseRecord
  rowCount: number
  target: UploadTarget
}) {
  return [
    formatField('operation', input.operation),
    formatField('target', formatRollbackTarget(input.target)),
    formatField('dataset', input.release.datasetCode),
    formatField('release', input.release.releaseCode),
    formatField('cohortKey', input.release.cohortKey ?? '-'),
    formatField('rows', formatCount(input.rowCount)),
    '',
    formatField('source rows', formatStepCount(input.counts.source)),
    formatField('history rows', formatStepCount(input.counts.history)),
    formatField('current rows', formatStepCount(input.counts.current)),
    formatField('meta rows', formatStepCount(input.counts.meta)),
  ]
}

function formatRollbackResult(input: {
  dryRun: boolean
  operation: RollbackOperation
  previousRelease: ReleaseRecord
  previousReleaseSet: Awaited<ReturnType<typeof resolveReleaseSetForRelease>>
  release: ResolvedReleaseRecord
  rollbackRoot: string
}) {
  return [
    formatField(
      'status',
      input.dryRun ? 'planned' : input.operation === 'purge' ? 'purged' : 'reverted',
    ),
    formatField('operation', input.operation),
    formatField('dataset', input.release.datasetCode),
    formatField('release', input.release.releaseCode),
    formatField('releaseId', input.release.releaseId),
    '',
    formatField('latest release', input.previousRelease?.releaseCode ?? '-'),
    formatField('releaseId', input.previousRelease?.releaseId ?? '-'),
    formatField('schemaVersion', input.previousReleaseSet?.schemaVersion ?? '-'),
    formatField('artefacts', input.rollbackRoot),
  ]
}

function formatRollbackStepLabel(
  name: keyof RollbackPlanCounts,
  counts: RollbackStepCounts,
  currentStatements: number,
  totalStatements: number,
) {
  return appendPhaseDetails(
    formatRunningPhaseLabel(
      colorTeal('Rollback'),
      colorRed(name),
      currentStatements,
      Math.max(totalStatements, 1),
    ),
    [formatStepCount(counts)],
  )
}

function formatStepCount(counts: RollbackStepCounts) {
  return `${formatCount(counts.rows)} rows / ${formatCount(counts.tables)} tables`
}

function formatRollbackTarget(target: UploadTarget) {
  const label = describeTarget(target).label

  return target.remote ? `${label} (${resolveHarbourBaseUrl(target)})` : label
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

function resolveRollbackShardHints(args: ParsedArgs, releaseSpecifier: string) {
  const explicitRegion = getStringOption(args, ['region'])
  const explicitShardYear = getStringOption(args, ['shard-year', 'year'])

  if (explicitRegion && explicitShardYear) {
    return {
      regionCode: explicitRegion,
      shardYear: explicitShardYear,
    }
  }

  const parsed = releaseSpecifier.match(
    /(?:^|[-_])(?<region>hk|mo)[-_](?<date>20\d{2}-\d{2}-\d{2})/i,
  )

  if (parsed?.groups?.region && parsed.groups.date) {
    return {
      regionCode: parsed.groups.region.toLowerCase(),
      shardYear: parsed.groups.date.slice(0, 4),
    }
  }

  throw new Error(
    'Could not infer rollback shard. Pass --region hk|mo and --shard-year YYYY.',
  )
}

function resolveMetaTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.metaBinding,
    databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    name: 'meta',
  }
}

function resolveCurrentTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.currentBinding,
    databaseId: dbContext.state.bindings.DB_CURRENT?.databaseId ?? null,
    name: 'current',
  }
}

function resolveHistoryTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  const target = dbContext.historyTargets.at(-1)

  if (!target) {
    throw new Error('Could not resolve rollback history target.')
  }

  return {
    binding: target.binding,
    databaseId: target.databaseId,
    name: 'history',
  }
}

function resolveSourceTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  const target = dbContext.sourceTargets.at(-1)

  if (!target) {
    throw new Error('Could not resolve rollback source target.')
  }

  return {
    binding: target.binding,
    databaseId: target.databaseId,
    name: 'source',
  }
}

function assertRemoteRollbackImportPrerequisites(
  target: UploadTarget,
  artefacts: ReadonlyArray<{ target: SqlImportTargetContext }>,
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

  for (const artefact of artefacts) {
    if (!artefact.target.databaseId?.trim()) {
      missing.push(`${artefact.target.name}.databaseId`)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Remote rollback import prerequisites missing: ${missing.join(', ')}.`,
    )
  }
}

function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function resolveRemoteTargetName(target: UploadTarget): 'preview' | 'production' {
  if (!target.remote) {
    throw new Error('Rollback remote target requested for a local target.')
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

  if (fromEnv) {
    return fromEnv
  }

  const rawConfig = readFileSync(HARBOUR_API_WRANGLER_PATH, 'utf8')
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

  return typeof accountId === 'string' && accountId.trim()
    ? accountId.trim()
    : undefined
}

function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}
