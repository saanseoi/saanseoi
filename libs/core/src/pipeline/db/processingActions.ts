import { and, eq } from 'drizzle-orm'

import { metaSchema, toIsoTimestamp } from '@repo/db'
import type { ReleaseStatsRow } from '@repo/db/metaSchema'

import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import {
  chunkArray,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'

export type ReleaseProcessingAction = {
  action: string
  affectedRecordCount: number
  evidence: unknown
  mode: 'automatic' | 'manual'
  summary: string
}

export type MaterialisedReleaseProcessingActions = {
  actions: Array<
    ReleaseProcessingAction & {
      createdAt: string
      id: string
      releaseId: string
      updatedAt: string
    }
  >
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
      const { operationCode, type } = rule as {
        operationCode?: unknown
        type?: unknown
      }
      if ((type === 'record' || type === 'bulk') && typeof operationCode === 'string') {
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
  releaseId: string,
  actions: ReleaseProcessingAction[],
) {
  return (
    await replaceReleaseProcessingActionsAndReturnRows(metaDb, releaseId, actions)
  ).actions.length
}

/**
 * Replaces audit actions and returns their exact persisted rows for a
 * target-aware DB_META replay.
 */
export async function replaceReleaseProcessingActionsAndReturnRows(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  actions: ReleaseProcessingAction[],
): Promise<MaterialisedReleaseProcessingActions> {
  const release = await metaDb
    .select({
      status: metaSchema.metaReleases.status,
      processingRules: metaSchema.metaReleases.processingRules,
    })
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.id, releaseId))
    .limit(1)
    .get()

  if (!release) {
    throw new Error(`Cannot replace processing actions: unknown release ${releaseId}.`)
  }
  if (release.status !== 'staged' && release.status !== 'processing') {
    throw new Error(
      `Cannot replace processing actions for ${releaseId}: ${release.status} releases are immutable.`,
    )
  }

  const operationCodes = declaredOperationCodes(release.processingRules)
  if (operationCodes) {
    const undeclaredActions = actions
      .map(action => action.action)
      .filter(action => !operationCodes.has(action))
    if (undeclaredActions.length > 0) {
      throw new Error(
        `Processing actions are not declared in processing rules for ${releaseId}: ${[...new Set(undeclaredActions)].join(', ')}.`,
      )
    }
  }

  await runStatementBatchWithWriteRetry(metaDb, [
    metaDb
      .delete(metaSchema.releaseProcessingActions)
      .where(eq(metaSchema.releaseProcessingActions.releaseId, releaseId)),
    metaDb
      .delete(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, releaseId),
          eq(metaSchema.stats.type, 'processing'),
        ),
      ),
  ])

  if (actions.length === 0) return { actions: [], stats: [] }

  const timestamp = toIsoTimestamp()
  const materialisedActions = actions.map(action => ({
    ...action,
    affectedRecordCount: Math.max(0, Math.floor(action.affectedRecordCount)),
    createdAt: timestamp,
    id: crypto.randomUUID(),
    releaseId,
    updatedAt: timestamp,
  }))
  const actionChunkSize = getMaxRowsPerInsert(9)
  const actionStatements = chunkArray(materialisedActions, actionChunkSize).map(chunk =>
    metaDb.insert(metaSchema.releaseProcessingActions).values(chunk),
  )
  await runStatementsInGroupsWithWriteRetry(metaDb, actionStatements)

  const statsByAction = new Map<string, ReleaseProcessingAction>()
  for (const action of actions) {
    const key = `${action.mode}\u0000${action.action}`
    const aggregate = statsByAction.get(key)
    if (aggregate) {
      aggregate.affectedRecordCount += action.affectedRecordCount
    } else {
      statsByAction.set(key, { ...action })
    }
  }
  const materialisedStats: ReleaseStatsRow[] = [...statsByAction.values()].map(
    action => ({
      apiReleaseSetId: null,
      createdAt: timestamp,
      dimension: 'processing',
      groupBy: 'action',
      groupValue: `${action.mode}:${action.action}`,
      id: crypto.randomUUID(),
      metric: 'processing',
      metricUnit: 'count',
      releaseId,
      snapshotId: null,
      type: 'processing',
      updatedAt: timestamp,
      value: Math.max(0, Math.floor(action.affectedRecordCount)),
    }),
  )
  const statsChunkSize = getMaxRowsPerInsert(13)
  const statsStatements = chunkArray(materialisedStats, statsChunkSize).map(chunk =>
    metaDb.insert(metaSchema.stats).values(chunk),
  )
  await runStatementsInGroupsWithWriteRetry(metaDb, statsStatements)

  return { actions: materialisedActions, stats: materialisedStats }
}
