import type { HarbourReadableDb } from '../../lib/db/types'
import type { MetaDatabase } from '@repo/db'
import type { MaterialisedReleaseProcessingActions } from './processingActions'
import {
  listReleaseAuditSummaries,
  readReleaseAuditChunks,
} from './processingActionStorage'

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Uint8Array)
    return `X'${Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')}'`
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid audit SQL number.')
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insert(table: string, row: Record<string, unknown>, suffix = '') {
  const statement = `INSERT INTO "${table}" (${Object.keys(row)
    .map(key => `"${key}"`)
    .join(',')}) VALUES (${Object.values(row).map(literal).join(',')}) ${suffix};`
  if (new TextEncoder().encode(statement).length >= 100_000)
    throw new Error('Audit replay statement exceeds D1 SQL byte limit.')
  return statement
}

/** Each chunk is its own bounded statement. The final entry is one commit unit. */
export function buildAuditReplaySql(
  releaseId: string,
  materialised: Pick<MaterialisedReleaseProcessingActions, 'actions' | 'chunks'> &
    Partial<Pick<MaterialisedReleaseProcessingActions, 'stats'>>,
) {
  if (
    materialised.actions.some(row => row.releaseId !== releaseId) ||
    materialised.chunks.some(row => row.releaseId !== releaseId)
  )
    throw new Error('Audit replay release mismatch.')
  const stage = materialised.chunks.map(row =>
    insert('releaseProcessingActionChunks', row, 'ON CONFLICT(id) DO NOTHING'),
  )
  const commit = [
    `UPDATE releases SET updatedAt = CASE WHEN status IN ('staged','processing') THEN updatedAt ELSE json('Immutable release audit') END WHERE id = ${literal(releaseId)};`,
    `DELETE FROM "releaseProcessingActions" WHERE "releaseId" = ${literal(releaseId)};`,
    ...materialised.actions.map(row => insert('releaseProcessingActions', row)),
    ...(materialised.stats
      ? [
          `DELETE FROM "stats" WHERE "releaseId" = ${literal(releaseId)} AND "type" = 'processing';`,
          ...materialised.stats.map(row => insert('stats', row)),
        ]
      : []),
  ].join('\n')
  if (new TextEncoder().encode(commit).length > 90_000)
    throw new Error('Audit summary commit exceeds replay batch budget.')
  return [...stage, commit]
}

export async function readAuditReplaySql(
  database: HarbourReadableDb | MetaDatabase,
  releaseId: string,
) {
  const db = database as HarbourReadableDb
  const actions = await listReleaseAuditSummaries(db, [releaseId])
  const chunks = await readReleaseAuditChunks(db, actions)
  return buildAuditReplaySql(releaseId, { actions, chunks })
}
