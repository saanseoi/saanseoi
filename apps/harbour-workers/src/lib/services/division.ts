import type { DatasetProcessingMessage } from '@repo/core'
import { resolveReleaseSetForType } from '@repo/core/db/meta-repository'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  sourceSchema,
  SourceDatabase,
} from '@repo/db'
import type { DivisionI18nPayload, DivisionRow } from '@repo/db/currentSchema'
import type { GeoJsonGeometry } from '../geojson'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'
import {
  closeCurrentDivisionVersion,
  deleteMissingCurrentDivisions,
  getCurrentDivisionVersionMap,
  insertDivisionVersionRows,
  replaceDatasetStats,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentState,
} from '../db/division'
import {
  buildSourceDatasetId,
  buildSourceReleaseId,
  insertSourceOvertureDivisionI18n,
  insertSourceOvertureDivisions,
  resetSourceReleaseRows,
} from '../db/source'
import {
  buildChurnCounts,
  buildChurnStatsRows,
  buildLocaleStatsRows,
  buildQualityCounts,
  buildQualityStatsRows,
  createLocaleStatsAccumulator,
  hasLocaleRegression,
  hasNameRegression,
  updateLocaleStatsAccumulator,
} from './stats'
import {
  addLocalizedValue,
  asNonEmptyString,
  createHash,
  inferLocale,
  normalizeLocale,
  stableJsonStringify,
} from '../utils'

import type { DivisionVersionSnapshot } from '../db/division'

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

export type ProcessDatasetResult = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  statsRows: number
  unchangedRows: number
}

type DivisionNameRuleRecord = {
  value: string
  variant: string | null
}

const DIVISION_BATCH_SIZE = 128
const DIVISION_LEVEL_TOKENS = new Map<string, number>([
  ['country', 0],
  ['sar', 0],
  ['dependency', 0],
  ['city', 1],
  ['state', 1],
  ['province', 1],
  ['district', 2],
  ['region', 2],
  ['subdistrict', 3],
  ['borough', 3],
  ['town', 3],
  ['macrohood', 4],
  ['neighbourhood', 5],
  ['neighborhood', 5],
  ['village', 5],
  ['microhood', 6],
  ['hamlet', 6],
])
const HONG_KONG_AREA_NAMES = new Set([
  'hong kong island',
  '香港島',
  'kowloon',
  '九龍',
  'new territories',
  '新界',
])

/**
 * Reads the division parquet file and applies current/versioned row updates.
 */
export async function processDivisionDataset(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket,
  message: DatasetProcessingMessage,
  sourceDb?: SourceDatabase,
): Promise<ProcessDatasetResult> {
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const environment = resolveShardEnvironment()
  const releaseSet = await resolveReleaseSetForType(metaDb, message.type)

  if (!releaseSet) {
    throw new Error(`Release set not found for type: ${message.type}`)
  }
  const currentRows = await getCurrentDivisionVersionMap(
    historyDb,
    message.regionCode,
    {
      buildDivisionBaseHashInput,
      normalizeDivisionI18nSnapshotRow,
    },
  )
  const previousRows = new Map(currentRows)
  const seenIds = new Set<string>()
  const processedRowsById = new Map<string, DivisionVersionSnapshot>()

  let processedRows = 0
  let insertedVersions = 0
  let unchangedRows = 0
  let localizedRows = 0
  const statsAccumulator = createLocaleStatsAccumulator()

  if (sourceDb && message.source === 'overture') {
    await resetSourceReleaseRows(sourceDb, message)
  }

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE)) {
    const sourceRows: Array<typeof sourceSchema.sourceOvertureDivisions.$inferInsert> =
      []
    const sourceI18nRows: Array<
      typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert
    > = []

    for (const row of batch) {
      const normalized = normalizeDivisionRow(row)
      const versionHash = await createHash(buildDivisionBaseHashInput(normalized.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalized.base),
        i18n: normalized.i18n,
      })

      processedRows += 1
      localizedRows += normalized.i18n.length
      seenIds.add(normalized.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        normalized.i18n.map(row => ({
          hasAltName: Boolean(row.nameAlts),
          hasName: Boolean(row.name),
          isLocaleInferred: row.isLocaleInferred,
          locale: row.locale,
        })),
      )
      processedRowsById.set(normalized.base.id, {
        churnHash,
        geometry: normalized.base.geometry,
        id: normalized.base.id,
        localizedRows: normalized.i18n,
        parentId: normalized.base.parentDivisionId,
        type: normalized.base.type,
        versionHash,
      })

      if (sourceDb && message.source === 'overture') {
        const releaseId = buildSourceReleaseId(message)
        const datasetId = buildSourceDatasetId(message)
        const sourcePayloadHash = await createHash(row)

        sourceRows.push({
          releaseId,
          datasetId,
          sourceRecordId: normalized.base.id,
          sourcePayloadHash,
          regionCode: message.regionCode,
          level: normalized.base.level,
          divisionType: normalized.base.type,
          subtype: normalized.base.subtype,
          divisionClass: normalized.base.class,
          population: normalized.base.population,
          version: asOptionalInteger(row.version),
          wikidata: normalized.base.wikidata,
          geometry: normalized.base.geometry,
          bbox: normalized.base.bbox,
          hierarchies: normalized.base.hierarchy,
          cartography: normalized.base.cartography,
          sources: normalized.base.sources,
          rawProperties: row,
        })

        sourceI18nRows.push(
          ...normalized.i18n.map(localized => ({
            releaseId,
            sourceRecordId: normalized.base.id,
            locale: localized.locale,
            name: localized.name,
            nameVariant: localized.nameVariant,
            nameAlts: localized.nameAlts,
            nameRules: localized.nameRules,
            localType: localized.localType,
            isLocaleInferred: localized.isLocaleInferred,
          })),
        )
      }

      const current = currentRows.get(normalized.base.id)

      if (current?.versionHash === versionHash) {
        unchangedRows += 1
        await replaceDivisionCurrentI18n(
          currentDb,
          normalized.base.id,
          normalized.i18n,
          new Date().toISOString(),
        )
        continue
      }

      if (current) {
        await closeCurrentDivisionVersion(
          historyDb,
          message.regionCode,
          normalized.base.id,
          releaseSet.id,
          message.snapshotMonth,
        )
      }

      insertedVersions += 1

      await upsertDivisionCurrentState(currentDb, normalized.base, normalized.i18n)
      await insertDivisionVersionRows(
        metaDb,
        historyDb,
        message,
        normalized.base,
        normalized.i18n,
        versionHash,
        new Date().toISOString(),
        environment,
      )
    }

    if (sourceDb && message.source === 'overture') {
      await insertSourceOvertureDivisions(sourceDb, sourceRows)
      await insertSourceOvertureDivisionI18n(sourceDb, sourceI18nRows)
    }
  }

  const deletedRows = await deleteMissingCurrentDivisions(
    currentDb,
    historyDb,
    message.regionCode,
    releaseSet.id,
    message.snapshotMonth,
    currentRows,
    seenIds,
  )
  const churnStats = buildChurnStatsRows(
    buildChurnCounts(previousRows, processedRowsById),
  )
  const qualityStats = buildQualityStatsRows(
    buildQualityCounts(previousRows, processedRowsById, {
      hasLocaleRegression,
      hasNameRegression,
    }),
  )
  const statsRows = await replaceDatasetStats(
    metaDb,
    message.releaseId ?? message.datasetId,
    [...buildLocaleStatsRows(statsAccumulator), ...churnStats, ...qualityStats],
  )

  return {
    deletedRows,
    insertedVersions,
    localizedRows,
    processedRows,
    statsRows,
    unchangedRows,
  }
}

function resolveShardEnvironment(): 'preview' | 'production' {
  const baseUrl = process.env.HARBOUR_BASE_URL ?? ''
  return /production/i.test(baseUrl) ? 'production' : 'preview'
}

/**
 * Normalizes a raw parquet row into the base division record plus locale rows.
 */
function normalizeDivisionRow(row: Record<string, unknown>) {
  const id = asNonEmptyString(row.id)
  const now = new Date().toISOString()

  if (!id) {
    throw new Error('Division row is missing `id`.')
  }

  const parentDivisionId = asNonEmptyString(row.parent_division_id)
  const otSubtype = asNonEmptyString(row.subtype)
  const otClass = asNonEmptyString(row.class)
  const type = resolveDivisionType({
    row,
    otClass,
    otSubtype,
    parentDivisionId,
  })
  const level = resolveDivisionLevel({
    row,
    otClass,
    otSubtype,
    parentDivisionId,
  })
  const i18n = normalizeDivisionI18n(id, row.names, row.local_type)
  const normalizedHierarchies = normalizeDivisionHierarchies(row.hierarchies)
  const normalizedGeometry = parseWkbGeometry(row.geometry)

  return {
    base: {
      bbox: row.bbox ?? null,
      cartography: row.cartography ?? null,
      class: otClass,
      createdAt: now,
      geometry: normalizedGeometry,
      hierarchy: normalizedHierarchies,
      id,
      level,
      population: asNumber(row.population),
      type,
      parentDivisionId,
      sources: normalizeOvertureSources(row.sources),
      subtype: otSubtype,
      updatedAt: now,
      wikidata: asNonEmptyString(row.wikidata),
    } satisfies DivisionRow,
    i18n,
  }
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function buildDivisionBaseHashInput(
  base: Omit<DivisionRow, 'createdAt' | 'updatedAt'> | DivisionRow,
) {
  return {
    bbox: base.bbox,
    cartography: base.cartography,
    class: base.class,
    geometry: base.geometry,
    hierarchy: base.hierarchy,
    id: base.id,
    level: base.level,
    parentDivisionId: base.parentDivisionId,
    population: base.population,
    sources: base.sources,
    subtype: base.subtype,
    type: base.type,
    wikidata: base.wikidata,
  } satisfies Omit<DivisionRow, 'createdAt' | 'updatedAt'>
}

function normalizeDivisionI18nSnapshotRow(row: DivisionI18nPayload) {
  return {
    ...row,
    isLocaleInferred: Boolean(row.isLocaleInferred),
  } satisfies DivisionI18nPayload
}

function normalizeOvertureSources(sources: unknown) {
  if (sources === undefined) {
    return undefined
  }

  return { overture: sources }
}

/**
 * Builds localized division name/type rows from mixed source fields.
 */
function normalizeDivisionI18n(divisionId: string, names: unknown, localType: unknown) {
  const localizedNames = new Map<string, Set<string>>()
  const localizedRuleEntries = new Map<string, DivisionNameRuleRecord[]>()
  const localizedInferredFlags = new Map<string, boolean>()
  const localizedTypes = new Map<string, string>()
  const namesRecord =
    names && typeof names === 'object' ? (names as Record<string, unknown>) : null

  const addNameValue = (
    locale: string,
    value: string,
    options?: {
      inferred?: boolean
      rule?: DivisionNameRuleRecord | null
    },
  ) => {
    addLocalizedValue(localizedNames, locale, value)

    if (options?.rule) {
      const rules = localizedRuleEntries.get(locale) ?? []
      rules.push(options.rule)
      localizedRuleEntries.set(locale, rules)
    }

    if (options?.inferred) {
      if (!localizedInferredFlags.has(locale)) {
        localizedInferredFlags.set(locale, true)
      }
      return
    }

    localizedInferredFlags.set(locale, false)
  }

  collectLocalizedValues(namesRecord?.common, addNameValue)
  collectLocalizedRuleValues(namesRecord?.rules, addNameValue)
  collectLocalizedScalarValues(localType, localizedTypes, locale => {
    localizedInferredFlags.set(locale, false)
  })

  for (const inferredValue of inferLocale(namesRecord?.primary)) {
    addNameValue(inferredValue.locale, inferredValue.value, {
      inferred: true,
    })
  }

  const locales = new Set<string>([...localizedNames.keys(), ...localizedTypes.keys()])

  return [...locales].sort().map(locale => {
    const values = [...(localizedNames.get(locale) ?? [])]
    const [name, ...alts] = values
    const nameRules = dedupeNameRules(localizedRuleEntries.get(locale) ?? [])

    return {
      divisionId,
      isLocaleInferred: localizedInferredFlags.get(locale) ?? false,
      localType: localizedTypes.get(locale) ?? null,
      locale,
      name: name ?? null,
      nameAlts: alts.length > 0 ? alts.join('|') : null,
      nameRules: nameRules.length > 0 ? nameRules : null,
      nameVariant: values.length > 0 ? values : null,
    } satisfies DivisionI18nPayload
  })
}

/**
 * Recursively collects localized text values from mixed object/array/string shapes.
 */
function collectLocalizedValues(
  value: unknown,
  appendValue: (
    locale: string,
    value: string,
    options?: {
      inferred?: boolean
      rule?: DivisionNameRuleRecord | null
    },
  ) => void,
  localeHint?: string | null,
) {
  if (value === null || value === undefined) {
    return
  }

  if (typeof value === 'string') {
    const normalized = normalizeLocale(localeHint)

    if (normalized) {
      appendValue(normalized, value)
      return
    }

    for (const inferredValue of inferLocale(value)) {
      appendValue(inferredValue.locale, inferredValue.value, {
        inferred: true,
      })
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalizedValues(item, appendValue, localeHint)
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
    appendValue(explicitLocale, directValue)
    return
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedLocale = normalizeLocale(key) ?? explicitLocale
    collectLocalizedValues(nestedValue, appendValue, nestedLocale)
  }
}

/**
 * Collects simple locale-to-string mappings such as localized type labels.
 */
function collectLocalizedScalarValues(
  value: unknown,
  target: Map<string, string>,
  onLocale?: (locale: string) => void,
) {
  if (!value || typeof value !== 'object') {
    return
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const locale = normalizeLocale(key)
    const normalizedValue = asNonEmptyString(nestedValue)

    if (locale && normalizedValue) {
      target.set(locale, normalizedValue)
      onLocale?.(locale)
    }
  }
}

/**
 * Collects localized rule entries and appends their values to locale name sets.
 */
function collectLocalizedRuleValues(
  value: unknown,
  appendValue: (
    locale: string,
    value: string,
    options?: {
      inferred?: boolean
      rule?: DivisionNameRuleRecord | null
    },
  ) => void,
  localeHint?: string | null,
) {
  if (value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalizedRuleValues(item, appendValue, localeHint)
    }
    return
  }

  if (typeof value === 'string') {
    const normalizedLocale = normalizeLocale(localeHint)

    if (normalizedLocale) {
      appendValue(normalizedLocale, value, {
        rule: {
          value,
          variant: null,
        },
      })
      return
    }

    for (const inferredValue of inferLocale(value)) {
      appendValue(inferredValue.locale, inferredValue.value, {
        inferred: true,
        rule: {
          value: inferredValue.value,
          variant: null,
        },
      })
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
  const directVariant = asNonEmptyString(record.variant)

  if (explicitLocale && (directValue || directVariant)) {
    if (directValue) {
      appendValue(explicitLocale, directValue, {
        rule: {
          value: directValue,
          variant: directVariant,
        },
      })
    }
    return
  }

  if (!explicitLocale && (directValue || directVariant)) {
    const inferredValues = directValue
      ? inferLocale(directValue).map(inferredValue => ({
          locale: inferredValue.locale,
          value: inferredValue.value,
        }))
      : []

    for (const inferredValue of inferredValues) {
      appendValue(inferredValue.locale, inferredValue.value, {
        inferred: true,
        rule: {
          value: directValue ?? directVariant ?? inferredValue.value,
          variant: directVariant,
        },
      })
    }
    return
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedLocale = normalizeLocale(key) ?? explicitLocale
    collectLocalizedRuleValues(nestedValue, appendValue, nestedLocale)
  }
}

/**
 * Unwraps singleton nested list wrappers produced by parquet decoding.
 */
function normalizeDivisionHierarchies(value: unknown) {
  let normalized = value

  while (
    Array.isArray(normalized) &&
    normalized.length === 1 &&
    Array.isArray(normalized[0])
  ) {
    ;[normalized] = normalized
  }

  return normalized
}

/**
 * Maps source hints to a coarse numeric division level.
 */
function resolveDivisionLevel(input: {
  otSubtype: string | null
  otClass: string | null
  parentDivisionId: string | null
  row: Record<string, unknown>
}) {
  const normalizedSubtype = normalizeDivisionLevelToken(input.otSubtype)
  const normalizedClass = normalizeDivisionLevelToken(input.otClass)
  const normalizedAdminLevel = normalizeDivisionLevelToken(
    resolveAdminLevelToken(input.row),
  )

  if (isHongKongArea(input.row)) {
    return 1
  }

  if (normalizedSubtype === 'dependency') {
    return 0
  }

  if (normalizedSubtype === 'region') {
    return 2
  }

  if (normalizedSubtype === 'locality') {
    if (normalizedClass === 'city') {
      return 1
    }

    if (normalizedClass === 'town') {
      return 3
    }

    if (normalizedClass === 'village') {
      return 5
    }

    if (normalizedClass === 'hamlet') {
      return 6
    }
  }

  const candidates = [normalizedSubtype, normalizedClass, normalizedAdminLevel].filter(
    Boolean,
  )

  for (const candidate of candidates) {
    for (const [token, level] of DIVISION_LEVEL_TOKENS.entries()) {
      if (candidate.includes(token)) {
        return level
      }
    }
  }

  return input.parentDivisionId ? 1 : 0
}

function resolveDivisionType(input: {
  otSubtype: string | null
  otClass: string | null
  parentDivisionId: string | null
  row: Record<string, unknown>
}) {
  const normalizedSubtype = normalizeDivisionLevelToken(input.otSubtype)
  const normalizedClass = normalizeDivisionLevelToken(input.otClass)

  if (isHongKongArea(input.row)) {
    return 'area'
  }

  if (normalizedSubtype === 'dependency') {
    return 'sar'
  }

  if (normalizedSubtype === 'region') {
    return 'district'
  }

  if (normalizedSubtype === 'locality') {
    if (normalizedClass === 'city') {
      return 'area'
    }

    if (normalizedClass === 'town') {
      return 'town'
    }

    if (normalizedClass === 'village') {
      return 'village'
    }

    if (normalizedClass === 'hamlet') {
      return 'hamlet'
    }
  }

  if (normalizedSubtype === 'macrohood' || normalizedClass === 'macrohood') {
    return 'macrohood'
  }

  if (
    normalizedSubtype === 'neighborhood' ||
    normalizedSubtype === 'neighbourhood' ||
    normalizedClass === 'neighborhood' ||
    normalizedClass === 'neighbourhood'
  ) {
    return 'neighbourhood'
  }

  if (normalizedSubtype === 'microhood' || normalizedClass === 'microhood') {
    return 'microhood'
  }

  const level = resolveDivisionLevel(input)

  if (level === 0) {
    return 'sar'
  }

  if (level === 1) {
    return 'area'
  }

  if (level === 2) {
    return 'district'
  }

  if (level === 3) {
    return 'town'
  }

  if (level === 4) {
    return 'macrohood'
  }

  if (level === 5) {
    return 'neighbourhood'
  }

  return 'microhood'
}

/**
 * Reads admin-level-like source hints for level derivation without persisting them.
 */
function resolveAdminLevelToken(row: Record<string, unknown>) {
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

function normalizeDivisionLevelToken(value: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replaceAll(/[\s-]+/g, '_') ?? ''
  )
}

function isHongKongArea(row: Record<string, unknown>) {
  const names = row.names

  if (!names || typeof names !== 'object') {
    return false
  }

  return collectDivisionNameCandidates(names as Record<string, unknown>).some(name =>
    HONG_KONG_AREA_NAMES.has(name.toLowerCase()),
  )
}

function collectDivisionNameCandidates(names: Record<string, unknown>) {
  const candidates = new Set<string>()

  const pushValue = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      candidates.add(value.trim())
    }
  }

  const pushLocalized = (value: unknown) => {
    if (typeof value === 'string') {
      pushValue(value)
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          pushValue((item as Record<string, unknown>).value)
        } else {
          pushValue(item)
        }
      }
      return
    }

    if (value && typeof value === 'object') {
      for (const localizedValue of Object.values(value as Record<string, unknown>)) {
        pushValue(localizedValue)
      }
    }
  }

  pushValue(names.primary)
  pushLocalized(names.common)

  return [...candidates]
}

function dedupeNameRules(rules: DivisionNameRuleRecord[]) {
  const seen = new Set<string>()
  const deduped: DivisionNameRuleRecord[] = []

  for (const rule of rules) {
    const normalizedRule = {
      value: rule.value.trim(),
      variant: rule.variant?.trim() ?? null,
    }

    if (!normalizedRule.value) {
      continue
    }

    const key = stableJsonStringify(normalizedRule)

    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(normalizedRule)
  }

  return deduped
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return null
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseWkbGeometry(value: unknown): GeoJsonGeometry | null {
  const decodedGeometry = asGeoJsonGeometry(value)

  if (decodedGeometry) {
    return decodedGeometry
  }

  const bytes = toUint8Array(value)

  if (!bytes || bytes.byteLength === 0) {
    return null
  }

  const reader = createWkbReader(bytes)
  return readWkbGeometry(reader)
}

function asGeoJsonGeometry(value: unknown): GeoJsonGeometry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.type !== 'string') {
    return null
  }

  return value as GeoJsonGeometry
}

function toUint8Array(value: unknown) {
  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  return null
}

function createWkbReader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  let littleEndian = true

  return {
    readByteOrder() {
      const byteOrder = view.getUint8(offset)
      offset += 1

      if (byteOrder !== 0 && byteOrder !== 1) {
        throw new Error(`Unsupported WKB byte order: ${byteOrder}`)
      }

      littleEndian = byteOrder === 1
      return littleEndian
    },
    readUint32() {
      const value = view.getUint32(offset, littleEndian)
      offset += 4
      return value >>> 0
    },
    readFloat64() {
      const value = view.getFloat64(offset, littleEndian)
      offset += 8
      return value
    },
  }
}

function readWkbGeometry(reader: ReturnType<typeof createWkbReader>): GeoJsonGeometry {
  reader.readByteOrder()

  const rawType = reader.readUint32()
  const hasSrid = (rawType & 0x20000000) !== 0
  const hasZFromBits = (rawType & 0x80000000) !== 0
  const hasMFromBits = (rawType & 0x40000000) !== 0
  let baseType = rawType & 0x0fffffff

  let hasZ = hasZFromBits
  let hasM = hasMFromBits

  if (baseType >= 3000) {
    hasZ = true
    hasM = true
    baseType -= 3000
  } else if (baseType >= 2000) {
    hasM = true
    baseType -= 2000
  } else if (baseType >= 1000) {
    hasZ = true
    baseType -= 1000
  }

  if (hasSrid) {
    reader.readUint32()
  }

  switch (baseType) {
    case 1:
      return {
        type: 'Point',
        coordinates: readWkbCoordinate(reader, hasZ, hasM),
      }
    case 2:
      return {
        type: 'LineString',
        coordinates: readWkbCoordinateArray(reader, hasZ, hasM),
      }
    case 3:
      return {
        type: 'Polygon',
        coordinates: readWkbPolygonCoordinates(reader, hasZ, hasM),
      }
    case 4:
      return {
        type: 'MultiPoint',
        coordinates: readWkbNestedGeometries(reader, 'Point').map(
          geometry => geometry.coordinates,
        ),
      }
    case 5:
      return {
        type: 'MultiLineString',
        coordinates: readWkbNestedGeometries(reader, 'LineString').map(
          geometry => geometry.coordinates,
        ),
      }
    case 6:
      return {
        type: 'MultiPolygon',
        coordinates: readWkbNestedGeometries(reader, 'Polygon').map(
          geometry => geometry.coordinates,
        ),
      }
    case 7:
      return {
        type: 'GeometryCollection',
        geometries: readWkbCollectionGeometries(reader),
      }
    default:
      throw new Error(`Unsupported WKB geometry type: ${baseType}`)
  }
}

function readWkbCoordinate(
  reader: ReturnType<typeof createWkbReader>,
  hasZ: boolean,
  hasM: boolean,
) {
  const x = reader.readFloat64()
  const y = reader.readFloat64()
  const coordinates = [x, y]

  if (hasZ) {
    coordinates.push(reader.readFloat64())
  }

  if (hasM) {
    reader.readFloat64()
  }

  return coordinates
}

function readWkbCoordinateArray(
  reader: ReturnType<typeof createWkbReader>,
  hasZ: boolean,
  hasM: boolean,
) {
  const count = reader.readUint32()
  const coordinates: number[][] = []

  for (let index = 0; index < count; index += 1) {
    coordinates.push(readWkbCoordinate(reader, hasZ, hasM))
  }

  return coordinates
}

function readWkbPolygonCoordinates(
  reader: ReturnType<typeof createWkbReader>,
  hasZ: boolean,
  hasM: boolean,
) {
  const ringCount = reader.readUint32()
  const coordinates: number[][][] = []

  for (let index = 0; index < ringCount; index += 1) {
    coordinates.push(readWkbCoordinateArray(reader, hasZ, hasM))
  }

  return coordinates
}

function readWkbNestedGeometries<T extends GeoJsonGeometry['type']>(
  reader: ReturnType<typeof createWkbReader>,
  expectedType: T,
) {
  const count = reader.readUint32()
  const geometries: Extract<GeoJsonGeometry, { type: T }>[] = []

  for (let index = 0; index < count; index += 1) {
    const geometry = readWkbGeometry(reader)

    if (geometry.type !== expectedType) {
      throw new Error(
        `Unexpected nested WKB geometry type: expected ${expectedType}, received ${geometry.type}`,
      )
    }

    geometries.push(geometry as Extract<GeoJsonGeometry, { type: T }>)
  }

  return geometries
}

function readWkbCollectionGeometries(reader: ReturnType<typeof createWkbReader>) {
  const count = reader.readUint32()
  const geometries: GeoJsonGeometry[] = []

  for (let index = 0; index < count; index += 1) {
    geometries.push(readWkbGeometry(reader))
  }

  return geometries
}
