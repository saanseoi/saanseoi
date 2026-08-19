import { and, eq } from 'drizzle-orm'

import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import { getDatasetRecordByReleaseId } from '../../lib/db/metaRegistry'
import { metaSchema, toIsoTimestamp } from '@repo/db'
import type {
  ApiReleaseSetScopedStatsRow,
  ReleaseStatsRow,
  ReleaseScopedStatsRow,
} from '@repo/db/metaSchema'
import {
  chunkArray,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'

/**
 * Replaces all release-level stats rows for a dataset release.
 */
export async function replaceDatasetStats(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  rows: ReleaseScopedStatsRow[],
) {
  return (await replaceDatasetStatsAndReturnRows(metaDb, releaseId, rows)).length
}

/**
 * Replaces release facts and returns the exact materialised rows. Callers that
 * mirror metadata to another D1 database must replay these IDs and timestamps,
 * rather than independently generating an equivalent-looking set of rows.
 */
export async function replaceDatasetStatsAndReturnRows(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  rows: ReleaseScopedStatsRow[],
): Promise<ReleaseStatsRow[]> {
  const dataset = await getDatasetRecordByReleaseId(metaDb, releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId}`)
  }

  await runStatementBatchWithWriteRetry(metaDb, [
    metaDb
      .delete(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, dataset.releaseId),
          eq(metaSchema.stats.type, 'release'),
        ),
      ),
  ])

  if (rows.length === 0) return []

  const materialisedRows: ReleaseStatsRow[] = rows.map(row => {
    const timestamp = toIsoTimestamp()
    return {
      ...row,
      apiReleaseSetId: null,
      createdAt: row.createdAt ?? timestamp,
      groupBy: row.groupBy ?? null,
      groupValue: row.groupValue ?? null,
      id: crypto.randomUUID(),
      releaseId: dataset.releaseId,
      snapshotId: null,
      updatedAt: row.updatedAt ?? timestamp,
    }
  })

  const chunkSize = getMaxRowsPerInsert(13)
  const statements = []

  for (const chunk of chunkArray(materialisedRows, chunkSize)) {
    statements.push(metaDb.insert(metaSchema.stats).values(chunk))
  }

  await runStatementsInGroupsWithWriteRetry(metaDb, statements)

  return materialisedRows
}

/** Replaces one release-stat dimension while preserving all other release facts. */
export async function replaceReleaseStatsDimension(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  dimension: string,
  rows: ReleaseScopedStatsRow[],
) {
  const dataset = await getDatasetRecordByReleaseId(metaDb, releaseId)
  if (!dataset) throw new Error(`Release not found: ${releaseId}`)

  await runStatementBatchWithWriteRetry(metaDb, [
    metaDb
      .delete(metaSchema.stats)
      .where(
        and(
          eq(metaSchema.stats.releaseId, dataset.releaseId),
          eq(metaSchema.stats.type, 'release'),
          eq(metaSchema.stats.dimension, dimension),
        ),
      ),
  ])
  if (rows.length === 0) return 0

  const statements = []
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(13))) {
    statements.push(
      metaDb.insert(metaSchema.stats).values(
        chunk.map(row => ({
          ...row,
          releaseId: dataset.releaseId,
          id: crypto.randomUUID(),
        })),
      ),
    )
  }
  await runStatementsInGroupsWithWriteRetry(metaDb, statements)
  return rows.length
}

/**
 * Replaces all API-release-set presentation stats rows for an API release set.
 */
export async function replaceApiReleaseSetStats(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  apiReleaseSetId: string,
  rows: ApiReleaseSetScopedStatsRow[],
) {
  const apiReleaseSet = await metaDb
    .select({ id: metaSchema.metaApiReleaseSets.id })
    .from(metaSchema.metaApiReleaseSets)
    .where(eq(metaSchema.metaApiReleaseSets.id, apiReleaseSetId))
    .get()

  if (!apiReleaseSet) {
    throw new Error(`API release set not found: ${apiReleaseSetId}`)
  }

  await runStatementBatchWithWriteRetry(metaDb, [
    metaDb
      .delete(metaSchema.stats)
      .where(eq(metaSchema.stats.apiReleaseSetId, apiReleaseSetId)),
  ])

  if (rows.length === 0) {
    return 0
  }

  const chunkSize = getMaxRowsPerInsert(13)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    statements.push(
      metaDb.insert(metaSchema.stats).values(
        chunk.map(row => ({
          ...row,
          apiReleaseSetId,
          id: crypto.randomUUID(),
        })),
      ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(metaDb, statements)

  return rows.length
}
