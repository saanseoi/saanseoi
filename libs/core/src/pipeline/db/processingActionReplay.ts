import type { HarbourReadableDb } from '../../lib/db/types'
import { metaSchema, type MetaDatabase } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import type { ReleaseStatsRow } from '@repo/db/metaSchema'
import type { MaterialisedReleaseProcessingActions } from './processingActions'
import { AUDIT_COMMIT_START, AUDIT_COMMIT_END } from './processingActionSqlGroups'
import {
  listReleaseAuditSummaries,
  readReleaseAuditChunks,
  readAuditPages,
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
  const guards: string[] = []
  const owned = new Set<string>()
  for (const action of materialised.actions) {
    const rows = materialised.chunks
      .filter(
        chunk => chunk.actionId === action.id && chunk.generation === action.generation,
      )
      .sort((a, b) => a.firstOrdinal - b.firstOrdinal || a.part - b.part)
    let ordinal = 0
    for (let index = 0; index < rows.length; ) {
      const first = rows[index]!
      if (
        first.firstOrdinal !== ordinal ||
        first.part !== 0 ||
        first.parts < 1 ||
        first.decisionCount < 1
      )
        throw new Error('Incomplete audit replay generation.')
      for (let part = 0; part < first.parts; part++) {
        const row = rows[index + part]
        if (
          !row ||
          owned.has(row.id) ||
          row.part !== part ||
          row.parts !== first.parts ||
          row.firstOrdinal !== ordinal ||
          row.decisionCount !== first.decisionCount ||
          row.payload.length > 32768
        )
          throw new Error('Invalid audit replay chunk.')
        owned.add(row.id)
      }
      ordinal += first.decisionCount
      index += first.parts
    }
    if (ordinal !== action.decisionCount)
      throw new Error('Incomplete audit replay generation.')
    guards.push(
      `(SELECT count(*) FROM releaseProcessingActionChunks WHERE actionId = ${literal(action.id)} AND generation = ${literal(action.generation)}) = ${rows.length}`,
    )
  }
  if (owned.size !== materialised.chunks.length)
    throw new Error('Unowned audit replay chunks.')
  const stage = materialised.chunks.map(row =>
    insert('releaseProcessingActionChunks', row, 'ON CONFLICT(id) DO NOTHING'),
  )
  const commit = [
    AUDIT_COMMIT_START,
    `UPDATE releases SET updatedAt = CASE WHEN status IN ('staged','processing') ${guards.length ? `AND ${guards.join(' AND ')}` : ''} THEN updatedAt ELSE json('Immutable release or incomplete audit') END WHERE id = ${literal(releaseId)};`,
    `DELETE FROM "releaseProcessingActions" WHERE "releaseId" = ${literal(releaseId)};`,
    ...materialised.actions.map(row => insert('releaseProcessingActions', row)),
    ...(materialised.stats
      ? [
          `DELETE FROM "stats" WHERE "releaseId" = ${literal(releaseId)} AND "type" = 'processing';`,
          ...materialised.stats.map(row => insert('stats', row)),
        ]
      : []),
    AUDIT_COMMIT_END,
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
  await readAuditPages(db, actions)
  const chunks = await readReleaseAuditChunks(db, actions)
  const stats = (await db
    .select()
    .from(metaSchema.stats)
    .where(
      and(
        eq(metaSchema.stats.releaseId, releaseId),
        eq(metaSchema.stats.type, 'processing'),
      ),
    )
    .all()) as ReleaseStatsRow[]
  return buildAuditReplaySql(releaseId, { actions, chunks, stats })
}
