import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage } from '../../types'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
  waitForDatasetRecord,
} from '../../lib/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import type {
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionRow,
  NewDivisionI18nRow,
} from '@repo/db/currentSchema'
import type { CurrentDivisionVersionRow } from '@repo/db/historySchema'
import { currentSchema, historySchema } from '@repo/db'
import type { GeoJsonGeometry } from '../geojson'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runStatementBatchWithWriteRetry,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'

const CURRENT_DIVISION_COLUMN_COUNT = 13
const CURRENT_DIVISION_I18N_COLUMN_COUNT = 10
const HISTORY_DIVISION_VERSION_COLUMN_COUNT = 20
const HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT = 15
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
  ownerShardKeys?: string[]
  parentId: string | null
  type: string
  versionHash: string
}

export type DivisionVersionInsertContext = {
  releaseId: string
  snapshotId: string
  cohortKey: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

function resolveParentDivisionIdFromHierarchy(hierarchy: unknown): string | null {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return null
  }

  const parent = hierarchy[hierarchy.length - 1]
  if (!parent || typeof parent !== 'object') {
    return null
  }

  const divisionId = (parent as Record<string, unknown>).division_id
  return typeof divisionId === 'string' && divisionId.trim().length > 0
    ? divisionId
    : null
}

export async function getMergedCurrentDivisionVersionMap(
  sources: Array<{
    db: unknown
    key: string
    sortOrder: number
  }>,
  options: {
    buildDivisionBaseHashInput: (base: DivisionHashInput) => DivisionHashInput
    normalizeDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
  },
) {
  const mergedRows = new Map<
    string,
    DivisionVersionSnapshot & { ownerSortOrder: number }
  >()

  for (const source of [...sources].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const rows = await getCurrentDivisionVersionMap(
      source.db as HarbourReadableDb,
      options,
    )

    for (const [id, row] of rows) {
      const existing = mergedRows.get(id)
      const ownerShardKeys = [...(existing?.ownerShardKeys ?? []), source.key]

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
      const { ownerSortOrder: _ownerSortOrder, ...snapshot } = row

      return [id, snapshot] as const
    }),
  )
}

/**
 * Loads the current division state for a region and derives churn snapshots for comparison.
 */
export async function getCurrentDivisionVersionMap(
  db: HarbourReadableDb,
  options: {
    buildDivisionBaseHashInput: (base: DivisionHashInput) => DivisionHashInput
    normalizeDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
  },
) {
  const rows = (await db
    .select({
      id: historySchema.divisions.id,
      bbox: historySchema.divisions.bbox,
      cartography: historySchema.divisions.cartography,
      geometry: historySchema.divisions.geometry,
      hierarchy: historySchema.divisions.hierarchy,
      level: historySchema.divisions.level,
      sourceKeys: historySchema.divisions.sourceKeys,
      sources: historySchema.divisions.sources,
      type: historySchema.divisions.type,
      versionHash: historySchema.divisions.versionHash,
      wikidata: historySchema.divisions.wikidata,
    })
    .from(historySchema.divisions)
    .where(eq(historySchema.divisions.isCurrent, true))
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
        divisionId: historySchema.divisionsI18n.divisionId,
        isLocaleInferred: historySchema.divisionsI18n.isLocaleInferred,
        locale: historySchema.divisionsI18n.locale,
        name: historySchema.divisionsI18n.name,
        nameAlts: historySchema.divisionsI18n.nameAlts,
        nameRules: historySchema.divisionsI18n.nameRules,
        nameVariant: historySchema.divisionsI18n.nameVariant,
      })
      .from(historySchema.divisionsI18n)
      .where(
        and(
          inArray(historySchema.divisionsI18n.divisionId, divisionIdChunk),
          eq(historySchema.divisionsI18n.isCurrent, true),
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
          parentId: resolveParentDivisionIdFromHierarchy(row.hierarchy),
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
  const dataset = message.releaseId?.trim()
    ? await waitForDatasetRecord(metaDb, {
        releaseId: message.releaseId,
      })
    : await waitForDatasetRecord(metaDb, {
        releaseCode: message.releaseCode,
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
            sourceKeys: currentSchema.divisions.sourceKeys,
            wikidata: currentSchema.divisions.wikidata,
            hierarchy: currentSchema.divisions.hierarchy,
            cartography: currentSchema.divisions.cartography,
            sources: currentSchema.divisions.sources,
            geometry: currentSchema.divisions.geometry,
            bbox: currentSchema.divisions.bbox,
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

export async function countDivisionCurrentSnapshotRows(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  const row = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .get()

  return Number(row?.count ?? 0)
}

export async function countDivisionCurrentSnapshotI18nRows(
  db: HarbourReadableDb,
  snapshotId: string,
) {
  const row = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(currentSchema.divisionsI18n)
    .where(eq(currentSchema.divisionsI18n.snapshotId, snapshotId))
    .get()

  return Number(row?.count ?? 0)
}

export async function getDivisionCurrentSnapshotTraceState(
  db: HarbourReadableDb,
  snapshotId: string,
  divisionIds: string[],
) {
  const uniqueIds = [...new Set(divisionIds.filter(Boolean))]

  if (uniqueIds.length === 0) {
    return new Map<
      string,
      {
        i18nRowCount: number
        isPresent: boolean
      }
    >()
  }

  const baseRows = await db
    .select({
      id: currentSchema.divisions.id,
    })
    .from(currentSchema.divisions)
    .where(
      and(
        eq(currentSchema.divisions.snapshotId, snapshotId),
        inArray(currentSchema.divisions.id, uniqueIds),
      ),
    )
    .all()
  const i18nRows = await db
    .select({
      count: sql<number>`count(*)`,
      divisionId: currentSchema.divisionsI18n.divisionId,
    })
    .from(currentSchema.divisionsI18n)
    .where(
      and(
        eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
        inArray(currentSchema.divisionsI18n.divisionId, uniqueIds),
      ),
    )
    .groupBy(currentSchema.divisionsI18n.divisionId)
    .all()

  const i18nCountsByDivisionId = new Map(
    i18nRows.map(row => [row.divisionId, Number(row.count ?? 0)]),
  )

  return new Map(
    uniqueIds.map(id => [
      id,
      {
        i18nRowCount: i18nCountsByDivisionId.get(id) ?? 0,
        isPresent: baseRows.some(row => row.id === id),
      },
    ]),
  )
}

/**
 * Marks current version rows as closed at the given cohortKey.
 */
export async function closeCurrentDivisionVersions(
  db: HarbourWritableDb,
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
        .update(historySchema.divisions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisions.isCurrent, true),
            inArray(historySchema.divisions.id, divisionIdChunk),
          ),
        ),
    )

    statements.push(
      db
        .update(historySchema.divisionsI18n)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsI18n.isCurrent, true),
            inArray(historySchema.divisionsI18n.divisionId, divisionIdChunk),
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
        .update(historySchema.divisions)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          validToCohortKey: cohortKey,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisions.isCurrent, true),
            inArray(historySchema.divisions.id, missingIdChunk),
          ),
        ),
    )

    historyStatements.push(
      historyDb
        .update(historySchema.divisionsI18n)
        .set({
          isCurrent: false,
          validToSnapshotId: snapshotId,
          updatedAt: now,
        })
        .where(
          and(
            eq(historySchema.divisionsI18n.isCurrent, true),
            inArray(historySchema.divisionsI18n.divisionId, missingIdChunk),
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
              geometry: excluded('geometry'),
              hierarchy: excluded('hierarchy'),
              level: excluded('level'),
              sourceKeys: excluded('sourceKeys'),
              type: excluded('type'),
              sources: excluded('sources'),
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
    const statement = historyDb.insert(historySchema.divisions).values(
      chunk.map(row => ({
        id: row.id,
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
        sourceKeys: row.sourceKeys,
        wikidata: row.wikidata,
        hierarchy: row.hierarchy,
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
            target: [historySchema.divisions.id, historySchema.divisions.versionHash],
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
    const statement = db.insert(historySchema.divisionsI18n).values(chunk)

    statements.push(
      options?.assumeVersionRowsAbsent
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: [
              historySchema.divisionsI18n.divisionId,
              historySchema.divisionsI18n.versionHash,
              historySchema.divisionsI18n.locale,
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
              isLocaleInferred: excluded('isLocaleInferred'),
              updatedAt: excluded('updatedAt'),
            },
          }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}
