import { eq } from 'drizzle-orm'

import type { DatasetProcessingMessage } from '@repo/core'
import { sourceSchema, type SourceDatabase } from '@repo/db'

import { chunkArray, getMaxRowsPerInsert, runWithWriteRetry } from '../utils'

export function buildSourceReleaseId(message: DatasetProcessingMessage) {
  return message.releaseId ?? message.datasetId
}

export function buildSourceDatasetId(message: DatasetProcessingMessage) {
  if (message.releaseId) {
    return message.datasetId
  }

  const source = message.source === 'hkgov-als' ? 'hkgov' : message.source
  return `${source}-${message.regionCode}-${message.type}`
}

export async function resetSourceReleaseRows(
  db: SourceDatabase,
  message: DatasetProcessingMessage,
) {
  const releaseId = buildSourceReleaseId(message)

  if (message.type === 'division' && message.source === 'overture') {
    await runWithWriteRetry(() =>
      db
        .delete(sourceSchema.sourceOvertureDivisionI18n)
        .where(eq(sourceSchema.sourceOvertureDivisionI18n.releaseId, releaseId))
        .run(),
    )
    await runWithWriteRetry(() =>
      db
        .delete(sourceSchema.sourceOvertureDivisions)
        .where(eq(sourceSchema.sourceOvertureDivisions.releaseId, releaseId))
        .run(),
    )
    return
  }

  if (message.type !== 'address') {
    return
  }

  if (message.source === 'overture') {
    await runWithWriteRetry(() =>
      db
        .delete(sourceSchema.sourceOvertureAddress2dI18n)
        .where(eq(sourceSchema.sourceOvertureAddress2dI18n.releaseId, releaseId))
        .run(),
    )
    await runWithWriteRetry(() =>
      db
        .delete(sourceSchema.sourceOvertureAddresses2d)
        .where(eq(sourceSchema.sourceOvertureAddresses2d.releaseId, releaseId))
        .run(),
    )
    return
  }

  await runWithWriteRetry(() =>
    db
      .delete(sourceSchema.sourceHkgovAlsAddress2dI18n)
      .where(eq(sourceSchema.sourceHkgovAlsAddress2dI18n.releaseId, releaseId))
      .run(),
  )
  await runWithWriteRetry(() =>
    db
      .delete(sourceSchema.sourceHkgovAlsAddresses2d)
      .where(eq(sourceSchema.sourceHkgovAlsAddresses2d.releaseId, releaseId))
      .run(),
  )
}

export async function insertSourceOvertureDivisions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisions.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceOvertureDivisions, rows, 15)
}

export async function insertSourceOvertureDivisionI18n(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceOvertureDivisionI18n, rows, 7)
}

export async function insertSourceOvertureAddresses2d(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureAddresses2d.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceOvertureAddresses2d, rows, 11)
}

export async function insertSourceOvertureAddress2dI18n(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureAddress2dI18n.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceOvertureAddress2dI18n, rows, 7)
}

export async function insertSourceHkgovAlsAddresses2d(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceHkgovAlsAddresses2d, rows, 21)
}

export async function insertSourceHkgovAlsAddress2dI18n(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert>,
) {
  await insertInChunks(db, sourceSchema.sourceHkgovAlsAddress2dI18n, rows, 15)
}

async function insertInChunks<TTable>(
  db: SourceDatabase,
  table: TTable,
  rows: Array<TTable extends { $inferInsert: infer TInsert } ? TInsert : never>,
  columnCount: number,
) {
  if (rows.length === 0) {
    return
  }

  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(columnCount))) {
    await runWithWriteRetry(() =>
      db
        .insert(table as never)
        .values(chunk as never)
        .run(),
    )
  }
}
