import { and, eq, inArray } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import {
  getDatasetRecordByReleaseId,
  resolveReleaseSetForType,
  resolveShardForKindRegionYear,
  upsertReleaseSetMember,
  upsertReleaseSetShardAssignment,
  upsertReleaseShardAssignment,
} from '@repo/core/db/meta-repository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
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
  runWithWriteRetry,
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
  const chunkSize = getMaxItemsPerInClause()

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
          geometry: row.geometry,
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

/**
 * Marks the current version row for a division as closed at the given snapshot month.
 */
export async function closeCurrentDivisionVersion(
  db: HarbourWritableDb,
  regionCode: RegionCode,
  divisionId: string,
  releaseSetId: string,
  snapshotMonth: string,
) {
  const now = new Date().toISOString()

  await runWithWriteRetry(() =>
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
          eq(historySchema.divisionsVersions.id, divisionId),
          eq(historySchema.divisionsVersions.isCurrent, true),
        ),
      )
      .run(),
  )
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
  const chunkSize = getMaxItemsPerInClause()

  for (const missingIdChunk of chunkArray(missingIds, chunkSize)) {
    await runWithWriteRetry(() =>
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
        )
        .run(),
    )

    await runWithWriteRetry(() =>
      currentDb
        .delete(currentSchema.divisionsI18n)
        .where(inArray(currentSchema.divisionsI18n.divisionId, missingIdChunk))
        .run(),
    )
    await runWithWriteRetry(() =>
      currentDb
        .delete(currentSchema.divisions)
        .where(inArray(currentSchema.divisions.id, missingIdChunk))
        .run(),
    )
  }

  return missingIds.length
}

/**
 * Upserts the current division row and replaces its current localized name rows.
 */
export async function upsertDivisionCurrentState(
  db: HarbourWritableDb,
  base: DivisionBaseRecord,
  i18nRows: DivisionI18nPayload[],
) {
  const now = base.updatedAt

  await runWithWriteRetry(() =>
    db
      .insert(currentSchema.divisions)
      .values(base)
      .onConflictDoUpdate({
        target: currentSchema.divisions.id,
        set: {
          bbox: base.bbox,
          cartography: base.cartography,
          class: base.class,
          geometry: base.geometry,
          hierarchy: base.hierarchy,
          level: base.level,
          population: base.population,
          type: base.type,
          parentDivisionId: base.parentDivisionId,
          sources: base.sources,
          subtype: base.subtype,
          updatedAt: now,
          wikidata: base.wikidata,
        },
      })
      .run(),
  )

  await replaceDivisionCurrentI18n(db, base.id, i18nRows, now)
}

/**
 * Replaces the current i18n rows for a division with a fresh snapshot.
 */
export async function replaceDivisionCurrentI18n(
  db: HarbourWritableDb,
  divisionId: string,
  i18nRows: DivisionI18nPayload[],
  now: string,
) {
  await runWithWriteRetry(() =>
    db
      .delete(currentSchema.divisionsI18n)
      .where(eq(currentSchema.divisionsI18n.divisionId, divisionId))
      .run(),
  )

  if (i18nRows.length === 0) {
    return
  }

  await insertDivisionsI18nInChunks(
    db,
    i18nRows.map(row => ({
      ...row,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

/**
 * Inserts the versioned division row and its versioned i18n rows for a dataset snapshot.
 */
export async function insertDivisionVersionRows(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  historyDb: HarbourReadableDb & HarbourWritableDb,
  message: DatasetProcessingMessage,
  base: DivisionBaseRecord,
  i18nRows: DivisionI18nPayload[],
  versionHash: string,
  now: string,
  environment: 'preview' | 'production',
) {
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

  await runWithWriteRetry(() =>
    historyDb
      .insert(historySchema.divisionsVersions)
      .values({
        ...base,
        createdAt: now,
        isCurrent: true,
        releaseId: dataset.releaseId,
        regionCode: message.regionCode,
        validFromMonth: message.snapshotMonth,
        validFromReleaseSetId: releaseSet.id,
        validToReleaseSetId: null,
        validToMonth: null,
        versionHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          historySchema.divisionsVersions.id,
          historySchema.divisionsVersions.versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId: dataset.releaseId,
          validFromMonth: message.snapshotMonth,
          validFromReleaseSetId: releaseSet.id,
          validToReleaseSetId: null,
          validToMonth: null,
          updatedAt: now,
        },
      })
      .run(),
  )

  if (i18nRows.length === 0) {
    return
  }

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
      releaseId: dataset.releaseId,
      validFromReleaseSetId: releaseSet.id,
      validToReleaseSetId: null,
      isCurrent: true,
      versionHash,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

/**
 * Inserts current division i18n rows in batches that fit SQLite parameter limits.
 */
async function insertDivisionsI18nInChunks(
  db: HarbourWritableDb,
  rows: NewDivisionI18nRow[],
) {
  const chunkSize = getMaxRowsPerInsert(10)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      db.insert(currentSchema.divisionsI18n).values(chunk).run(),
    )
  }
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
  const chunkSize = getMaxRowsPerInsert(14)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      db
        .insert(historySchema.divisionsVersionsI18n)
        .values(chunk)
        .onConflictDoNothing()
        .run(),
    )
  }
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

  await runWithWriteRetry(() =>
    metaDb
      .delete(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, dataset.releaseId))
      .run(),
  )

  if (rows.length === 0) {
    return 0
  }

  const chunkSize = getMaxRowsPerInsert(11)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      metaDb
        .insert(metaSchema.stats)
        .values(
          chunk.map(row => ({
            ...row,
            releaseId: dataset.releaseId,
            id: crypto.randomUUID(),
          })),
        )
        .run(),
    )
  }

  return rows.length
}
