import { and, eq, inArray } from 'drizzle-orm'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type { DatasetProcessingMessage, RegionCode } from '@repo/core'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'
import {
  divisions,
  divisionsI18n,
  divisionsVersions,
  divisionsVersionsI18n,
} from '@repo/db/schema'
import {
  addLocalizedValue,
  asNonEmptyString,
  asString,
  chunkArray,
  createHash,
  getMaxRowsPerInsert,
  normalizeLocale,
  runWithWriteRetry,
  stableJsonStringify,
} from '../utils'

export type HarbourWorkerBucket = {
  head(key: string): Promise<{ size: number } | null>
  get(
    key: string,
    options?: {
      range?: {
        offset: number
        length: number
      }
    },
  ): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>
  } | null>
}

type DivisionBaseRecord = {
  id: string
  level: number
  otVersion: string | null
  otSubtype: string | null
  otAdminLevel: string | null
  otClass: string | null
  otWikidata: string | null
  otHierarchyJson: string | null
  hierarchyJson: string | null
  parentDivisionId: string | null
  otCartographyJson: string | null
  otBboxJson: string | null
  sourcesJson: string | null
}

type DivisionI18nRecord = {
  divisionId: string
  locale: string
  otName: string | null
  otNameVariantJson: string | null
  otNameAlts: string | null
  otLocalType: string | null
  hierarchyJson: string | null
}

type CurrentDivisionVersionRow = {
  id: string
  versionHash: string
}

export type ProcessDatasetResult = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  unchangedRows: number
}

const DIVISION_BATCH_SIZE = 128
const DIVISION_LEVEL_TOKENS = new Map<string, number>([
  ['country', 0],
  ['sar', 0],
  ['region', 1],
  ['state', 1],
  ['province', 1],
  ['district', 2],
  ['subdistrict', 3],
  ['sub-district', 3],
  ['sub_district', 3],
  ['borough', 3],
  ['neighbourhood', 4],
  ['neighborhood', 4],
  ['microhood', 5],
])

/**
 * Reads the division parquet file and applies current/versioned row updates.
 */
export async function processDivisionDataset(
  db: HarbourReadableDb & HarbourWritableDb,
  bucket: HarbourWorkerBucket,
  message: DatasetProcessingMessage,
): Promise<ProcessDatasetResult> {
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const currentRows = await getCurrentDivisionVersionMap(db, message.regionCode)
  const seenIds = new Set<string>()

  let processedRows = 0
  let insertedVersions = 0
  let unchangedRows = 0
  let localizedRows = 0

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE)) {
    for (const row of batch) {
      const normalized = normalizeDivisionRow(row)
      const versionHash = await createHash({
        base: normalized.base,
        i18n: normalized.i18n,
      })

      processedRows += 1
      localizedRows += normalized.i18n.length
      seenIds.add(normalized.base.id)

      const current = currentRows.get(normalized.base.id)

      if (current?.versionHash === versionHash) {
        unchangedRows += 1
        await replaceDivisionCurrentI18n(db, normalized.base.id, normalized.i18n)
        continue
      }

      if (current) {
        await closeCurrentDivisionVersion(
          db,
          message.regionCode,
          normalized.base.id,
          message.snapshotMonth,
        )
      }

      insertedVersions += 1

      await upsertDivisionCurrentState(db, normalized.base, normalized.i18n)
      await insertDivisionVersionRows(
        db,
        message,
        normalized.base,
        normalized.i18n,
        versionHash,
        new Date().toISOString(),
      )
    }
  }

  const deletedRows = await deleteMissingCurrentDivisions(
    db,
    message.regionCode,
    message.snapshotMonth,
    currentRows,
    seenIds,
  )

  return {
    deletedRows,
    insertedVersions,
    localizedRows,
    processedRows,
    unchangedRows,
  }
}

/**
 * Returns the active version hash for each current division in a region.
 */
async function getCurrentDivisionVersionMap(
  db: HarbourReadableDb,
  regionCode: RegionCode,
) {
  const rows = (await db
    .select({
      id: divisionsVersions.id,
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

  return new Map(rows.map(row => [row.id, row]))
}

/**
 * Marks the current division version as closed for the given snapshot month.
 */
async function closeCurrentDivisionVersion(
  db: HarbourWritableDb,
  regionCode: RegionCode,
  divisionId: string,
  snapshotMonth: string,
) {
  await runWithWriteRetry(() =>
    db
      .update(divisionsVersions)
      .set({
        isCurrent: false,
        validToMonth: snapshotMonth,
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
 * Closes and removes divisions that disappeared from the latest snapshot.
 */
async function deleteMissingCurrentDivisions(
  db: HarbourReadableDb & HarbourWritableDb,
  regionCode: RegionCode,
  snapshotMonth: string,
  currentRows: Map<string, CurrentDivisionVersionRow>,
  seenIds: Set<string>,
) {
  const missingIds = [...currentRows.keys()].filter(id => !seenIds.has(id))

  if (missingIds.length === 0) {
    return 0
  }

  await runWithWriteRetry(() =>
    db
      .update(divisionsVersions)
      .set({
        isCurrent: false,
        validToMonth: snapshotMonth,
      })
      .where(
        and(
          eq(divisionsVersions.regionCode, regionCode),
          eq(divisionsVersions.isCurrent, true),
          inArray(divisionsVersions.id, missingIds),
        ),
      )
      .run(),
  )

  await runWithWriteRetry(() =>
    db.delete(divisionsI18n).where(inArray(divisionsI18n.divisionId, missingIds)).run(),
  )
  await runWithWriteRetry(() =>
    db.delete(divisions).where(inArray(divisions.id, missingIds)).run(),
  )

  return missingIds.length
}

/**
 * Upserts the latest non-versioned division state and its localized rows.
 */
async function upsertDivisionCurrentState(
  db: HarbourWritableDb,
  base: DivisionBaseRecord,
  i18nRows: DivisionI18nRecord[],
) {
  await runWithWriteRetry(() =>
    db
      .insert(divisions)
      .values(base)
      .onConflictDoUpdate({
        target: divisions.id,
        set: {
          hierarchyJson: base.hierarchyJson,
          level: base.level,
          otAdminLevel: base.otAdminLevel,
          otBboxJson: base.otBboxJson,
          otCartographyJson: base.otCartographyJson,
          otClass: base.otClass,
          otHierarchyJson: base.otHierarchyJson,
          otSubtype: base.otSubtype,
          otVersion: base.otVersion,
          otWikidata: base.otWikidata,
          parentDivisionId: base.parentDivisionId,
          sourcesJson: base.sourcesJson,
        },
      })
      .run(),
  )

  await replaceDivisionCurrentI18n(db, base.id, i18nRows)
}

/**
 * Replaces the localized rows attached to the current division record.
 */
async function replaceDivisionCurrentI18n(
  db: HarbourWritableDb,
  divisionId: string,
  i18nRows: DivisionI18nRecord[],
) {
  await runWithWriteRetry(() =>
    db.delete(divisionsI18n).where(eq(divisionsI18n.divisionId, divisionId)).run(),
  )

  if (i18nRows.length === 0) {
    return
  }

  await insertDivisionsI18nInChunks(db, i18nRows)
}

/**
 * Inserts or reactivates a versioned division row plus localized variants.
 */
async function insertDivisionVersionRows(
  db: HarbourWritableDb,
  message: DatasetProcessingMessage,
  base: DivisionBaseRecord,
  i18nRows: DivisionI18nRecord[],
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
      })
      .onConflictDoUpdate({
        target: [divisionsVersions.id, divisionsVersions.versionHash],
        set: {
          createdAt: now,
          datasetId: message.datasetId,
          isCurrent: true,
          validFromMonth: message.snapshotMonth,
          validToMonth: null,
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
      hierarchyJson: row.hierarchyJson,
      locale: row.locale,
      otLocalType: row.otLocalType,
      otName: row.otName,
      otNameAlts: row.otNameAlts,
      otNameVariantJson: row.otNameVariantJson,
      versionHash,
    })),
  )
}

/**
 * Inserts current division i18n rows in chunks sized for D1 limits.
 */
async function insertDivisionsI18nInChunks(
  db: HarbourWritableDb,
  rows: DivisionI18nRecord[],
) {
  const chunkSize = getMaxRowsPerInsert(7)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() => db.insert(divisionsI18n).values(chunk).run())
  }
}

/**
 * Inserts versioned division i18n rows in chunks sized for D1 limits.
 */
async function insertDivisionVersionsI18nInChunks(
  db: HarbourWritableDb,
  rows: Array<
    DivisionI18nRecord & {
      versionHash: string
    }
  >,
) {
  const chunkSize = getMaxRowsPerInsert(8)

  for (const chunk of chunkArray(rows, chunkSize)) {
    await runWithWriteRetry(() =>
      db.insert(divisionsVersionsI18n).values(chunk).onConflictDoNothing().run(),
    )
  }
}

/**
 * Normalizes a raw parquet row into the base division record plus locale rows.
 */
function normalizeDivisionRow(row: Record<string, unknown>) {
  const id = asNonEmptyString(row.id)

  if (!id) {
    throw new Error('Division row is missing `id`.')
  }

  const parentDivisionId = asNonEmptyString(row.parent_division_id)
  const otSubtype = asNonEmptyString(row.subtype)
  const otClass = asNonEmptyString(row.class)
  const otAdminLevel = resolveAdminLevel(row)
  const level = resolveDivisionLevel({
    otAdminLevel,
    otClass,
    otSubtype,
    parentDivisionId,
  })
  const i18n = normalizeDivisionI18n(id, row.names, row.local_type, row.hierarchies)

  return {
    base: {
      hierarchyJson: stableJsonStringify(row.hierarchies),
      id,
      level,
      otAdminLevel,
      otBboxJson: stableJsonStringify(row.bbox),
      otCartographyJson: stableJsonStringify(row.cartography),
      otClass,
      otHierarchyJson: stableJsonStringify(row.hierarchies),
      otSubtype,
      otVersion: asString(row.version),
      otWikidata: asNonEmptyString(row.wikidata),
      parentDivisionId,
      sourcesJson: stableJsonStringify(row.sources),
    } satisfies DivisionBaseRecord,
    i18n,
  }
}

/**
 * Builds localized division name/type rows from mixed source fields.
 */
function normalizeDivisionI18n(
  divisionId: string,
  names: unknown,
  localType: unknown,
  hierarchies: unknown,
) {
  const localizedNames = new Map<string, Set<string>>()
  const localizedTypes = new Map<string, string>()

  collectLocalizedValues(
    names && typeof names === 'object'
      ? (names as Record<string, unknown>).common
      : undefined,
    localizedNames,
  )
  collectLocalizedValues(
    names && typeof names === 'object'
      ? (names as Record<string, unknown>).rules
      : undefined,
    localizedNames,
  )
  collectLocalizedScalarValues(localType, localizedTypes)

  const locales = new Set<string>([...localizedNames.keys(), ...localizedTypes.keys()])

  return [...locales].sort().map(locale => {
    const values = [...(localizedNames.get(locale) ?? [])]
    const [otName, ...alts] = values

    return {
      divisionId,
      hierarchyJson: stableJsonStringify(
        resolveHierarchyForLocale(hierarchies, locale),
      ),
      locale,
      otLocalType: localizedTypes.get(locale) ?? null,
      otName: otName ?? null,
      otNameAlts: alts.length > 0 ? alts.join('|') : null,
      otNameVariantJson: values.length > 0 ? stableJsonStringify(values) : null,
    } satisfies DivisionI18nRecord
  })
}

/**
 * Recursively collects localized text values from mixed object/array/string shapes.
 */
function collectLocalizedValues(
  value: unknown,
  target: Map<string, Set<string>>,
  localeHint?: string | null,
) {
  if (value === null || value === undefined) {
    return
  }

  if (typeof value === 'string') {
    const normalized = normalizeLocale(localeHint)

    if (normalized) {
      addLocalizedValue(target, normalized, value)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalizedValues(item, target, localeHint)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  const explicitLocale =
    normalizeLocale(asNonEmptyString(record.locale)) ??
    normalizeLocale(asNonEmptyString(record.language)) ??
    normalizeLocale(asNonEmptyString(record.lang)) ??
    normalizeLocale(localeHint)
  const directValue =
    asNonEmptyString(record.value) ??
    asNonEmptyString(record.name) ??
    asNonEmptyString(record.text)

  if (explicitLocale && directValue) {
    addLocalizedValue(target, explicitLocale, directValue)
    return
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedLocale = normalizeLocale(key) ?? explicitLocale
    collectLocalizedValues(nestedValue, target, nestedLocale)
  }
}

/**
 * Collects simple locale-to-string mappings such as localized type labels.
 */
function collectLocalizedScalarValues(value: unknown, target: Map<string, string>) {
  if (!value || typeof value !== 'object') {
    return
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const locale = normalizeLocale(key)
    const normalizedValue = asNonEmptyString(nestedValue)

    if (locale && normalizedValue) {
      target.set(locale, normalizedValue)
    }
  }
}

/**
 * Returns the localized hierarchy when present, otherwise the shared payload.
 */
function resolveHierarchyForLocale(hierarchies: unknown, locale: string) {
  if (!hierarchies || typeof hierarchies !== 'object') {
    return null
  }

  if (Array.isArray(hierarchies)) {
    return hierarchies
  }

  const record = hierarchies as Record<string, unknown>
  return record[locale] ?? record
}

/**
 * Resolves the source admin-level token from normalized or raw fields.
 */
function resolveAdminLevel(row: Record<string, unknown>) {
  const norms = row.norms

  if (norms && typeof norms === 'object') {
    const record = norms as Record<string, unknown>
    const direct =
      asNonEmptyString(record.admin_level) ??
      asNonEmptyString(record.adminLevel) ??
      asNonEmptyString(record.level)

    if (direct) {
      return direct
    }
  }

  return asNonEmptyString(row.admin_level) ?? asNonEmptyString(row.adminLevel)
}

/**
 * Maps source hints to a coarse numeric division level.
 */
function resolveDivisionLevel(input: {
  otSubtype: string | null
  otClass: string | null
  otAdminLevel: string | null
  parentDivisionId: string | null
}) {
  const candidates = [input.otSubtype, input.otClass, input.otAdminLevel]
    .filter(Boolean)
    .map(value => value?.toLowerCase() ?? '')

  for (const candidate of candidates) {
    for (const [token, level] of DIVISION_LEVEL_TOKENS.entries()) {
      if (candidate.includes(token)) {
        return level
      }
    }
  }

  return input.parentDivisionId ? 1 : 0
}
