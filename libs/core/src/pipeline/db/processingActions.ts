import {
  metaSnapshotAssemblies,
  metaSnapshotRecipes,
  metaSnapshotResourceReleases,
} from '@repo/db'
import { processingRulesSelection } from '../../lib/db/processingRuleDefinitions'
import { requireDefined } from '../../requireDefined'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { metaSchema, toIsoTimestamp } from '@repo/db'
import type { ReleaseStatsRow } from '@repo/db/metaSchema'

import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import {
  chunkArray,
  getMaxRowsPerInsert,
  createHash,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'
import {
  encodeAuditGroup,
  normaliseAuditActions,
  type AuditChunk,
  type AuditSummary,
  type ReleaseProcessingAction,
} from './processingActionCodec'
import {
  commitAuditStatements,
  listReleaseAuditSummaries,
  readAuditPages,
  readReleaseAuditChunks,
} from './processingActionStorage'

export type { ReleaseProcessingAction } from './processingActionCodec'

export type MaterialisedReleaseProcessingActions = {
  actions: AuditSummary[]
  chunks: AuditChunk[]
  stats: ReleaseStatsRow[]
}

function declaredOperationCodes(processingRules: unknown) {
  if (!processingRules || typeof processingRules !== 'object') return null
  const rulesets = (processingRules as { rulesets?: unknown }).rulesets
  if (!Array.isArray(rulesets)) return null

  const operationCodes = new Set<string>()
  for (const ruleset of rulesets) {
    if (!ruleset || typeof ruleset !== 'object') continue
    const rules = (ruleset as { rules?: unknown }).rules
    if (!Array.isArray(rules)) continue
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue
      const { operationCode, kind } = rule as {
        operationCode?: unknown
        kind?: unknown
      }
      if ((kind === 'record' || kind === 'bulk') && typeof operationCode === 'string') {
        operationCodes.add(operationCode)
      }
    }
  }

  return operationCodes
}

/**
 * Replaces a release's auditable processing decisions and their aggregate stats.
 * Evidence remains structured JSON so consumers can render the canonical record
 * alongside the source variants without relying on terminal output.
 */
export async function replaceReleaseProcessingActions(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  actions: ReleaseProcessingAction[],
) {
  return (
    await replaceReleaseProcessingActionsAndReturnRows(
      metaDb,
      resourceReleaseId,
      actions,
    )
  ).actions.reduce((count, action) => count + action.decisionCount, 0)
}

/**
 * Replaces audit actions and returns their exact persisted rows for a
 * target-aware DB_META replay.
 */
export async function replaceReleaseProcessingActionsAndReturnRows(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  actions: ReleaseProcessingAction[],
): Promise<MaterialisedReleaseProcessingActions> {
  const release = await metaDb
    .select({
      status: metaSchema.metaResourceReleases.status,
      processingRules: processingRulesSelection(
        metaSchema.metaResourceReleases.processingRules,
      ),
    })
    .from(metaSchema.metaResourceReleases)
    .where(eq(metaSchema.metaResourceReleases.id, resourceReleaseId))
    .limit(1)
    .get()

  if (!release) {
    throw new Error(
      `Cannot replace processing actions: unknown release ${resourceReleaseId}.`,
    )
  }
  if (release.status !== 'staged' && release.status !== 'processing') {
    throw new Error(
      `Cannot replace processing actions for ${resourceReleaseId}: ${release.status} releases are immutable.`,
    )
  }

  const snapshotPolicies = await metaDb
    .select({
      processingRules: processingRulesSelection(metaSnapshotRecipes.processingRules),
    })
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaSnapshotAssemblies,
      eq(metaSnapshotResourceReleases.snapshotId, metaSnapshotAssemblies.snapshotId),
    )
    .innerJoin(
      metaSnapshotRecipes,
      eq(metaSnapshotAssemblies.snapshotRecipeId, metaSnapshotRecipes.id),
    )
    .where(eq(metaSnapshotResourceReleases.resourceReleaseId, resourceReleaseId))
    .all()
  const operationCodes = declaredOperationCodes(release.processingRules)
  for (const policy of snapshotPolicies) {
    for (const code of declaredOperationCodes(policy.processingRules) ?? [])
      operationCodes?.add(code)
  }
  if (operationCodes) {
    const undeclaredActions = actions
      .map(action => action.action)
      .filter(action => !operationCodes.has(action))
    if (undeclaredActions.length > 0) {
      throw new Error(
        `Processing actions are not declared in processing rules for ${resourceReleaseId}: ${[...new Set(undeclaredActions)].join(', ')}.`,
      )
    }
  }

  const grouped = new Map<
    string,
    {
      action: string
      mode: 'automatic' | 'manual'
      affectedRecordCount: number
      decisionCount: number
    }
  >()
  for (const action of normaliseAuditActions(actions)) {
    const key = `${action.mode}:${action.action}`
    const entry = grouped.get(key) ?? {
      action: action.action,
      mode: action.mode,
      affectedRecordCount: 0,
      decisionCount: 0,
    }
    entry.affectedRecordCount += action.affectedRecordCount
    entry.decisionCount += 1
    grouped.set(key, entry)
  }
  // Fixture decisions are retained by the provenance writer. D1 stores counts only.
  const counts = [...grouped.values()].sort((a, b) =>
    `${a.mode}:${a.action}`.localeCompare(`${b.mode}:${b.action}`),
  )
  const generation = await createHash(counts)
  const previous = await listReleaseAuditSummaries(metaDb, [resourceReleaseId])
  if (
    previous.length === counts.length &&
    previous.every(row => row.generation === generation)
  )
    return { actions: previous, chunks: [], stats: [] }
  const timestamp = toIsoTimestamp()
  const summaries: AuditSummary[] = await Promise.all(
    counts.map(async count => ({
      ...count,
      id: await createHash([resourceReleaseId, count.mode, count.action]),
      resourceReleaseId,
      generation,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  )
  const table = metaSchema.releaseProcessingActions
  const releases = metaSchema.metaResourceReleases
  const expected = previous[0]?.generation ?? ''
  const guard = metaDb
    .update(releases)
    .set({
      updatedAt: sql`case when ${releases.status} in ('staged', 'processing')
      and (select count(*) from ${table} where ${table.resourceReleaseId} = ${resourceReleaseId}) = ${previous.length}
      and not exists (select 1 from ${table} where ${table.resourceReleaseId} = ${resourceReleaseId} and ${table.generation} != ${expected})
      then ${releases.updatedAt} else json('Audit replacement conflict or immutable release') end`,
    })
    .where(eq(releases.id, resourceReleaseId))
  await commitAuditStatements(metaDb, [
    guard,
    metaDb.delete(table).where(eq(table.resourceReleaseId, resourceReleaseId)),
    ...chunkArray(summaries, getMaxRowsPerInsert(9)).map(rows =>
      metaDb.insert(table).values(rows),
    ),
  ])
  return { actions: summaries, chunks: [], stats: [] }
}
