import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  getDatasetRecordByReleaseId,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
  waitForDatasetRecord,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionRow,
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

const CURRENT_DIVISION_COLUMN_COUNT = 16
const CURRENT_DIVISION_I18N_COLUMN_COUNT = 11
const HISTORY_DIVISION_VERSION_COLUMN_COUNT = 24
const HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT = 16
const HISTORY_DIVISION_VERSION_UPSERT_FIXED_VARIABLE_COUNT = 7

type CurrentDivisionWriteRow = Omit<NewDivisionRow, 'snapshotId'>
type CurrentDivisionI18nWriteRow = Omit<NewDivisionI18nRow, 'snapshotId'>
type DivisionHashInput = Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
export type DivisionBaseRecord = CurrentDivisionWriteRow
export type DivisionI18nRecord = CurrentDivisionI18nWriteRow

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
  snapshotId: string
  cohortKey: string
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
    buildDivisionBaseHashInput: (base: DivisionHashInput) => DivisionHashInput
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
  const dataset = await waitForDatasetRecord(metaDb, {
    releaseCode: message.releaseCode,
    releaseId: message.releaseId ?? message.datasetId,
  })

  if (!dataset) {
    throw new Error(
      `Release not found: ${message.releaseId ?? message.releaseCode ?? message.datasetId}`,
    )
  }

  const snapshot = await ensureDraftSnapshotForRelease(metaDb, message.type, {
    regionCode: dataset.regionCode,
    cohortKey: dataset.cohortKey,
  })

  const year = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForTypeRegionYear(
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

  await upsertSnapshotSource(
    metaDb,
    snapshot.id,
    dataset.datasetId,
    dataset.releaseId,
    'primary',
    {
      anchorReleaseId: dataset.releaseId,
      selectedByRule: 'snapshot-assembly-division-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: dataset.cohortKey,
    },
  )
  await recordSnapshotAssemblyRun(metaDb, {
    snapshotId: snapshot.id,
    resourceType: message.type,
    anchorReleaseId: dataset.releaseId,
    anchorCohortKey: dataset.cohortKey,
    selectionSummaryJson: {
      releaseRole: 'primary',
      sourceReleaseId: dataset.releaseId,
      sourceVersion: dataset.sourceVersion,
    },
  })
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)

  return {
    regionCode: message.regionCode,
    releaseId: dataset.releaseId,
    snapshotId: snapshot.id,
    cohortKey: message.cohortKey,
  }
}

export async function cloneDivisionCurrentSnapshot(
  db: HarbourReadableDb & HarbourWritableDb,
  fromSnapshotId: string,
  toSnapshotId: string,
) {
  if (fromSnapshotId === toSnapshotId) {
    return
  }

  const now = new Date().toISOString()

  await runStatementBatchWithWriteRetry(db, [
    db
      .insert(currentSchema.divisions)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            id: currentSchema.divisions.id,
            level: currentSchema.divisions.level,
            type: currentSchema.divisions.type,
            geometry: currentSchema.divisions.geometry,
            bbox: currentSchema.divisions.bbox,
            population: currentSchema.divisions.population,
            subtype: currentSchema.divisions.subtype,
            class: currentSchema.divisions.class,
            wikidata: currentSchema.divisions.wikidata,
            hierarchy: currentSchema.divisions.hierarchy,
            parentDivisionId: currentSchema.divisions.parentDivisionId,
            cartography: currentSchema.divisions.cartography,
            sources: currentSchema.divisions.sources,
            createdAt: sql<string>`${now}`,
            updatedAt: sql<string>`${now}`,
          })
          .from(currentSchema.divisions)
          .where(eq(currentSchema.divisions.snapshotId, fromSnapshotId)),
      )
      .onConflictDoNothing(),
    db
      .insert(currentSchema.divisionsI18n)
      .select(
        db
          .select({
            snapshotId: sql<string>`${toSnapshotId}`,
            divisionId: currentSchema.divisionsI18n.divisionId,
            locale: currentSchema.divisionsI18n.locale,
            name: currentSchema.divisionsI18n.name,
            nameVariant: currentSchema.divisionsI18n.nameVariant,
            nameAlts: currentSchema.divisionsI18n.nameAlts,
            nameRules: currentSchema.divisionsI18n.nameRules,
            localType: currentSchema.divisionsI18n.localType,
            isLocaleInferred: currentSchema.divisionsI18n.isLocaleInferred,
            createdAt: sql<string>`${now}`,
            updatedAt: sql<string>`${now}`,
          })
          .from(currentSchema.divisionsI18n)
          .where(eq(currentSchema.divisionsI18n.snapshotId, fromSnapshotId)),
      )
      .onConflictDoNothing(),
  ])
}

/**
 * Marks current version rows as closed at the given snapshot month.
 */
export async function closeCurrentDivisionVersions(
  db: HarbourWritableDb,
  regionCode: RegionCode,
  divisionIds: string[],
  snapshotId: string,
  cohortKey: string,
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
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
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
          validToSnapshotId: snapshotId,
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
  historyDb: HarbourReadableDb & HarbourWritableDb,
  regionCode: RegionCode,
  snapshotId: string,
  cohortKey: string,
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

  for (const missingIdChunk of chunkArray(missingIds, chunkSize)) {
    historyStatements.push(
      historyDb
        .update(historySchema.divisionsVersions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
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
          validToSnapshotId: snapshotId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsVersionsI18n.isCurrent, true),
            inArray(historySchema.divisionsVersionsI18n.divisionId, missingIdChunk),
          ),
        ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(historyDb, historyStatements)

  return missingIds.length
}

export async function deleteStaleDivisionCurrentRows(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  seenIds: Set<string>,
) {
  const stagedRows = (await db
    .select({
      id: currentSchema.divisions.id,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()) as Array<{ id: string }>

  const staleIds = stagedRows.map(row => row.id).filter(id => !seenIds.has(id))

  if (staleIds.length === 0) {
    return 0
  }

  await deleteDivisionCurrentRowsByIds(db, snapshotId, staleIds)

  return staleIds.length
}

async function deleteDivisionCurrentRowsByIds(
  db: HarbourReadableDb & HarbourWritableDb,
  snapshotId: string,
  divisionIds: string[],
) {
  const deleteChunkSize = getMaxItemsPerInClause(1, 2)
  const deleteStatements = []

  for (const divisionIdChunk of chunkArray(divisionIds, deleteChunkSize)) {
    deleteStatements.push(
      db
        .delete(currentSchema.divisionsI18n)
        .where(
          and(
            eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
            inArray(currentSchema.divisionsI18n.divisionId, divisionIdChunk),
          ),
        ),
    )
    deleteStatements.push(
      db
        .delete(currentSchema.divisions)
        .where(
          and(
            eq(currentSchema.divisions.snapshotId, snapshotId),
            inArray(currentSchema.divisions.id, divisionIdChunk),
          ),
        ),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, deleteStatements)
}

/**
 * Upserts current division rows in D1-safe batches.
 */
export async function upsertDivisionCurrentStates(
  db: HarbourWritableDb,
  snapshotId: string,
  rows: CurrentDivisionWriteRow[],
  options?: {
    assumeSnapshotEmpty?: boolean
  },
) {
  if (rows.length === 0) {
    return
  }

  const chunkSize = getMaxRowsPerInsert(CURRENT_DIVISION_COLUMN_COUNT)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    const statement = db
      .insert(currentSchema.divisions)
      .values(chunk.map(row => ({ ...row, snapshotId })))

    statements.push(
      options?.assumeSnapshotEmpty
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: [currentSchema.divisions.snapshotId, currentSchema.divisions.id],
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
  snapshotId: string,
  divisionIds: string[],
  rows: CurrentDivisionI18nWriteRow[],
  options?: {
    assumeSnapshotEmpty?: boolean
  },
) {
  if (divisionIds.length === 0) {
    return
  }

  if (!options?.assumeSnapshotEmpty) {
    const deleteChunkSize = getMaxItemsPerInClause(1, 1)
    const deleteStatements = []

    for (const divisionIdChunk of chunkArray(divisionIds, deleteChunkSize)) {
      deleteStatements.push(
        db
          .delete(currentSchema.divisionsI18n)
          .where(
            and(
              eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
              inArray(currentSchema.divisionsI18n.divisionId, divisionIdChunk),
            ),
          ),
      )
    }

    await runStatementsInGroupsWithWriteRetry(db, deleteStatements)
  }

  if (rows.length > 0) {
    await insertDivisionsI18nInChunks(
      db,
      rows.map(row => ({
        ...row,
        snapshotId,
      })),
      options,
    )
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
  options?: {
    assumeVersionRowsAbsent?: boolean
  },
) {
  if (baseRows.length === 0) {
    return
  }

  const baseChunkSize = getMaxRowsPerInsert(
    HISTORY_DIVISION_VERSION_COLUMN_COUNT,
    HISTORY_DIVISION_VERSION_UPSERT_FIXED_VARIABLE_COUNT,
  )
  const baseStatements = []

  for (const chunk of chunkArray(baseRows, baseChunkSize)) {
    const statement = historyDb.insert(historySchema.divisionsVersions).values(
      chunk.map(row => ({
        id: row.id,
        regionCode: context.regionCode,
        versionHash: row.versionHash,
        sourceReleaseId: context.releaseId,
        snapshotId: context.snapshotId,
        validFromSnapshotId: context.snapshotId,
        validToSnapshotId: null,
        validFromCohortKey: context.cohortKey,
        validToCohortKey: null,
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

    baseStatements.push(
      options?.assumeVersionRowsAbsent
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: [
              historySchema.divisionsVersions.id,
              historySchema.divisionsVersions.versionHash,
            ],
            set: {
              isCurrent: true,
              sourceReleaseId: context.releaseId,
              snapshotId: context.snapshotId,
              validFromCohortKey: context.cohortKey,
              validFromSnapshotId: context.snapshotId,
              validToSnapshotId: null,
              validToCohortKey: null,
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
        sourceReleaseId: context.releaseId,
        snapshotId: context.snapshotId,
        validFromSnapshotId: context.snapshotId,
        validToSnapshotId: null,
        isCurrent: true,
        versionHash: row.versionHash,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options,
    )
  }
}

/**
 * Inserts current division i18n rows in batches that fit SQLite parameter limits.
 */
async function insertDivisionsI18nInChunks(
  db: HarbourWritableDb,
  rows: NewDivisionI18nRow[],
  options?: {
    assumeSnapshotEmpty?: boolean
  },
) {
  const chunkSize = getMaxRowsPerInsert(CURRENT_DIVISION_I18N_COLUMN_COUNT)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    const statement = db.insert(currentSchema.divisionsI18n).values(chunk)
    statements.push(
      options?.assumeSnapshotEmpty ? statement.onConflictDoNothing() : statement,
    )
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
    sourceReleaseId: string
    snapshotId: string
    validFromSnapshotId: string
    validToSnapshotId: string | null
    isCurrent: boolean
    versionHash: string
    createdAt: string
    updatedAt: string
  }>,
  options?: {
    assumeVersionRowsAbsent?: boolean
  },
) {
  const chunkSize = getMaxRowsPerInsert(HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    const statement = db.insert(historySchema.divisionsVersionsI18n).values(chunk)

    statements.push(
      options?.assumeVersionRowsAbsent
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: [
              historySchema.divisionsVersionsI18n.divisionId,
              historySchema.divisionsVersionsI18n.versionHash,
              historySchema.divisionsVersionsI18n.locale,
            ],
            set: {
              sourceReleaseId: excluded('sourceReleaseId'),
              snapshotId: excluded('snapshotId'),
              validFromSnapshotId: excluded('validFromSnapshotId'),
              validToSnapshotId: null,
              isCurrent: true,
              name: excluded('name'),
              nameAlts: excluded('nameAlts'),
              nameRules: excluded('nameRules'),
              nameVariant: excluded('nameVariant'),
              localType: excluded('localType'),
              isLocaleInferred: excluded('isLocaleInferred'),
              updatedAt: excluded('updatedAt'),
            },
          }),
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
