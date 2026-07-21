import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DatasetProcessingMessage } from '../../types'
import { datasetVariantForSource, identityModeForSource } from '../../codes'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertSnapshotSource,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  waitForDatasetRecord,
} from '../../lib/db/metaRegistry'
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
import { recordSnapshotVersionChanges } from './snapshotVersionChanges'

const CURRENT_DIVISION_COLUMN_COUNT = 13
const CURRENT_DIVISION_I18N_COLUMN_COUNT = 10
const HISTORY_DIVISION_VERSION_COLUMN_COUNT = 16
const HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT = 13
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
  localisedRows: DivisionI18nPayload[]
  ownerShardKeys?: string[]
  parentId: string | null
  type: string
  versionHash: string
}

export type DivisionVersionInsertContext = {
  releaseId: string
  snapshotId: string
  cohortKey: string
  parentSnapshotId: string | null
  snapshotLineageId: string
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
    normaliseDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
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
    normaliseDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
  },
) {
  const rows = (await db
    .select({
      id: historySchema.divisions.id,
      bbox: historySchema.divisions.bbox,
      cartography: historySchema.divisions.cartography,
      geometry: historySchema.divisions.geometry,
      hierarchy: historySchema.divisions.hierarchy,
      identifiers: historySchema.divisions.identifiers,
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
      const localisedRows = [...(i18nByDivisionId.get(row.id) ?? [])]
        .map(options.normaliseDivisionI18nSnapshotRow)
        .sort((left, right) => left.locale.localeCompare(right.locale))

      return [
        row.id,
        {
          churnHash: await createHash({
            base: options.buildDivisionBaseHashInput(row),
            i18n: localisedRows,
          }),
          geometry: row.geometry as GeoJsonGeometry | null,
          id: row.id,
          localisedRows: localisedRows,
          parentId: resolveParentDivisionIdFromHierarchy(row.hierarchy),
          type: row.type,
          versionHash: row.versionHash,
        } satisfies DivisionVersionSnapshot,
      ] as const
    }),
  )

  return new Map(snapshots)
}

/** Loads the exact materialised parent branch from current storage. */
export async function getDivisionVersionMapForSnapshot(
  db: HarbourReadableDb,
  snapshotId: string,
  options: {
    buildDivisionBaseHashInput: (base: DivisionHashInput) => DivisionHashInput
    normaliseDivisionI18nSnapshotRow: (row: DivisionI18nPayload) => DivisionI18nPayload
  },
  ownerShardKeys: string[] = [],
) {
  const rows = (await db
    .select({
      id: currentSchema.divisions.id,
      bbox: currentSchema.divisions.bbox,
      cartography: currentSchema.divisions.cartography,
      geometry: currentSchema.divisions.geometry,
      hierarchy: currentSchema.divisions.hierarchy,
      identifiers: currentSchema.divisions.identifiers,
      level: currentSchema.divisions.level,
      sourceKeys: currentSchema.divisions.sourceKeys,
      sources: currentSchema.divisions.sources,
      type: currentSchema.divisions.type,
      wikidata: currentSchema.divisions.wikidata,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()) as Array<Omit<CurrentDivisionVersionRow, 'versionHash'>>

  const i18nRows = (await db
    .select({
      divisionId: currentSchema.divisionsI18n.divisionId,
      isLocaleInferred: currentSchema.divisionsI18n.isLocaleInferred,
      locale: currentSchema.divisionsI18n.locale,
      name: currentSchema.divisionsI18n.name,
      nameAlts: currentSchema.divisionsI18n.nameAlts,
      nameRules: currentSchema.divisionsI18n.nameRules,
      nameVariant: currentSchema.divisionsI18n.nameVariant,
    })
    .from(currentSchema.divisionsI18n)
    .where(eq(currentSchema.divisionsI18n.snapshotId, snapshotId))
    .all()) as DivisionI18nPayload[]
  const i18nById = new Map<string, DivisionI18nPayload[]>()
  for (const row of i18nRows) {
    const localised = i18nById.get(row.divisionId) ?? []
    localised.push(row)
    i18nById.set(row.divisionId, localised)
  }

  return new Map(
    await Promise.all(
      rows.map(async row => {
        const localisedRows = (i18nById.get(row.id) ?? [])
          .map(options.normaliseDivisionI18nSnapshotRow)
          .sort((a, b) => a.locale.localeCompare(b.locale))
        return [
          row.id,
          {
            churnHash: await createHash({
              base: options.buildDivisionBaseHashInput(row),
              i18n: localisedRows,
            }),
            geometry: row.geometry as GeoJsonGeometry | null,
            id: row.id,
            localisedRows,
            ownerShardKeys,
            parentId: resolveParentDivisionIdFromHierarchy(row.hierarchy),
            type: row.type,
            versionHash: await createHash(options.buildDivisionBaseHashInput(row)),
          } satisfies DivisionVersionSnapshot,
        ] as const
      }),
    ),
  )
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
    datasetCode: dataset.datasetCode,
    datasetId: dataset.datasetId,
    sourceReleaseId: dataset.releaseId,
    variant: datasetVariantForSource(message.type, dataset.source, {
      cohortKey: dataset.cohortKey,
      datasetCode: dataset.datasetCode,
      sourceVersion: dataset.sourceVersion,
    }),
    identityMode: identityModeForSource(dataset.source),
  })

  const year = message.sourceVersion.slice(0, 4)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const [historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(
      metaDb,
      'history',
      environment,
      message.regionCode,
      year,
    ),
    resolveShardForTypeRegionYear(
      metaDb,
      'source',
      environment,
      message.regionCode,
      year,
    ),
  ])

  if (!currentShard || !historyShard || !sourceShard) {
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
  await upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id)
  await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)

  return {
    releaseId: dataset.releaseId,
    snapshotId: snapshot.id,
    cohortKey: message.cohortKey,
    parentSnapshotId: snapshot.parentSnapshotId,
    snapshotLineageId: snapshot.snapshotLineageId,
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
            identifiers: currentSchema.divisions.identifiers,
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
  db: HarbourReadableDb & HarbourWritableDb,
  divisionIds: string[],
  snapshotId: string,
  cohortKey: string,
  sourceReleaseId?: string,
) {
  if (divisionIds.length === 0) {
    return
  }

  const now = new Date().toISOString()
  const chunkSize = getMaxItemsPerInClause(1, 6)
  const statements = []
  const currentI18nRows: Array<{ divisionId: string; locale: string }> = []

  for (const divisionIdChunk of chunkArray(divisionIds, chunkSize)) {
    currentI18nRows.push(
      ...(await db
        .select({
          divisionId: historySchema.divisionsI18n.divisionId,
          locale: historySchema.divisionsI18n.locale,
        })
        .from(historySchema.divisionsI18n)
        .where(
          and(
            eq(historySchema.divisionsI18n.isCurrent, true),
            inArray(historySchema.divisionsI18n.divisionId, divisionIdChunk),
          ),
        )
        .all()),
    )
    statements.push(
      db
        .update(historySchema.divisions)
        .set({
          isCurrent: false,
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
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId,
    recordType: 'division',
    operation: 'delete',
    changes: divisionIds.map(recordId => ({ recordId })),
  })
  await recordSnapshotVersionChanges(db, {
    snapshotId,
    sourceReleaseId,
    recordType: 'divisionI18n',
    operation: 'delete',
    changes: currentI18nRows.map(row => ({
      recordId: row.divisionId,
      locale: row.locale,
    })),
  })
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
  await recordSnapshotVersionChanges(historyDb, {
    snapshotId,
    recordType: 'division',
    operation: 'delete',
    changes: missingIds.map(recordId => ({ recordId })),
  })

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
              identifiers: excluded('identifiers'),
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
        isCurrent: true,
        level: row.level,
        type: row.type,
        geometry: row.geometry,
        bbox: row.bbox,
        sourceKeys: row.sourceKeys,
        wikidata: row.wikidata,
        hierarchy: row.hierarchy,
        identifiers: row.identifiers,
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
              updatedAt: excluded('updatedAt'),
            },
          }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(historyDb, baseStatements)
  await recordSnapshotVersionChanges(historyDb, {
    snapshotId: context.snapshotId,
    sourceReleaseId: context.releaseId,
    recordType: 'division',
    operation: 'upsert',
    changes: baseRows.map(row => ({
      recordId: row.id,
      versionHash: row.versionHash,
    })),
  })

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
        isCurrent: true,
        versionHash: row.versionHash,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      options,
    )
    await recordSnapshotVersionChanges(historyDb, {
      snapshotId: context.snapshotId,
      sourceReleaseId: context.releaseId,
      recordType: 'divisionI18n',
      operation: 'upsert',
      changes: i18nRows.map(row => ({
        recordId: row.divisionId,
        locale: row.locale,
        versionHash: row.versionHash,
      })),
    })
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
