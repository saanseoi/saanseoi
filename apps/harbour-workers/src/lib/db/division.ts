import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  getDatasetRecordByReleaseId,
  resolveReleaseSetForType,
  resolveShardForKindRegionYear,
  upsertReleaseSetMember,
  upsertReleaseSetShardAssignment,
  upsertReleaseShardAssignment,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionI18nRow,
} from '@repo/db/currentSchema'
import type { DatasetStatsRow } from '@repo/db/metaSchema'
import type { CurrentDivisionVersionRow } from '@repo/db/historySchema'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import type { GeoJsonGeometry } from '../geojson'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'
export type DivisionBaseRecord = DivisionRow
export type DivisionI18nRecord = NewDivisionI18nRow

export type DivisionVersionSnapshot = {
  churnHash: string
  geometry: GeoJsonGeometry | null
  id: string
  localizedRows: DivisionI18nPayload[]
  parentId: string | null
  type: string
  versionHash: string
}

export type DivisionVersionInsertContext = {
  regionCode: RegionCode
  releaseId: string
  releaseSetId: string
  snapshotMonth: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

/**
 * Loads the current division state for a region and derives churn snapshots for comparison.
 */
export async function getCurrentDivisionVersionMap(
  db: HarbourReadableDb,
  regionCode: RegionCode,
  options: {
    buildDivisionBaseHashInput: (
      base: Omit<DivisionRow, 'createdAt' | 'updatedAt'> | DivisionRow,
    ) => Omit<DivisionRow, 'createdAt' | 'updatedAt'>
    normalizeDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
  },
) {
  const rows = (await db
    .select({
      id: historySchema.divisionsVersions.id,
      bbox: historySchema.divisionsVersions.bbox,
      cartography: historySchema.divisionsVersions.cartography,
      class: historySchema.divisionsVersions.class,
      geometry: historySchema.divisionsVersions.geometry,
      hierarchy: historySchema.divisionsVersions.hierarchy,
      level: historySchema.divisionsVersions.level,
      parentDivisionId: historySchema.divisionsVersions.parentDivisionId,
      population: historySchema.divisionsVersions.population,
      sources: historySchema.divisionsVersions.sources,
      subtype: historySchema.divisionsVersions.subtype,
      type: historySchema.divisionsVersions.type,
      versionHash: historySchema.divisionsVersions.versionHash,
      wikidata: historySchema.divisionsVersions.wikidata,
    })
    .from(historySchema.divisionsVersions)
    .where(
      and(
        eq(historySchema.divisionsVersions.regionCode, regionCode),
        eq(historySchema.divisionsVersions.isCurrent, true),
      ),
    )
    .all()) as CurrentDivisionVersionRow[]

  if (rows.length === 0) {
    return new Map<string, DivisionVersionSnapshot>()
  }

  const i18nRows: DivisionI18nPayload[] = []
  const divisionIds = rows.map(row => row.id)
  const chunkSize = getMaxItemsPerInClause(1, 1)

  for (const divisionIdChunk of chunkArray(divisionIds, chunkSize)) {
    const chunkRows = (await db
      .select({
        divisionId: historySchema.divisionsVersionsI18n.divisionId,
        isLocaleInferred: historySchema.divisionsVersionsI18n.isLocaleInferred,
        localType: historySchema.divisionsVersionsI18n.localType,
        locale: historySchema.divisionsVersionsI18n.locale,
        name: historySchema.divisionsVersionsI18n.name,
        nameAlts: historySchema.divisionsVersionsI18n.nameAlts,
        nameRules: historySchema.divisionsVersionsI18n.nameRules,
        nameVariant: historySchema.divisionsVersionsI18n.nameVariant,
      })
      .from(historySchema.divisionsVersionsI18n)
      .where(
        and(
          inArray(historySchema.divisionsVersionsI18n.divisionId, divisionIdChunk),
          eq(historySchema.divisionsVersionsI18n.isCurrent, true),
        ),
      )
      .all()) as DivisionI18nPayload[]

    i18nRows.push(...chunkRows)
  }

  const i18nByDivisionId = new Map<string, DivisionI18nPayload[]>()

  for (const row of i18nRows) {
    const rowsForDivision = i18nByDivisionId.get(row.divisionId) ?? []
    rowsForDivision.push(row)
    i18nByDivisionId.set(row.divisionId, rowsForDivision)
  }

  const snapshots = await Promise.all(
    rows.map(async row => {
      const localizedRows = [...(i18nByDivisionId.get(row.id) ?? [])]
        .map(options.normalizeDivisionI18nSnapshotRow)
        .sort((left, right) => left.locale.localeCompare(right.locale))

      return [
        row.id,
        {
          churnHash: await createHash({
            base: options.buildDivisionBaseHashInput(row),
            i18n: localizedRows,
          }),
          geometry: row.geometry as GeoJsonGeometry | null,
          id: row.id,
          localizedRows: localizedRows,
          parentId: row.parentDivisionId,
          type: row.type,
          versionHash: row.versionHash,
        } satisfies DivisionVersionSnapshot,
      ] as const
    }),
  )

  return new Map(snapshots)
}

export async function prepareDivisionVersionInsertContext(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
): Promise<DivisionVersionInsertContext> {
  const dataset = await getDatasetRecordByReleaseId(
    metaDb,
    message.releaseId ?? message.datasetId,
  )

  if (!dataset) {
    throw new Error(`Release not found: ${message.releaseId ?? message.datasetId}`)
  }

  const releaseSet = await resolveReleaseSetForType(metaDb, message.type)

  if (!releaseSet) {
    throw new Error(`Release set not found for type: ${message.type}`)
  }

  const year = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForKindRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForKindRegionYear(
    metaDb,
    'history',
    environment,
    message.regionCode,
    year,
  )

  if (!currentShard || !historyShard) {
    throw new Error(
      `Shard mapping not found for ${message.regionCode}/${year} in ${environment}.`,
    )
  }

  await upsertReleaseSetMember(
    metaDb,
    releaseSet.id,
    dataset.datasetId,
    dataset.releaseId,
    'primary',
  )
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)
  await upsertReleaseSetShardAssignment(metaDb, releaseSet.id, currentShard.id)
  await upsertReleaseSetShardAssignment(metaDb, releaseSet.id, historyShard.id)

  return {
    regionCode: message.regionCode,
    releaseId: dataset.releaseId,
    releaseSetId: releaseSet.id,
    snapshotMonth: message.snapshotMonth,
  }
}

/**
 * Marks current version rows as closed at the given snapshot month.
 */
export async function closeCurrentDivisionVersions(
  db: HarbourWritableDb,
  regionCode: RegionCode,
  divisionIds: string[],
  releaseSetId: string,
  snapshotMonth: string,
) {
  if (divisionIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const chunkSize = getMaxItemsPerInClause(1, 6)
  const statements = []

  for (const divisionIdChunk of chunkArray(divisionIds, chunkSize)) {
    statements.push(
      db
        .update(historySchema.divisionsVersions)
        .set({
          isCurrent: false,
          validToReleaseSetId: releaseSetId,
          validToMonth: snapshotMonth,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsVersions.regionCode, regionCode),
            eq(historySchema.divisionsVersions.isCurrent, true),
            inArray(historySchema.divisionsVersions.id, divisionIdChunk),
          ),
        ),
    )

    statements.push(
      db
        .update(historySchema.divisionsVersionsI18n)
        .set({
          isCurrent: false,
          validToReleaseSetId: releaseSetId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsVersionsI18n.isCurrent, true),
            inArray(historySchema.divisionsVersionsI18n.divisionId, divisionIdChunk),
          ),
        ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

/**
 * Closes and deletes divisions that were previously current but not present in the latest snapshot.
 */
export async function deleteMissingCurrentDivisions(
  currentDb: HarbourReadableDb & HarbourWritableDb,
  historyDb: HarbourReadableDb & HarbourWritableDb,
  regionCode: RegionCode,
  releaseSetId: string,
  snapshotMonth: string,
  currentRows: Map<string, DivisionVersionSnapshot>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  const now = new Date().toISOString()
  const chunkSize = getMaxItemsPerInClause(1, 6)
  const historyStatements = []
  const currentStatements = []

  for (const missingIdChunk of chunkArray(missingIds, chunkSize)) {
    historyStatements.push(
      historyDb
        .update(historySchema.divisionsVersions)
        .set({
          isCurrent: false,
          validToReleaseSetId: releaseSetId,
          validToMonth: snapshotMonth,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsVersions.regionCode, regionCode),
            eq(historySchema.divisionsVersions.isCurrent, true),
            inArray(historySchema.divisionsVersions.id, missingIdChunk),
          ),
        ),
    )

    historyStatements.push(
      historyDb
        .update(historySchema.divisionsVersionsI18n)
        .set({
          isCurrent: false,
          validToReleaseSetId: releaseSetId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsVersionsI18n.isCurrent, true),
            inArray(historySchema.divisionsVersionsI18n.divisionId, missingIdChunk),
          ),
        ),
    )

    currentStatements.push(
      currentDb
        .delete(currentSchema.divisionsI18n)
        .where(inArray(currentSchema.divisionsI18n.divisionId, missingIdChunk)),
    )
    currentStatements.push(
      currentDb
        .delete(currentSchema.divisions)
        .where(inArray(currentSchema.divisions.id, missingIdChunk)),
    )
  }

  await runStatementsInGroupsWithWriteRetry(historyDb, historyStatements)
  await runStatementsInGroupsWithWriteRetry(currentDb, currentStatements)

  return missingIds.length
}

/**
 * Upserts current division rows in D1-safe batches.
 */
export async function upsertDivisionCurrentStates(
  db: HarbourWritableDb,
  rows: DivisionBaseRecord[],
) {
  if (rows.length === 0) {
    return
  }

  const chunkSize = getMaxRowsPerInsert(15)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    statements.push(
      db
        .insert(currentSchema.divisions)
        .values(chunk)
        .onConflictDoUpdate({
          target: currentSchema.divisions.id,
          set: {
            bbox: excluded('bbox'),
            cartography: excluded('cartography'),
            class: excluded('class'),
            geometry: excluded('geometry'),
            hierarchy: excluded('hierarchy'),
            level: excluded('level'),
            population: excluded('population'),
            type: excluded('type'),
            parentDivisionId: excluded('parentDivisionId'),
            sources: excluded('sources'),
            subtype: excluded('subtype'),
            updatedAt: excluded('updatedAt'),
            wikidata: excluded('wikidata'),
          },
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

/**
 * Replaces current i18n rows for one or more divisions with fresh snapshots.
 */
export async function replaceDivisionCurrentI18n(
  db: HarbourWritableDb,
  divisionIds: string[],
  rows: NewDivisionI18nRow[],
) {
  if (divisionIds.length === 0) {
    return
  }

  const deleteChunkSize = getMaxItemsPerInClause()
  const deleteStatements = []

  for (const divisionIdChunk of chunkArray(divisionIds, deleteChunkSize)) {
    deleteStatements.push(
      db
        .delete(currentSchema.divisionsI18n)
        .where(inArray(currentSchema.divisionsI18n.divisionId, divisionIdChunk)),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, deleteStatements)

  if (rows.length > 0) {
    await insertDivisionsI18nInChunks(db, rows)
  }
}

/**
 * Inserts versioned division rows and i18n rows for a dataset snapshot.
 */
export async function insertDivisionVersionRows(
  historyDb: HarbourReadableDb & HarbourWritableDb,
  context: DivisionVersionInsertContext,
  baseRows: Array<
    DivisionBaseRecord & {
      versionHash: string
    }
  >,
  i18nRows: Array<
    {
      divisionId: string
      isLocaleInferred: boolean
      localType: string | null
      locale: string
      name: string | null
      nameAlts: string | null
      nameRules: unknown
      nameVariant: unknown
    } & {
      versionHash: string
      createdAt: string
      updatedAt: string
    }
  >,
) {
  if (baseRows.length === 0) {
    return
  }

  const baseChunkSize = getMaxRowsPerInsert(23)
  const baseStatements = []

  for (const chunk of chunkArray(baseRows, baseChunkSize)) {
    baseStatements.push(
      historyDb
        .insert(historySchema.divisionsVersions)
        .values(
          chunk.map(row => ({
            id: row.id,
            regionCode: context.regionCode,
            versionHash: row.versionHash,
            releaseId: context.releaseId,
            validFromReleaseSetId: context.releaseSetId,
            validToReleaseSetId: null,
            validFromMonth: context.snapshotMonth,
            validToMonth: null,
            isCurrent: true,
            level: row.level,
            type: row.type,
            geometry: row.geometry,
            bbox: row.bbox,
            population: row.population,
            subtype: row.subtype,
            class: row.class,
            wikidata: row.wikidata,
            hierarchy: row.hierarchy,
            parentDivisionId: row.parentDivisionId,
            cartography: row.cartography,
            sources: row.sources,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            historySchema.divisionsVersions.id,
            historySchema.divisionsVersions.versionHash,
          ],
          set: {
            isCurrent: true,
            releaseId: context.releaseId,
            validFromMonth: context.snapshotMonth,
            validFromReleaseSetId: context.releaseSetId,
            validToReleaseSetId: null,
            validToMonth: null,
            updatedAt: excluded('updatedAt'),
          },
        }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(historyDb, baseStatements)

  if (i18nRows.length > 0) {
    await insertDivisionVersionsI18nInChunks(
      historyDb,
      i18nRows.map(row => ({
        divisionId: row.divisionId,
        isLocaleInferred: row.isLocaleInferred,
        localType: row.localType,
        locale: row.locale,
        name: row.name,
        nameAlts: row.nameAlts,
        nameRules: row.nameRules,
        nameVariant: row.nameVariant,
        releaseId: context.releaseId,
        validFromReleaseSetId: context.releaseSetId,
        validToReleaseSetId: null,
        isCurrent: true,
        versionHash: row.versionHash,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    )
  }
}

/**
 * Inserts current division i18n rows in batches that fit SQLite parameter limits.
 */
async function insertDivisionsI18nInChunks(
  db: HarbourWritableDb,
  rows: NewDivisionI18nRow[],
) {
  const chunkSize = getMaxRowsPerInsert(10)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    statements.push(db.insert(currentSchema.divisionsI18n).values(chunk))
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

/**
 * Inserts versioned division i18n rows in batches and ignores duplicate version entries.
 */
async function insertDivisionVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<{
    divisionId: string
    isLocaleInferred: boolean
    localType: string | null
    locale: string
    name: string | null
    nameAlts: string | null
    nameRules: unknown
    nameVariant: unknown
    releaseId: string
    validFromReleaseSetId: string
    validToReleaseSetId: string | null
    isCurrent: boolean
    versionHash: string
    createdAt: string
    updatedAt: string
  }>,
) {
  const chunkSize = getMaxRowsPerInsert(15)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    statements.push(
      db
        .insert(historySchema.divisionsVersionsI18n)
        .values(chunk)
        .onConflictDoNothing(),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

/**
 * Replaces all dataset-level stats rows for a dataset snapshot.
 */
export async function replaceDatasetStats(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  rows: DatasetStatsRow[],
) {
  const dataset = await getDatasetRecordByReleaseId(metaDb, releaseId)

  if (!dataset) {
    throw new Error(`Release not found: ${releaseId}`)
  }

  await runStatementBatchWithWriteRetry(metaDb, [
    metaDb
      .delete(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, dataset.releaseId)),
  ])

  if (rows.length === 0) {
    return 0
  }

  const chunkSize = getMaxRowsPerInsert(11)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    statements.push(
      metaDb.insert(metaSchema.stats).values(
        chunk.map(row => ({
          ...row,
          createdAt:
            row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
          updatedAt:
            row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
          releaseId: dataset.releaseId,
          id: crypto.randomUUID(),
        })),
      ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(metaDb, statements)

  return rows.length
}
