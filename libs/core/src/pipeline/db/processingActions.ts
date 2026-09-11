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
  ).actions.reduce((count, action) => count + action.decisionCount, 0)
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

  const normalised = normaliseAuditActions(actions)
  const generation = await createHash(normalised)
  const previous = await listReleaseAuditSummaries(metaDb, [releaseId])
  if (previous.length && previous.every(row => row.generation === generation)) {
    // Verify persisted evidence before treating a retry as complete.
    await readAuditPages(metaDb, previous)
    return {
      actions: previous,
      chunks: await readReleaseAuditChunks(metaDb, previous),
      stats: (await metaDb
        .select()
        .from(metaSchema.stats)
        .where(
          and(
            eq(metaSchema.stats.releaseId, releaseId),
            eq(metaSchema.stats.metric, 'processing'),
          ),
        )
        .all()) as ReleaseStatsRow[],
    }
  }
  if (!previous.length && !actions.length) {
    const statistic = await metaDb
      .select({ id: metaSchema.stats.id })
      .from(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, releaseId),
          eq(metaSchema.stats.metric, 'processing'),
        ),
      )
      .limit(1)
      .get()
    if (!statistic) return { actions: [], chunks: [], stats: [] }
  }
  const timestamp = toIsoTimestamp()
  const groups = new Map<string, ReleaseProcessingAction[]>()
  for (const action of normalised) {
    const key = `${action.mode}\u0000${action.action}`
    const group = groups.get(key) ?? []
    group.push(action)
    groups.set(key, group)
  }
  const materialisedActions: AuditSummary[] = []
  const chunks: AuditChunk[] = []
  for (const [key, records] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const summary: AuditSummary = {
      id: await createHash([releaseId, key]),
      releaseId,
      action: requireDefined(records[0]).action,
      mode: requireDefined(records[0]).mode,
      generation,
      decisionCount: records.length,
      affectedRecordCount: records.reduce(
        (sum, record) => sum + record.affectedRecordCount,
        0,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    materialisedActions.push(summary)
    chunks.push(...(await encodeAuditGroup(summary, records)))
  }
  // Eleven bound columns per chunk; one BLOB per statement also bounds request size.
  await runStatementsInGroupsWithWriteRetry(
    metaDb,
    chunks.map(chunk =>
      metaDb
        .insert(metaSchema.releaseProcessingActionChunks)
        .values(chunk)
        .onConflictDoNothing(),
    ),
    10,
  )
  await readAuditPages(metaDb, materialisedActions)
  const materialisedStats: ReleaseStatsRow[] = materialisedActions.map(action => ({
    apiReleaseSetId: null,
    createdAt: timestamp,
    dimension: 'processing',
    groupBy: 'action',
    groupValue: `${action.mode}:${action.action}`,
    id: `processing-${action.id}`,
    metric: 'processing',
    metricUnit: 'count',
    releaseId,

    updatedAt: timestamp,
    value: Math.max(0, Math.floor(action.affectedRecordCount)),
  }))
  const statsChunkSize = getMaxRowsPerInsert(13)
  const statsStatements = chunkArray(materialisedStats, statsChunkSize).map(chunk =>
    metaDb.insert(metaSchema.stats).values(chunk),
  )
  const table = metaSchema.releaseProcessingActions
  const releases = metaSchema.metaReleases
  // Fail inside the transaction if publication or another replacement won the race.
  const expected = previous[0]?.generation ?? ''
  const guard = metaDb
    .update(releases)
    .set({
      updatedAt: sql`case when ${releases.status} in ('staged', 'processing')
      and (select count(*) from ${table} where ${table.releaseId} = ${releaseId}) = ${previous.length}
      and not exists (select 1 from ${table} where ${table.releaseId} = ${releaseId} and ${table.generation} != ${expected})
      then ${releases.updatedAt} else json('Audit replacement conflict or immutable release') end`,
    })
    .where(eq(releases.id, releaseId))
  await commitAuditStatements(metaDb, [
    guard,
    metaDb.delete(table).where(eq(table.releaseId, releaseId)),
    metaDb
      .delete(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, releaseId),
          eq(metaSchema.stats.metric, 'processing'),
        ),
      ),
    ...chunkArray(materialisedActions, getMaxRowsPerInsert(9)).map(rows =>
      metaDb.insert(table).values(rows),
    ),
    ...statsStatements,
  ])
  // Only collect generations observed before this write, never another writer's staging.
  const oldChunks: Array<{ id: string }> = []
  for (const parent of previous) {
    oldChunks.push(
      ...(await metaDb
        .select({ id: metaSchema.releaseProcessingActionChunks.id })
        .from(metaSchema.releaseProcessingActionChunks)
        .where(
          and(
            eq(metaSchema.releaseProcessingActionChunks.actionId, parent.id),
            eq(metaSchema.releaseProcessingActionChunks.generation, parent.generation),
          ),
        )
        .all()),
    )
  }
  for (const batch of chunkArray(oldChunks, 90)) {
    await metaDb
      .delete(metaSchema.releaseProcessingActionChunks)
      .where(
        and(
          inArray(
            metaSchema.releaseProcessingActionChunks.id,
            batch.map(chunk => chunk.id),
          ),
          sql`not exists (select 1 from ${table} where ${table.id} = ${metaSchema.releaseProcessingActionChunks.actionId} and ${table.generation} = ${metaSchema.releaseProcessingActionChunks.generation})`,
        ),
      )
      .run()
  }
  return { actions: materialisedActions, chunks, stats: materialisedStats }
}
