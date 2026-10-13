import { currentSchema, getTableColumns, historySchema } from '@repo/db'
import type {
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionI18nRow,
  NewDivisionRow,
} from '@repo/db/currentSchema'
import type { CurrentDivisionVersionRow } from '@repo/db/historySchema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { datasetVariantForSource, identityModeForSource } from '../../codes'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssembly,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import type { DatasetProcessingMessage } from '../../types'
import type { GeoJsonGeometry } from '../geojson'
import { currentRowChangedSql } from '../services/publication/currentWrites'

import {
  chunkArray,
  createHash,
  getMaxItemsPerInClause,
  getMaxRowsPerInsert,
  runStatementsInGroupsWithWriteRetry,
} from '../utils'

const CURRENT_DIVISION_COLUMN_COUNT = Object.keys(
  getTableColumns(currentSchema.divisions),
).length
const CURRENT_DIVISION_I18N_COLUMN_COUNT = Object.keys(
  getTableColumns(currentSchema.divisionsI18n),
).length
const HISTORY_DIVISION_VERSION_COLUMN_COUNT = Object.keys(
  getTableColumns(historySchema.divisions),
).length
const HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT = Object.keys(
  getTableColumns(historySchema.divisionsI18n),
).length
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
  resourceReleaseId: string
  snapshotId: string
  cohortKey: string
  parentSnapshotId: string | null
  snapshotLineageId: string
}

function excluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

const divisionPayloadColumns = [
  'divisionCode',
  'cartography',
  'geometry',
  'hierarchies',
  'identifiers',
  'level',
  'category',
  'class',
  'sources',
] as const
const divisionI18nPayloadColumns = [
  'name',
  'nameVariant',
  'nameAlts',
  'nameRules',
  'nameProvenance',
  'isLocaleInferred',
] as const

function resolveParentDivisionIdFromHierarchy(hierarchy: unknown): string | null {
  const paths = (hierarchy as import('@repo/db').DivisionHierarchies | null)?.full ?? []
  const ids = [...new Set(paths.flatMap(path => path.at(-1)?.id ?? []))].sort()
  return ids.length === 1 ? ids[0]! : ids.length ? JSON.stringify(ids) : null
}

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
      divisionCode: currentSchema.divisions.divisionCode,
      cartography: currentSchema.divisions.cartography,
      geometry: currentSchema.divisions.geometry,
      hierarchies: currentSchema.divisions.hierarchies,
      identifiers: currentSchema.divisions.identifiers,
      level: currentSchema.divisions.level,
      sources: currentSchema.divisions.sources,
      category: currentSchema.divisions.category,
      class: currentSchema.divisions.class,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()) as Array<Omit<CurrentDivisionVersionRow, 'versionHash'>>

  const i18nRows = (await db
    .select({
      divisionId: currentSchema.divisionsI18n.divisionId,
      isLocaleInferred: currentSchema.divisionsI18n.isLocaleInferred,
      nameProvenance: currentSchema.divisionsI18n.nameProvenance,
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
            parentId: resolveParentDivisionIdFromHierarchy(row.hierarchies),
            type: row.class,
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
  options: { rebuildPublishedSnapshot?: boolean } = {},
): Promise<DivisionVersionInsertContext> {
  const dataset = message.resourceReleaseId?.trim()
    ? await waitForDatasetRecord(metaDb, {
        resourceReleaseId: message.resourceReleaseId,
      })
    : await waitForDatasetRecord(metaDb, {
        releaseCode: message.releaseCode,
      })

  if (!dataset) {
    throw new Error(
      `Release not found: ${message.resourceReleaseId ?? message.releaseCode ?? message.datasetId}`,
    )
  }

  const snapshot = await ensureDraftSnapshotForRelease(metaDb, message.resourceType, {
    regionCode: dataset.regionCode,
    cohortKey: dataset.cohortKey,
    datasetCode: dataset.datasetCode,
    datasetId: dataset.datasetId,
    sourceReleaseId: dataset.resourceReleaseId,
    variant: datasetVariantForSource(message.resourceType, dataset.source, {
      cohortKey: dataset.cohortKey,
      datasetCode: dataset.datasetCode,
      sourceVariant: dataset.sourceVariant,
      sourceVersion: dataset.sourceVersion,
    }),
    identityMode: identityModeForSource(dataset.source),
    rebuildPublishedSnapshot: options.rebuildPublishedSnapshot,
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
    dataset.resourceReleaseId,
    'primary',
    {
      anchorReleaseId: dataset.resourceReleaseId,
      selectedByRule: 'assembly:division:source-release:v1',
      selectionMode: 'exact_ref',
    },
  )
  await recordSnapshotAssembly(metaDb, {
    snapshotId: snapshot.id,
    resourceType: message.resourceType,
    anchorReleaseId: dataset.resourceReleaseId,
  })
  await upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, historyShard.id)
  await upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, sourceShard.id)
  await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)

  return {
    resourceReleaseId: dataset.resourceReleaseId,
    snapshotId: snapshot.id,
    cohortKey: message.cohortKey,
    parentSnapshotId: snapshot.parentSnapshotId,
    snapshotLineageId: snapshot.snapshotLineageId,
  }
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

  const idChunks = chunkArray(uniqueIds, getMaxItemsPerInClause(1, 1))
  const baseRows = (
    await Promise.all(
      idChunks.map(ids =>
        db
          .select({
            id: currentSchema.divisions.id,
          })
          .from(currentSchema.divisions)
          .where(
            and(
              eq(currentSchema.divisions.snapshotId, snapshotId),
              inArray(currentSchema.divisions.id, ids),
            ),
          )
          .all(),
      ),
    )
  ).flat()
  const i18nRows = (
    await Promise.all(
      idChunks.map(ids =>
        db
          .select({
            count: sql<number>`count(*)`,
            divisionId: currentSchema.divisionsI18n.divisionId,
          })
          .from(currentSchema.divisionsI18n)
          .where(
            and(
              eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
              inArray(currentSchema.divisionsI18n.divisionId, ids),
            ),
          )
          .groupBy(currentSchema.divisionsI18n.divisionId)
          .all(),
      ),
    )
  ).flat()

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
              divisionCode: excluded('divisionCode'),
              cartography: excluded('cartography'),
              geometry: excluded('geometry'),
              hierarchies: excluded('hierarchies'),
              identifiers: excluded('identifiers'),
              level: excluded('level'),
              category: excluded('category'),
              class: excluded('class'),
              sources: excluded('sources'),
              updatedAt: excluded('updatedAt'),
            },
            setWhere: currentRowChangedSql('divisions', divisionPayloadColumns),
          }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}

/**
 * Reconciles only changed or removed localisations within the current scope.
 */
export async function replaceDivisionCurrentI18n(
  db: HarbourReadableDb & HarbourWritableDb,
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
    const deleteStatements = []
    const selected = new Set(
      rows.map(row => JSON.stringify([row.divisionId, row.locale])),
    )
    for (const divisionIdChunk of chunkArray(
      divisionIds,
      getMaxItemsPerInClause(1, 1),
    )) {
      const existing = await db
        .select({
          divisionId: currentSchema.divisionsI18n.divisionId,
          locale: currentSchema.divisionsI18n.locale,
        })
        .from(currentSchema.divisionsI18n)
        .where(
          and(
            eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
            inArray(currentSchema.divisionsI18n.divisionId, divisionIdChunk),
          ),
        )
        .all()
      for (const row of existing) {
        if (selected.has(JSON.stringify([row.divisionId, row.locale]))) continue
        deleteStatements.push(
          db
            .delete(currentSchema.divisionsI18n)
            .where(
              and(
                eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
                eq(currentSchema.divisionsI18n.divisionId, row.divisionId),
                eq(currentSchema.divisionsI18n.locale, row.locale),
              ),
            ),
        )
      }
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
      nameProvenance?: DivisionI18nPayload['nameProvenance']
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
  if (baseRows.length === 0 && i18nRows.length === 0) {
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
        sourceReleaseId: context.resourceReleaseId,
        snapshotId: context.snapshotId,
        isCurrent: true,
        level: row.level,
        class: row.class,
        category: row.category,
        divisionCode: row.divisionCode,
        geometry: row.geometry,
        hierarchies: row.hierarchies,
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
        : statement.onConflictDoNothing({
            target: [historySchema.divisions.id, historySchema.divisions.snapshotId],
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
        nameProvenance: row.nameProvenance ?? null,
        locale: row.locale,
        name: row.name,
        nameAlts: row.nameAlts,
        nameRules: row.nameRules,
        nameVariant: row.nameVariant,
        sourceReleaseId: context.resourceReleaseId,
        snapshotId: context.snapshotId,
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
      options?.assumeSnapshotEmpty
        ? statement.onConflictDoNothing()
        : statement.onConflictDoUpdate({
            target: [
              currentSchema.divisionsI18n.snapshotId,
              currentSchema.divisionsI18n.divisionId,
              currentSchema.divisionsI18n.locale,
            ],
            set: {
              name: excluded('name'),
              nameVariant: excluded('nameVariant'),
              nameAlts: excluded('nameAlts'),
              nameRules: excluded('nameRules'),
              nameProvenance: excluded('nameProvenance'),
              isLocaleInferred: excluded('isLocaleInferred'),
              updatedAt: excluded('updatedAt'),
            },
            setWhere: currentRowChangedSql('divisionsI18n', divisionI18nPayloadColumns),
          }),
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
    nameProvenance:
      | 'provided'
      | 'inferred'
      | 'ai-translated'
      | 'human-translated'
      | null
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
  const chunkSize = getMaxRowsPerInsert(HISTORY_DIVISION_I18N_VERSION_COLUMN_COUNT, 2)
  const statements = []

  for (const chunk of chunkArray(rows, chunkSize)) {
    const statement = db.insert(historySchema.divisionsI18n).values(chunk)

    statements.push(
      options?.assumeVersionRowsAbsent
        ? statement.onConflictDoNothing()
        : statement.onConflictDoNothing({
            target: [
              historySchema.divisionsI18n.divisionId,
              historySchema.divisionsI18n.snapshotId,
              historySchema.divisionsI18n.locale,
            ],
          }),
    )
  }

  await runStatementsInGroupsWithWriteRetry(db, statements)
}
