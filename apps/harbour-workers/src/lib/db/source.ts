import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage } from '@repo/core'
import { sourceSchema, type SourceDatabase } from '@repo/db'

import {
  chunkArray,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'

const SOURCE_OVERTURE_DIVISION_COLUMN_COUNT = 20
const SOURCE_OVERTURE_DIVISION_I18N_COLUMN_COUNT = 8
const SOURCE_OVERTURE_DIVISION_VERSION_COLUMN_COUNT = 22
const SOURCE_OVERTURE_DIVISION_I18N_VERSION_COLUMN_COUNT = 15
const SOURCE_OVERTURE_ADDRESS2D_COLUMN_COUNT = 14
const SOURCE_OVERTURE_ADDRESS2D_I18N_COLUMN_COUNT = 6
const SOURCE_OVERTURE_ADDRESS2D_VERSION_COLUMN_COUNT = 16
const SOURCE_OVERTURE_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = 13
const SOURCE_HKGOV_ADDRESS2D_COLUMN_COUNT = 27
const SOURCE_HKGOV_ADDRESS2D_I18N_COLUMN_COUNT = 16
const SOURCE_HKGOV_ADDRESS2D_VERSION_COLUMN_COUNT = 29
const SOURCE_HKGOV_ADDRESS2D_I18N_VERSION_COLUMN_COUNT = 23

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

export type CurrentSourceRecord = {
  sourcePayloadHash: string | null
  sourceRecordId: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

export async function getCurrentSourceOvertureDivisionMap(db: SourceDatabase) {
  return loadCurrentSourceRecordMap(db, sourceSchema.sourceOvertureDivisions)
}

export async function getCurrentSourceOvertureAddress2dMap(db: SourceDatabase) {
  return loadCurrentSourceRecordMap(db, sourceSchema.sourceOvertureAddresses2d)
}

export async function getCurrentSourceHkgovAlsAddress2dMap(db: SourceDatabase) {
  return loadCurrentSourceRecordMap(db, sourceSchema.sourceHkgovAlsAddresses2d)
}

export async function closeSourceOvertureDivisionVersions(
  db: SourceDatabase,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  await closeCurrentSourceVersions(
    db,
    sourceSchema.sourceOvertureDivisionsVersions,
    sourceSchema.sourceOvertureDivisionI18nVersions,
    sourceRecordIds,
    validToRelease,
  )
}

export async function closeSourceOvertureAddress2dVersions(
  db: SourceDatabase,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  await closeCurrentSourceVersions(
    db,
    sourceSchema.sourceOvertureAddresses2dVersions,
    sourceSchema.sourceOvertureAddress2dI18nVersions,
    sourceRecordIds,
    validToRelease,
  )
}

export async function closeSourceHkgovAlsAddress2dVersions(
  db: SourceDatabase,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  await closeCurrentSourceVersions(
    db,
    sourceSchema.sourceHkgovAlsAddresses2dVersions,
    sourceSchema.sourceHkgovAlsAddress2dI18nVersions,
    sourceRecordIds,
    validToRelease,
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
    sourceSchema.sourceOvertureDivisionI18n,
    sourceSchema.sourceOvertureDivisionsVersions,
    sourceSchema.sourceOvertureDivisionI18nVersions,
    validToRelease,
    currentRows,
    seenIds,
  )
}

export async function deleteMissingCurrentSourceOvertureAddresses2d(
  db: SourceDatabase,
  validToRelease: string,
  currentRows: Map<string, CurrentSourceRecord>,
  seenIds: Set<string>,
) {
  return deleteMissingCurrentSourceRows(
    db,
    sourceSchema.sourceOvertureAddresses2d,
    sourceSchema.sourceOvertureAddress2dI18n,
    sourceSchema.sourceOvertureAddresses2dVersions,
    sourceSchema.sourceOvertureAddress2dI18nVersions,
    validToRelease,
    currentRows,
    seenIds,
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
    sourceSchema.sourceHkgovAlsAddress2dI18n,
    sourceSchema.sourceHkgovAlsAddresses2dVersions,
    sourceSchema.sourceHkgovAlsAddress2dI18nVersions,
    validToRelease,
    currentRows,
    seenIds,
  )
}

export async function upsertSourceOvertureDivisions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisions.$inferInsert>,
) {
  if (rows.length === 0) {
    return
  }

  const statements = []

  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(SOURCE_OVERTURE_DIVISION_COLUMN_COUNT),
  )) {
    statements.push(
      db
        .insert(sourceSchema.sourceOvertureDivisions)
        .values(chunk)
        .onConflictDoUpdate({
          target: sourceSchema.sourceOvertureDivisions.sourceRecordId,
          set: {
            releaseId: excluded('releaseId'),
            datasetId: excluded('datasetId'),
            sourcePayloadHash: excluded('sourcePayloadHash'),
            regionCode: excluded('regionCode'),
            level: excluded('level'),
            divisionType: excluded('divisionType'),
            subtype: excluded('subtype'),
            divisionClass: excluded('divisionClass'),
            population: excluded('population'),
            version: excluded('version'),
            wikidata: excluded('wikidata'),
            geometry: excluded('geometry'),
            bbox: excluded('bbox'),
            hierarchies: excluded('hierarchies'),
            cartography: excluded('cartography'),
            sources: excluded('sources'),
            rawProperties: excluded('rawProperties'),
            updatedAt: new Date(),
          },
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

export async function advanceSourceOvertureDivisionRelease(
  db: SourceDatabase,
  sourceRecordIds: string[],
  releaseId: string,
  datasetId: string,
) {
  await advanceCurrentSourceRelease(
    db,
    sourceSchema.sourceOvertureDivisions,
    sourceRecordIds,
    releaseId,
    datasetId,
  )
}

export async function replaceSourceOvertureDivisionI18n(
  db: SourceDatabase,
  sourceRecordId: string,
  rows: Array<typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceOvertureDivisionI18n,
    [sourceRecordId],
    rows,
    SOURCE_OVERTURE_DIVISION_I18N_COLUMN_COUNT,
  )
}

export async function replaceSourceOvertureDivisionI18nRows(
  db: SourceDatabase,
  sourceRecordIds: string[],
  rows: Array<typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceOvertureDivisionI18n,
    sourceRecordIds,
    rows,
    SOURCE_OVERTURE_DIVISION_I18N_COLUMN_COUNT,
  )
}

export async function insertSourceOvertureDivisionVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisionsVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureDivisionsVersions,
    rows,
    SOURCE_OVERTURE_DIVISION_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureDivisionsVersions.sourceRecordId,
      sourceSchema.sourceOvertureDivisionsVersions.versionHash,
    ],
  )
}

export async function insertSourceOvertureDivisionI18nVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureDivisionI18nVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureDivisionI18nVersions,
    rows,
    SOURCE_OVERTURE_DIVISION_I18N_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureDivisionI18nVersions.sourceRecordId,
      sourceSchema.sourceOvertureDivisionI18nVersions.versionHash,
      sourceSchema.sourceOvertureDivisionI18nVersions.locale,
    ],
  )
}

export async function upsertSourceOvertureAddresses2d(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureAddresses2d.$inferInsert>,
) {
  if (rows.length === 0) {
    return
  }

  const statements = []

  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(SOURCE_OVERTURE_ADDRESS2D_COLUMN_COUNT),
  )) {
    statements.push(
      db
        .insert(sourceSchema.sourceOvertureAddresses2d)
        .values(chunk)
        .onConflictDoUpdate({
          target: sourceSchema.sourceOvertureAddresses2d.sourceRecordId,
          set: {
            releaseId: excluded('releaseId'),
            datasetId: excluded('datasetId'),
            sourcePayloadHash: excluded('sourcePayloadHash'),
            regionCode: excluded('regionCode'),
            version: excluded('version'),
            geometry: excluded('geometry'),
            bbox: excluded('bbox'),
            streetName: excluded('streetName'),
            streetNumber: excluded('streetNumber'),
            sources: excluded('sources'),
            rawProperties: excluded('rawProperties'),
            updatedAt: new Date(),
          },
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

export async function replaceSourceOvertureAddress2dI18n(
  db: SourceDatabase,
  sourceRecordId: string,
  rows: Array<typeof sourceSchema.sourceOvertureAddress2dI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceOvertureAddress2dI18n,
    [sourceRecordId],
    rows,
    SOURCE_OVERTURE_ADDRESS2D_I18N_COLUMN_COUNT,
  )
}

export async function replaceSourceOvertureAddress2dI18nRows(
  db: SourceDatabase,
  sourceRecordIds: string[],
  rows: Array<typeof sourceSchema.sourceOvertureAddress2dI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceOvertureAddress2dI18n,
    sourceRecordIds,
    rows,
    SOURCE_OVERTURE_ADDRESS2D_I18N_COLUMN_COUNT,
  )
}

export async function insertSourceOvertureAddresses2dVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureAddresses2dVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureAddresses2dVersions,
    rows,
    SOURCE_OVERTURE_ADDRESS2D_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureAddresses2dVersions.sourceRecordId,
      sourceSchema.sourceOvertureAddresses2dVersions.versionHash,
    ],
  )
}

export async function insertSourceOvertureAddress2dI18nVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceOvertureAddress2dI18nVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceOvertureAddress2dI18nVersions,
    rows,
    SOURCE_OVERTURE_ADDRESS2D_I18N_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceOvertureAddress2dI18nVersions.sourceRecordId,
      sourceSchema.sourceOvertureAddress2dI18nVersions.versionHash,
      sourceSchema.sourceOvertureAddress2dI18nVersions.locale,
    ],
  )
}

export async function upsertSourceHkgovAlsAddresses2d(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2d.$inferInsert>,
) {
  if (rows.length === 0) {
    return
  }

  const statements = []

  for (const chunk of chunkArray(
    rows,
    getMaxRowsPerInsert(SOURCE_HKGOV_ADDRESS2D_COLUMN_COUNT),
  )) {
    statements.push(
      db
        .insert(sourceSchema.sourceHkgovAlsAddresses2d)
        .values(chunk)
        .onConflictDoUpdate({
          target: sourceSchema.sourceHkgovAlsAddresses2d.sourceRecordId,
          set: {
            releaseId: excluded('releaseId'),
            datasetId: excluded('datasetId'),
            sourcePayloadHash: excluded('sourcePayloadHash'),
            regionCode: excluded('regionCode'),
            geoAddress: excluded('geoAddress'),
            csuId: excluded('csuId'),
            x: excluded('x'),
            y: excluded('y'),
            geometry: excluded('geometry'),
            districtCode: excluded('districtCode'),
            districtName: excluded('districtName'),
            estateName: excluded('estateName'),
            buildingName: excluded('buildingName'),
            blockNumber: excluded('blockNumber'),
            blockDescriptor: excluded('blockDescriptor'),
            phaseName: excluded('phaseName'),
            phaseNumber: excluded('phaseNumber'),
            floor: excluded('floor'),
            unit: excluded('unit'),
            streetNumber: excluded('streetNumber'),
            streetName: excluded('streetName'),
            villageName: excluded('villageName'),
            dataOwner: excluded('dataOwner'),
            rawPayload: excluded('rawPayload'),
            updatedAt: new Date(),
          },
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

export async function replaceSourceHkgovAlsAddress2dI18n(
  db: SourceDatabase,
  sourceRecordId: string,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
    [sourceRecordId],
    rows,
    SOURCE_HKGOV_ADDRESS2D_I18N_COLUMN_COUNT,
  )
}

export async function replaceSourceHkgovAlsAddress2dI18nRows(
  db: SourceDatabase,
  sourceRecordIds: string[],
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18n.$inferInsert>,
) {
  await syncCurrentI18nRows(
    db,
    sourceSchema.sourceHkgovAlsAddress2dI18n,
    sourceRecordIds,
    rows,
    SOURCE_HKGOV_ADDRESS2D_I18N_COLUMN_COUNT,
  )
}

export async function insertSourceHkgovAlsAddresses2dVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddresses2dVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceHkgovAlsAddresses2dVersions,
    rows,
    SOURCE_HKGOV_ADDRESS2D_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceHkgovAlsAddresses2dVersions.sourceRecordId,
      sourceSchema.sourceHkgovAlsAddresses2dVersions.versionHash,
    ],
  )
}

export async function insertSourceHkgovAlsAddress2dI18nVersions(
  db: SourceDatabase,
  rows: Array<typeof sourceSchema.sourceHkgovAlsAddress2dI18nVersions.$inferInsert>,
) {
  await insertVersionRows(
    db,
    sourceSchema.sourceHkgovAlsAddress2dI18nVersions,
    rows,
    SOURCE_HKGOV_ADDRESS2D_I18N_VERSION_COLUMN_COUNT,
    [
      sourceSchema.sourceHkgovAlsAddress2dI18nVersions.sourceRecordId,
      sourceSchema.sourceHkgovAlsAddress2dI18nVersions.versionHash,
      sourceSchema.sourceHkgovAlsAddress2dI18nVersions.locale,
    ],
  )
}

async function loadCurrentSourceRecordMap<
  TTable extends { sourceRecordId: unknown; sourcePayloadHash: unknown },
>(db: SourceDatabase, table: TTable) {
  const rows = await db
    .select({
      sourcePayloadHash: table.sourcePayloadHash as never,
      sourceRecordId: table.sourceRecordId as never,
    })
    .from(table as never)
    .all()

  return new Map(
    rows.map(row => [
      String((row as CurrentSourceRecord).sourceRecordId),
      row as CurrentSourceRecord,
    ]),
  )
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
  i18nVersionsTable: TI18nVersions,
  sourceRecordIds: string[],
  validToRelease: string,
) {
  if (sourceRecordIds.length === 0) {
    return
  }

  const now = new Date()

  for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 4))) {
    await runStatementBatchWithWriteRetry(db, [
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
    ])
  }
}

async function deleteMissingCurrentSourceRows<
  TCurrent extends { sourceRecordId: unknown },
  TCurrentI18n extends { sourceRecordId: unknown },
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
  currentTable: TCurrent,
  currentI18nTable: TCurrentI18n,
  baseVersionsTable: TBaseVersions,
  i18nVersionsTable: TI18nVersions,
  validToRelease: string,
  currentRows: Map<string, CurrentSourceRecord>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  await closeCurrentSourceVersions(
    db,
    baseVersionsTable,
    i18nVersionsTable,
    missingIds,
    validToRelease,
  )

  for (const chunk of chunkArray(missingIds, getMaxItemsPerInClause())) {
    await runStatementBatchWithWriteRetry(db, [
      db
        .delete(currentI18nTable as never)
        .where(inArray(currentI18nTable.sourceRecordId as never, chunk)),
      db
        .delete(currentTable as never)
        .where(inArray(currentTable.sourceRecordId as never, chunk)),
    ])
  }

  return missingIds.length
}

async function syncCurrentI18nRows<
  TTable extends { sourceRecordId: unknown; locale: unknown },
>(
  db: SourceDatabase,
  table: TTable,
  sourceRecordIds: string[],
  rows: Array<TTable extends { $inferInsert: infer TInsert } ? TInsert : never>,
  columnCount: number,
) {
  if (sourceRecordIds.length === 0) {
    return
  }

  if (rows.length === 0) {
    const deleteStatements = []

    for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause())) {
      deleteStatements.push(
        db.delete(table as never).where(inArray(table.sourceRecordId as never, chunk)),
      )
    }

    await runStatementsInGroupsWithWriteRetry(db, deleteStatements)
    return
  }

  const updatableColumns = Object.keys(rows[0] as Record<string, unknown>).filter(
    column => column !== 'sourceRecordId' && column !== 'locale',
  )
  const upsertStatements = []

  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(columnCount, 3))) {
    upsertStatements.push(
      db
        .insert(table as never)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [table.sourceRecordId as never, table.locale as never],
          set: Object.fromEntries(
            updatableColumns.map(column => [column, excluded(column)]),
          ) as never,
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, upsertStatements)

  const existingRows: Array<{ locale: string; sourceRecordId: string }> = []

  for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause())) {
    const chunkRows = await db
      .select({
        locale: table.locale as never,
        sourceRecordId: table.sourceRecordId as never,
      })
      .from(table as never)
      .where(inArray(table.sourceRecordId as never, chunk))
      .all()

    existingRows.push(
      ...(chunkRows as Array<{ locale: string; sourceRecordId: string }>),
    )
  }

  const incomingLocalesBySourceRecordId = new Map<string, Set<string>>()

  for (const row of rows as Array<{ locale: string; sourceRecordId: string }>) {
    const locales =
      incomingLocalesBySourceRecordId.get(row.sourceRecordId) ?? new Set<string>()
    locales.add(row.locale)
    incomingLocalesBySourceRecordId.set(row.sourceRecordId, locales)
  }

  const staleLocalesBySourceRecordId = new Map<string, Set<string>>()

  for (const row of existingRows) {
    if (incomingLocalesBySourceRecordId.get(row.sourceRecordId)?.has(row.locale)) {
      continue
    }

    const staleLocales =
      staleLocalesBySourceRecordId.get(row.sourceRecordId) ?? new Set<string>()
    staleLocales.add(row.locale)
    staleLocalesBySourceRecordId.set(row.sourceRecordId, staleLocales)
  }

  const deleteStatements = []

  for (const [sourceRecordId, locales] of staleLocalesBySourceRecordId) {
    deleteStatements.push(
      db
        .delete(table as never)
        .where(
          and(
            eq(table.sourceRecordId as never, sourceRecordId),
            inArray(table.locale as never, [...locales]),
          ),
        ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, deleteStatements)
}

async function insertVersionRows<TTable>(
  db: SourceDatabase,
  table: TTable,
  rows: Array<TTable extends { $inferInsert: infer TInsert } ? TInsert : never>,
  columnCount: number,
  target: unknown[],
) {
  if (rows.length === 0) {
    return
  }

  const statements = []

  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(columnCount, 3))) {
    statements.push(
      db
        .insert(table as never)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: target as never,
          set: {
            isCurrent: true,
            releaseId: excluded('releaseId'),
            validFromRelease: excluded('validFromRelease'),
            validToRelease: null,
            updatedAt: new Date(),
          } as never,
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

async function advanceCurrentSourceRelease<
  TTable extends {
    datasetId: unknown
    releaseId: unknown
    sourceRecordId: unknown
    updatedAt: unknown
  },
>(
  db: SourceDatabase,
  table: TTable,
  sourceRecordIds: string[],
  releaseId: string,
  datasetId: string,
) {
  if (sourceRecordIds.length === 0) {
    return
  }

  const now = new Date()
  const statements = []

  for (const chunk of chunkArray(sourceRecordIds, getMaxItemsPerInClause(1, 3))) {
    statements.push(
      db
        .update(table as never)
        .set({
          releaseId,
          datasetId,
          updatedAt: now,
        } as never)
        .where(inArray(table.sourceRecordId as never, chunk)),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

export async function advanceSourceOvertureAddress2dRelease(
  db: SourceDatabase,
  sourceRecordIds: string[],
  releaseId: string,
  datasetId: string,
) {
  await advanceCurrentSourceRelease(
    db,
    sourceSchema.sourceOvertureAddresses2d,
    sourceRecordIds,
    releaseId,
    datasetId,
  )
}

export async function advanceSourceHkgovAlsAddress2dRelease(
  db: SourceDatabase,
  sourceRecordIds: string[],
  releaseId: string,
  datasetId: string,
) {
  await advanceCurrentSourceRelease(
    db,
    sourceSchema.sourceHkgovAlsAddresses2d,
    sourceRecordIds,
    releaseId,
    datasetId,
  )
}
