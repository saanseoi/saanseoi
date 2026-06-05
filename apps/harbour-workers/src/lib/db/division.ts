import { and, eq, inArray } from 'drizzle-orm'

import type { DatasetProcessingMessage, RegionCode } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type {
  CurrentDivisionVersionRow,
  DatasetStatsRow,
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionI18nRow,
} from '@repo/db/schema'

import {
  divisions,
  divisionsI18n,
  divisionsVersions,
  divisionsVersionsI18n,
  stats,
} from '@repo/db/schema'

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
  geometryJson: string | null
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
      id: divisionsVersions.id,
      hierarchyJson: divisionsVersions.hierarchyJson,
      level: divisionsVersions.level,
      otBboxJson: divisionsVersions.otBboxJson,
      otCartographyJson: divisionsVersions.otCartographyJson,
      otClass: divisionsVersions.otClass,
      otGeometryJson: divisionsVersions.otGeometryJson,
      otHierarchyJson: divisionsVersions.otHierarchyJson,
      otPopulation: divisionsVersions.otPopulation,
      otSubtype: divisionsVersions.otSubtype,
      otVersion: divisionsVersions.otVersion,
      otWikidata: divisionsVersions.otWikidata,
      parentDivisionId: divisionsVersions.parentDivisionId,
      sourcesJson: divisionsVersions.sourcesJson,
      type: divisionsVersions.type,
      versionHash: divisionsVersions.versionHash,
    })
    .from(divisionsVersions)
    .where(
      and(
        eq(divisionsVersions.regionCode, regionCode),
        eq(divisionsVersions.isCurrent, true),
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
        divisionId: divisionsI18n.divisionId,
        isLocaleInferred: divisionsI18n.isLocaleInferred,
        locale: divisionsI18n.locale,
        otLocalType: divisionsI18n.otLocalType,
        otName: divisionsI18n.otName,
        otNameAlts: divisionsI18n.otNameAlts,
        otNameRulesJson: divisionsI18n.otNameRulesJson,
        otNameVariantJson: divisionsI18n.otNameVariantJson,
      })
      .from(divisionsI18n)
      .where(inArray(divisionsI18n.divisionId, divisionIdChunk))
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
          geometryJson: row.otGeometryJson,
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
  snapshotMonth: string,
) {
  const now = new Date().toISOString()

  await runWithWriteRetry(() =>
    db
      .update(divisionsVersions)
      .set({
        isCurrent: false,
        validToMonth: snapshotMonth,
        updatedAt: now,
      })
      .where(
        and(
          eq(divisionsVersions.regionCode, regionCode),
          eq(divisionsVersions.id, divisionId),
          eq(divisionsVersions.isCurrent, true),
        ),
      )
      .run(),
  )
}

/**
 * Closes and deletes divisions that were previously current but not present in the latest snapshot.
 */
export async function deleteMissingCurrentDivisions(
  db: HarbourReadableDb & HarbourWritableDb,
  regionCode: RegionCode,
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
      db
        .update(divisionsVersions)
        .set({
          isCurrent: false,
          validToMonth: snapshotMonth,
          updatedAt: now,
        })
        .where(
          and(
            eq(divisionsVersions.regionCode, regionCode),
            eq(divisionsVersions.isCurrent, true),
            inArray(divisionsVersions.id, missingIdChunk),
          ),
        )
        .run(),
    )

    await runWithWriteRetry(() =>
      db
        .delete(divisionsI18n)
        .where(inArray(divisionsI18n.divisionId, missingIdChunk))
        .run(),
    )
    await runWithWriteRetry(() =>
      db.delete(divisions).where(inArray(divisions.id, missingIdChunk)).run(),
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
      .insert(divisions)
      .values(base)
      .onConflictDoUpdate({
        target: divisions.id,
        set: {
          hierarchyJson: base.hierarchyJson,
          level: base.level,
          otGeometryJson: base.otGeometryJson,
          otPopulation: base.otPopulation,
          type: base.type,
          otBboxJson: base.otBboxJson,
          otCartographyJson: base.otCartographyJson,
          otClass: base.otClass,
          otHierarchyJson: base.otHierarchyJson,
          otSubtype: base.otSubtype,
          otVersion: base.otVersion,
          otWikidata: base.otWikidata,
          parentDivisionId: base.parentDivisionId,
          sourcesJson: base.sourcesJson,
          updatedAt: now,
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
    db.delete(divisionsI18n).where(eq(divisionsI18n.divisionId, divisionId)).run(),
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
  db: HarbourWritableDb,
  message: DatasetProcessingMessage,
  base: DivisionBaseRecord,
  i18nRows: DivisionI18nPayload[],
  versionHash: string,
  now: string,
) {
  const otVersionHash = await createHash(base.otVersion ?? '')

  await runWithWriteRetry(() =>
    db
      .insert(divisionsVersions)
      .values({
        ...base,
        createdAt: now,
        datasetId: message.datasetId,
        isCurrent: true,
        otVersionHash,
        regionCode: message.regionCode,
        validFromMonth: message.snapshotMonth,
        validToMonth: null,
        versionHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [divisionsVersions.id, divisionsVersions.versionHash],
        set: {
          datasetId: message.datasetId,
          isCurrent: true,
          validFromMonth: message.snapshotMonth,
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
    db,
    i18nRows.map(row => ({
      divisionId: row.divisionId,
      isLocaleInferred: row.isLocaleInferred,
      locale: row.locale,
      otLocalType: row.otLocalType,
      otName: row.otName,
      otNameAlts: row.otNameAlts,
      otNameRulesJson: row.otNameRulesJson,
      otNameVariantJson: row.otNameVariantJson,
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
    await runWithWriteRetry(() => db.insert(divisionsI18n).values(chunk).run())
  }
}

/**
 * Inserts versioned division i18n rows in batches and ignores duplicate version entries.
 */
async function insertDivisionVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<
    NewDivisionI18nRow & {
      versionHash: string
    }
  >,
) {
  const chunkSize = getMaxRowsPerInsert(11)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      db.insert(divisionsVersionsI18n).values(chunk).onConflictDoNothing().run(),
    )
  }
}

/**
 * Replaces all dataset-level stats rows for a dataset snapshot.
 */
export async function replaceDatasetStats(
  db: HarbourWritableDb,
  datasetId: string,
  rows: DatasetStatsRow[],
) {
  await runWithWriteRetry(() =>
    db.delete(stats).where(eq(stats.datasetId, datasetId)).run(),
  )

  if (rows.length === 0) {
    return 0
  }

  const chunkSize = getMaxRowsPerInsert(11)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      db
        .insert(stats)
        .values(
          chunk.map(row => ({
            ...row,
            datasetId,
            id: crypto.randomUUID(),
          })),
        )
        .run(),
    )
  }

  return rows.length
}
