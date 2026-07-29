import { and, eq } from 'drizzle-orm'

import { metaSchema, toIsoTimestamp } from '@repo/db'

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
  const release = await metaDb
    .select({ status: metaSchema.metaReleases.status })
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

  if (actions.length === 0) {
    return 0
  }

  const timestamp = toIsoTimestamp()
  const actionChunkSize = getMaxRowsPerInsert(9)
  const actionStatements = chunkArray(actions, actionChunkSize).map(chunk =>
    metaDb.insert(metaSchema.releaseProcessingActions).values(
      chunk.map(action => ({
        ...action,
        affectedRecordCount: Math.max(0, Math.floor(action.affectedRecordCount)),
        createdAt: timestamp,
        id: crypto.randomUUID(),
        releaseId,
        updatedAt: timestamp,
      })),
    ),
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
  const statsChunkSize = getMaxRowsPerInsert(13)
  const statsStatements = chunkArray([...statsByAction.values()], statsChunkSize).map(
    chunk =>
      metaDb.insert(metaSchema.stats).values(
        chunk.map(action => ({
          createdAt: timestamp,
          dimension: 'processing',
          groupBy: 'action',
          groupValue: `${action.mode}:${action.action}`,
          id: crypto.randomUUID(),
          metric: 'processing',
          metricUnit: 'count',
          releaseId,
          type: 'processing',
          updatedAt: timestamp,
          value: Math.max(0, Math.floor(action.affectedRecordCount)),
        })),
      ),
  )
  await runStatementsInGroupsWithWriteRetry(metaDb, statsStatements)

  return actions.length
}
