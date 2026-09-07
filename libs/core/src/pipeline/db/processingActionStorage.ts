import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '../../lib/db/types'
import { chunkArray, getMaxItemsPerInClause } from '../utils'
import {
  decodeAuditChunkParts,
  type AuditChunk,
  type AuditSummary,
} from './processingActionCodec'

const summaries = metaSchema.releaseProcessingActions
const chunks = metaSchema.releaseProcessingActionChunks
export const auditSummarySelection = {
  id: summaries.id,
  releaseId: summaries.releaseId,
  action: summaries.action,
  mode: summaries.mode,
  generation: summaries.generation,
  decisionCount: summaries.decisionCount,
  affectedRecordCount: summaries.affectedRecordCount,
  createdAt: summaries.createdAt,
  updatedAt: summaries.updatedAt,
}
const chunkSelection = {
  id: chunks.id,
  releaseId: chunks.releaseId,
  actionId: chunks.actionId,
  generation: chunks.generation,
  firstOrdinal: chunks.firstOrdinal,
  decisionCount: chunks.decisionCount,
  part: chunks.part,
  parts: chunks.parts,
  encoding: chunks.encoding,
  checksum: chunks.checksum,
  payload: chunks.payload,
}

export type StoredAuditDecision = Omit<AuditSummary, 'generation' | 'decisionCount'> & {
  summary: string
  evidence: unknown
}

/** The captured summary pins the generation for the whole read. */
export async function readAuditSummaryPage<T extends AuditSummary>(
  db: HarbourReadableDb,
  summary: T,
  offset = 0,
  limit = summary.decisionCount,
): Promise<
  Array<
    Omit<T, 'generation' | 'decisionCount'> & { summary: string; evidence: unknown }
  >
> {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 0
  )
    throw new Error('Invalid audit page.')
  const end = Math.min(summary.decisionCount, offset + limit)
  if (end <= offset) return []
  const rows = await db
    .select(chunkSelection)
    .from(chunks)
    .where(
      and(
        eq(chunks.actionId, summary.id),
        eq(chunks.generation, summary.generation),
        lt(chunks.firstOrdinal, end),
        gt(sql`${chunks.firstOrdinal} + ${chunks.decisionCount}`, offset),
      ),
    )
    .orderBy(asc(chunks.firstOrdinal), asc(chunks.part))
    .all()
  const { generation, decisionCount: _count, ...metadata } = summary
  const result: Array<
    Omit<T, 'generation' | 'decisionCount'> & { summary: string; evidence: unknown }
  > = []
  for (let index = 0; index < rows.length; ) {
    const first = rows[index]!
    const parts = rows.slice(index, index + first.parts)
    const records = await decodeAuditChunkParts(parts)
    for (const [relative, record] of records.entries()) {
      const ordinal = first.firstOrdinal + relative
      if (ordinal >= offset && ordinal < end)
        result.push({
          ...metadata,
          ...record,
          id: record.id ?? `${summary.id}:${generation}:${ordinal}`,
        })
    }
    index += first.parts
  }
  if (result.length !== end - offset)
    throw new Error('Audit generation is incomplete; retry the request.')
  return result
}

export async function readAuditPages<T extends AuditSummary>(
  db: HarbourReadableDb,
  parents: T[],
  offset = 0,
  limit = Number.MAX_SAFE_INTEGER,
) {
  const result: Array<
    Omit<T, 'generation' | 'decisionCount'> & { summary: string; evidence: unknown }
  > = []
  for (const parent of parents) {
    if (offset >= parent.decisionCount) {
      offset -= parent.decisionCount
      continue
    }
    const count = Math.min(limit - result.length, parent.decisionCount - offset)
    if (count <= 0) break
    // Bound each decoding query even for callers requesting a complete export.
    for (let consumed = 0; consumed < count; consumed += 256) {
      result.push(
        ...(await readAuditSummaryPage(
          db,
          parent,
          offset + consumed,
          Math.min(256, count - consumed),
        )),
      )
    }
    offset = 0
  }
  return result
}

export async function listReleaseAuditSummaries(
  db: HarbourReadableDb,
  releaseIds: string[],
) {
  const result: AuditSummary[] = []
  for (const ids of chunkArray(releaseIds, getMaxItemsPerInClause())) {
    result.push(
      ...(await db
        .select(auditSummarySelection)
        .from(summaries)
        .where(inArray(summaries.releaseId, ids))
        .orderBy(asc(summaries.releaseId), asc(summaries.action), asc(summaries.mode))
        .all()),
    )
  }
  return result
}

export async function readReleaseAuditDecisions(
  db: HarbourReadableDb,
  releaseIds: string[],
  action?: string,
) {
  const parents = await listReleaseAuditSummaries(db, releaseIds)
  return readAuditPages(
    db,
    parents.filter(parent => !action || parent.action === action),
  )
}

export async function readReleaseAuditChunks(
  db: HarbourReadableDb,
  parents: AuditSummary[],
) {
  const result: AuditChunk[] = []
  for (const parent of parents) {
    result.push(
      ...(await db
        .select(chunkSelection)
        .from(chunks)
        .where(
          and(eq(chunks.actionId, parent.id), eq(chunks.generation, parent.generation)),
        )
        .orderBy(asc(chunks.firstOrdinal), asc(chunks.part))
        .all()),
    )
  }
  return result
}

/** D1 batch is transactional. Bun SQLite requires a synchronous transaction. */
export async function commitAuditStatements(db: object, statements: unknown[]) {
  if (!statements.length) return
  const database = db as {
    batch?: (statements: unknown[]) => Promise<unknown>
    $client?: { transaction: (callback: () => void) => () => void }
  }
  if (database.batch) {
    await database.batch(statements)
    return
  }
  if (database.$client?.transaction) {
    database.$client.transaction(() => {
      for (const statement of statements) {
        const result = (statement as { run: () => unknown }).run()
        if (result instanceof Promise)
          throw new Error('Audit SQLite transaction requires synchronous statements.')
      }
    })()
    return
  }
  throw new Error('Audit replacement requires a transactional database adapter.')
}
