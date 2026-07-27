import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { DatasetProcessingMessage } from '../../types'
import { sourceSchema, type SourceDatabase } from '@repo/db'

import {
  chunkArray,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
  runWithWriteRetry,
} from '../utils'

const SOURCE_OVERTURE_DIVISION_VERSION_COLUMN_COUNT = 17
const SOURCE_OVERTURE_DIVISION_I18N_VERSION_COLUMN_COUNT = 14
const SOURCE_HKGOV_ADDRESS2D_VERSION_COLUMN_COUNT = 28
const SOURCE_HKGOV_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = 23
const SEEN_SOURCE_RECORD_ID_INSERT_COLUMN_COUNT = 1

const tempSeenSourceRecordIds = sqliteTable('tempSeenSourceRecordIds', {
  sourceRecordId: text('sourceRecordId').primaryKey(),
})

export function buildSourceReleaseId(message: DatasetProcessingMessage) {
  return message.releaseId ?? message.datasetId
}

export function buildSourceDatasetId(message: DatasetProcessingMessage) {
  if (message.releaseId) {
    return message.datasetId
  }

  const source = message.source === 'hkgov-dpo' ? 'hkgov' : message.source
  return `${source}-${message.regionCode}-${message.type}`
}

export type CurrentSourceRecord = {
  ownerShardKeys?: string[]
  sourcePayloadHash: string | null
  sourceRecordId: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

type RawSqlWritableDb = {
  run(statement: unknown): unknown | Promise<unknown>
}

function runRawSql(db: SourceDatabase, statement: unknown) {
  return runWithWriteRetry(() => (db as unknown as RawSqlWritableDb).run(statement))
}

export async function getCurrentSourceOvertureDivisionMap(db: SourceDatabase) {
  return loadCurrentSourceRecordMap(db, sourceSchema.sourceOvertureDivisions)
}

export async function getMergedCurrentSourceOvertureDivisionMap(
  sources: Array<{
    db: unknown
    key: string
    sortOrder: number
  }>,
) {
  const mergedRows = new Map<string, CurrentSourceRecord & { ownerSortOrder: number }>()

  for (const source of [...sources].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const rows = await getCurrentSourceOvertureDivisionMap(source.db as SourceDatabase)

    for (const [id, row] of rows) {
      const existing = mergedRows.get(id)
      const ownerShardKeys = [
        ...(existing?.ownerShardKeys ?? []),
        ...(row.ownerShardKeys ?? []),
        source.key,
      ]

      if (!existing || source.sortOrder >= existing.ownerSortOrder) {
        mergedRows.set(id, {
          ...row,
          ownerShardKeys: [...new Set(ownerShardKeys)],
          ownerSortOrder: source.sortOrder,
        })
        continue
      }

      mergedRows.set(id, {
        ...existing,
        ownerShardKeys: [...new Set(ownerShardKeys)],
      })
    }
  }

  return new Map(
    [...mergedRows.entries()].map(([id, row]) => {
      const { ownerSortOrder: _ownerSortOrder, ...sourceRecord } = row

      return [id, sourceRecord] as const
    }),
  )
}

export async function getCurrentSourceHkgovAlsAddress2dMap(db: SourceDatabase) {
  return loadCurrentSourceRecordMap(db, sourceSchema.sourceHkgovAlsAddresses2d)
}

export async function getCurrentSourceHkgovAlsAddress2dRecords(
  db: SourceDatabase,
  sourceRecordIds: string[],
) {
  return loadCurrentSourceRecordMapByIds(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    sourceRecordIds,
  )
}

export async function hasCurrentSourceHkgovAlsAddress2dRecords(db: SourceDatabase) {
  return hasCurrentSourceRecords(db, sourceSchema.sourceHkgovAlsAddresses2d)
}

export async function prepareSeenSourceRecordIdTable(db: SourceDatabase) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenSourceRecordIds`)
  await runRawSql(
    db,
    sql`CREATE TEMP TABLE tempSeenSourceRecordIds (sourceRecordId TEXT PRIMARY KEY)`,
  )
}

export async function insertSeenSourceRecordIds(
  db: SourceDatabase,
  sourceRecordIds: string[],
) {
  const uniqueIds = [...new Set(sourceRecordIds)]

  if (uniqueIds.length === 0) {
    return
  }

  for (const chunk of chunkArray(
    uniqueIds,
    getMaxRowsPerInsert(SEEN_SOURCE_RECORD_ID_INSERT_COLUMN_COUNT),
  )) {
    await runStatementBatchWithWriteRetry(db, [
      db
        .insert(tempSeenSourceRecordIds)
        .values(chunk.map(sourceRecordId => ({ sourceRecordId })))
        .onConflictDoNothing(),
    ])
  }
}

export async function dropSeenSourceRecordIdTable(db: SourceDatabase) {
  await runRawSql(db, sql`DROP TABLE IF EXISTS tempSeenSourceRecordIds`)
}

export async function closeSourceOvertureDivisionVersions(
  db: SourceDatabase,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  await closeCurrentSourceVersions(
    db,
    sourceSchema.sourceOvertureDivisions,
    sourceRecordIds,
    validToRelease,
    sourceSchema.sourceOvertureDivisionI18n,
  )
}

export async function closeSourceHkgovAlsAddress2dVersions(
  db: SourceDatabase,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  await closeCurrentSourceVersions(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    sourceRecordIds,
    validToRelease,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
  )
}

export async function deleteMissingCurrentSourceOvertureDivisions(
  db: SourceDatabase,
  validToRelease: string,
  currentRows: Map<string, CurrentSourceRecord>,
  seenIds: Set<string>,
) {
  return deleteMissingCurrentSourceRows(
    db,
    sourceSchema.sourceOvertureDivisions,
    validToRelease,
    currentRows,
    seenIds,
    sourceSchema.sourceOvertureDivisionI18n,
  )
}

export async function deleteMissingCurrentSourceHkgovAlsAddresses2d(
  db: SourceDatabase,
  validToRelease: string,
  currentRows: Map<string, CurrentSourceRecord>,
  seenIds: Set<string>,
) {
  return deleteMissingCurrentSourceRows(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    validToRelease,
    currentRows,
    seenIds,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
  )
}

export async function deleteMissingCurrentSourceHkgovAlsAddresses2dBySeenIds(
  db: SourceDatabase,
  validToRelease: string,
  seenIds: Set<string>,
) {
  return deleteMissingCurrentSourceRowsBySeenIds(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    validToRelease,
    seenIds,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
  )
}

export async function deleteMissingCurrentSourceHkgovAlsAddresses2dBySeenTable(
  db: SourceDatabase,
  validToRelease: string,
) {
  return deleteMissingCurrentSourceRowsBySeenTable(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    validToRelease,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
  )
}

export async function deleteMissingCurrentSourceHkgovAlsAddresses2dByReleaseId(
  db: SourceDatabase,
  validToRelease: string,
  releaseId: string,
) {
  return deleteMissingCurrentSourceRowsByReleaseId(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    validToRelease,
    releaseId,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
  )
}

async function deleteMissingCurrentSourceRowsByReleaseId<
  TBaseVersions extends {
    isCurrent: unknown
    releaseId: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
  TI18nVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
>(
  db: SourceDatabase,
  baseVersionsTable: TBaseVersions,
  validToRelease: string,
  releaseId: string,
  i18nVersionsTable?: TI18nVersions,
) {
  let closedRows = 0
  let lastSourceRecordId = ''

  while (true) {
    const rows = (await db
      .select({
        sourceRecordId: baseVersionsTable.sourceRecordId as never,
      })
      .from(baseVersionsTable as never)
      .where(
        and(
          eq(baseVersionsTable.isCurrent as never, true),
          gt(baseVersionsTable.sourceRecordId as never, lastSourceRecordId),
          sql`(${baseVersionsTable.releaseId as never} IS NULL OR ${
            baseVersionsTable.releaseId as never
          } <> ${releaseId})`,
        ),
      )
      .orderBy(baseVersionsTable.sourceRecordId as never)
      .limit(500)
      .all()) as Array<{ sourceRecordId: string }>

    if (rows.length === 0) {
      break
    }

    const missingIds = rows.map(row => row.sourceRecordId)

    await closeCurrentSourceVersions(
      db,
      baseVersionsTable,
      missingIds,
      validToRelease,
      i18nVersionsTable,
    )

    closedRows += missingIds.length
    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastSourceRecordId = lastRow.sourceRecordId
  }

  return closedRows
}

export async function advanceSourceOvertureDivisionRelease(
  db: SourceDatabase,
  sourceRecordIds: string[],
  releaseId: string,
) {
  await advanceCurrentSourceRelease(
    db,
    sourceSchema.sourceOvertureDivisions,
    sourceRecordIds,
    releaseId,
  )
}

export async function insertSourceOvertureDivisionVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisions.$inferInsert>,
  options?: {
    assumeVersionRowsAbsent?: boolean
  },
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureDivisions,
    rows,
    SOURCE_OVERTURE_DIVISION_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureDivisions.sourceRecordId,
      sourceSchema.sourceOvertureDivisions.versionHash,
    ],
    options,
  )
}

export async function insertSourceOvertureDivisionI18nVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert>,
  options?: {
    assumeVersionRowsAbsent?: boolean
  },
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureDivisionI18n,
    rows,
    SOURCE_OVERTURE_DIVISION_I18N_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureDivisionI18n.sourceRecordId,
      sourceSchema.sourceOvertureDivisionI18n.versionHash,
      sourceSchema.sourceOvertureDivisionI18n.locale,
    ],
    options,
  )
}

export async function insertSourceHkgovAlsAddresses2dVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    rows,
    SOURCE_HKGOV_ADDRESS2D_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceHkgovAlsAddresses2d.sourceRecordId,
      sourceSchema.sourceHkgovAlsAddresses2d.versionHash,
    ],
  )
}

export async function insertSourceHkgovAlsAddress2dI18nVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
    rows,
    SOURCE_HKGOV_ADDRESS2D_I18N_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceHkgovAlsAddress2dI18n.sourceRecordId,
      sourceSchema.sourceHkgovAlsAddress2dI18n.versionHash,
      sourceSchema.sourceHkgovAlsAddress2dI18n.locale,
    ],
  )
}

async function loadCurrentSourceRecordMap<
  TTable extends {
    isCurrent: unknown
    sourceRecordId: unknown
    versionHash: unknown
  },
>(db: SourceDatabase, table: TTable) {
  const rows = await db
    .select({
      sourcePayloadHash: table.versionHash as never,
      sourceRecordId: table.sourceRecordId as never,
    })
    .from(table as never)
    .where(eq(table.isCurrent as never, true))
    .all()

  return new Map(
    rows.map(row => [
      String((row as CurrentSourceRecord).sourceRecordId),
      row as CurrentSourceRecord,
    ]),
  )
}

async function loadCurrentSourceRecordMapByIds<
  TTable extends {
    isCurrent: unknown
    sourceRecordId: unknown
    versionHash: unknown
  },
>(db: SourceDatabase, table: TTable, sourceRecordIds: string[]) {
  const rows: CurrentSourceRecord[] = []

  for (const chunk of chunkArray(
    [...new Set(sourceRecordIds)],
    getMaxItemsPerInClause(),
  )) {
    if (chunk.length === 0) {
      continue
    }

    rows.push(
      ...((await db
        .select({
          sourcePayloadHash: table.versionHash as never,
          sourceRecordId: table.sourceRecordId as never,
        })
        .from(table as never)
        .where(
          and(
            eq(table.isCurrent as never, true),
            inArray(table.sourceRecordId as never, chunk),
          ),
        )
        .all()) as CurrentSourceRecord[]),
    )
  }

  return new Map(rows.map(row => [row.sourceRecordId, row]))
}

async function hasCurrentSourceRecords<
  TTable extends { isCurrent: unknown; sourceRecordId: unknown },
>(db: SourceDatabase, table: TTable) {
  const row = await db
    .select({
      sourceRecordId: table.sourceRecordId as never,
    })
    .from(table as never)
    .where(eq(table.isCurrent as never, true))
    .limit(1)
    .get()

  return Boolean(row)
}

async function closeCurrentSourceVersions<
  TBaseVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
  TI18nVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
>(
  db: SourceDatabase,
  baseVersionsTable: TBaseVersions,
  sourceRecordIds: string[],
  validToRelease: string,
  i18nVersionsTable?: TI18nVersions,
) {
  if (sourceRecordIds.length === 0) {
    return
  }

  const now = new Date().toISOString()

  for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 4))) {
    const statements = [
      db
        .update(baseVersionsTable as never)
        .set({
          isCurrent: false,
          validToRelease,
          updatedAt: now,
        } as never)
        .where(
          and(
            eq(baseVersionsTable.isCurrent as never, true),
            inArray(baseVersionsTable.sourceRecordId as never, chunk),
          ),
        ),
    ]

    if (i18nVersionsTable) {
      statements.push(
        db
          .update(i18nVersionsTable as never)
          .set({
            isCurrent: false,
            validToRelease,
            updatedAt: now,
          } as never)
          .where(
            and(
              eq(i18nVersionsTable.isCurrent as never, true),
              inArray(i18nVersionsTable.sourceRecordId as never, chunk),
            ),
          ),
      )
    }

    await runStatementsInGroupsWithWriteRetry(db, statements)
  }
}

async function deleteMissingCurrentSourceRows<
  TBaseVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
  TI18nVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
>(
  db: SourceDatabase,
  baseVersionsTable: TBaseVersions,
  validToRelease: string,
  currentRows: Map<string, CurrentSourceRecord>,
  seenIds: Set<string>,
  i18nVersionsTable?: TI18nVersions,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  await closeCurrentSourceVersions(
    db,
    baseVersionsTable,
    missingIds,
    validToRelease,
    i18nVersionsTable,
  )

  return missingIds.length
}

async function deleteMissingCurrentSourceRowsBySeenIds<
  TBaseVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
  TI18nVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
>(
  db: SourceDatabase,
  baseVersionsTable: TBaseVersions,
  validToRelease: string,
  seenIds: Set<string>,
  i18nVersionsTable?: TI18nVersions,
) {
  let closedRows = 0
  let lastSourceRecordId = ''

  while (true) {
    const rows = (await db
      .select({
        sourceRecordId: baseVersionsTable.sourceRecordId as never,
      })
      .from(baseVersionsTable as never)
      .where(
        and(
          eq(baseVersionsTable.isCurrent as never, true),
          gt(baseVersionsTable.sourceRecordId as never, lastSourceRecordId),
        ),
      )
      .orderBy(baseVersionsTable.sourceRecordId as never)
      .limit(500)
      .all()) as Array<{ sourceRecordId: string }>

    if (rows.length === 0) {
      break
    }

    const missingIds = rows
      .map(row => row.sourceRecordId)
      .filter(id => !seenIds.has(id))

    if (missingIds.length > 0) {
      await closeCurrentSourceVersions(
        db,
        baseVersionsTable,
        missingIds,
        validToRelease,
        i18nVersionsTable,
      )

      closedRows += missingIds.length
    }

    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastSourceRecordId = lastRow.sourceRecordId
  }

  return closedRows
}

async function deleteMissingCurrentSourceRowsBySeenTable<
  TBaseVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
  TI18nVersions extends {
    isCurrent: unknown
    sourceRecordId: unknown
    updatedAt: unknown
    validToRelease: unknown
  },
>(
  db: SourceDatabase,
  baseVersionsTable: TBaseVersions,
  validToRelease: string,
  i18nVersionsTable?: TI18nVersions,
) {
  let closedRows = 0
  let lastSourceRecordId = ''

  while (true) {
    const rows = (await db
      .select({
        sourceRecordId: baseVersionsTable.sourceRecordId as never,
      })
      .from(baseVersionsTable as never)
      .where(
        and(
          eq(baseVersionsTable.isCurrent as never, true),
          gt(baseVersionsTable.sourceRecordId as never, lastSourceRecordId),
          sql`NOT EXISTS (
            SELECT 1
            FROM tempSeenSourceRecordIds seen
            WHERE seen.sourceRecordId = ${baseVersionsTable.sourceRecordId as never}
          )`,
        ),
      )
      .orderBy(baseVersionsTable.sourceRecordId as never)
      .limit(500)
      .all()) as Array<{ sourceRecordId: string }>

    if (rows.length === 0) {
      break
    }

    const missingIds = rows.map(row => row.sourceRecordId)

    await closeCurrentSourceVersions(
      db,
      baseVersionsTable,
      missingIds,
      validToRelease,
      i18nVersionsTable,
    )

    closedRows += missingIds.length
    const lastRow = rows.at(-1)

    if (!lastRow) {
      break
    }

    lastSourceRecordId = lastRow.sourceRecordId
  }

  return closedRows
}

async function insertVersionRows<TTable>(
  db: SourceDatabase,
  table: TTable,
  rows: Array<TTable extends { $inferInsert: infer TInsert } ? TInsert : never>,
  columnCount: number,
  target: unknown[],
  options?: {
    assumeVersionRowsAbsent?: boolean
  },
) {
  if (rows.length === 0) {
    return
  }

  const uniqueRows = [
    ...new Map(
      (
        rows as Array<{
          locale?: string
          sourceRecordId: string
          versionHash: string
        }>
      ).map(row => [
        `${row.sourceRecordId}\0${row.versionHash}\0${row.locale ?? ''}`,
        row,
      ]),
    ).values(),
  ] as Array<TTable extends { $inferInsert: infer TInsert } ? TInsert : never>

  const statements = []

  for (const chunk of chunkArray(uniqueRows, getMaxRowsPerInsert(columnCount, 3))) {
    const statement = db.insert(table as never).values(chunk as never)

    statements.push(
      options?.assumeVersionRowsAbsent
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: target as never,
            set: {
              isCurrent: true,
              releaseId: excluded('releaseId'),
              validFromRelease: excluded('validFromRelease'),
              validToRelease: null,
              updatedAt: new Date().toISOString(),
            } as never,
          }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

async function advanceCurrentSourceRelease<
  TTable extends {
    isCurrent: unknown
    releaseId: unknown
    sourceRecordId: unknown
    updatedAt: unknown
  },
>(db: SourceDatabase, table: TTable, sourceRecordIds: string[], releaseId: string) {
  if (sourceRecordIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const statements = []

  for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 3))) {
    statements.push(
      db
        .update(table as never)
        .set({
          releaseId,
          updatedAt: now,
        } as never)
        .where(
          and(
            eq(table.isCurrent as never, true),
            inArray(table.sourceRecordId as never, chunk),
          ),
        ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

export async function advanceSourceHkgovAlsAddress2dRelease(
  db: SourceDatabase,
  sourceRecordIds: string[],
  releaseId: string,
) {
  await advanceCurrentSourceRelease(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    sourceRecordIds,
    releaseId,
  )
}
