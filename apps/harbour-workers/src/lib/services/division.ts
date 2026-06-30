import type { DatasetProcessingMessage } from '@repo/core'
import type { ApiLocale } from '@repo/core'
import { resolveLatestPublishedSnapshotForResourceTypeRegion } from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  sourceSchema,
  SourceDatabase,
} from '@repo/db'
import type {
  DivisionI18nPayload,
  DivisionRow,
  NewDivisionRow,
  NewDivisionI18nRow,
} from '@repo/db/currentSchema'
import type { GeoJsonGeometry, GeoJsonPosition } from '../geojson'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'
import {
  cloneDivisionCurrentSnapshot,
  closeCurrentDivisionVersions,
  countDivisionCurrentSnapshotI18nRows,
  countDivisionCurrentSnapshotRows,
  deleteMissingCurrentDivisions,
  deleteStaleDivisionCurrentRows,
  getCurrentDivisionVersionMap,
  insertDivisionVersionRows,
  prepareDivisionVersionInsertContext,
  replaceDatasetStats,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
} from '../db/division'
import {
  advanceSourceOvertureDivisionRelease,
  buildSourceDatasetId,
  buildSourceReleaseId,
  closeSourceOvertureDivisionVersions,
  deleteMissingCurrentSourceOvertureDivisions,
  getCurrentSourceOvertureDivisionMap,
  insertSourceOvertureDivisionI18nVersions,
  insertSourceOvertureDivisionVersions,
  replaceSourceOvertureDivisionI18nRows,
  upsertSourceOvertureDivisions,
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
import {
  createOperationTimer,
  resolveDataShardEnvironment,
  resolveDebugEnabled,
} from './shared'

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
  put?(
    key: string,
    value: string | ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string
      }
    },
  ): Promise<unknown>
}

export type ProcessDatasetResult = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  statsRows: number
  unchangedRows: number
}

type ReportProgress = (stats: {
  localizedRows: number
  processedRows: number
}) => Promise<void>

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
const CANONICAL_DIVISION_API_LOCALE_FALLBACKS: Record<ApiLocale, string[]> = {
  en: ['en'],
  'zh-hant': ['zh-hk', 'zh-hant', 'zh-mo', 'zh-tw'],
  'zh-hans': ['zh-hans', 'zh-cn', 'zh-sg'],
}

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
  reportProgress?: ReportProgress,
): Promise<ProcessDatasetResult> {
  const debugEnabled = resolveDebugEnabled(process.env.DEBUG)
  const timings = createOperationTimer(debugEnabled)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const file = await timings.measure('loadParquetBufferMs', () =>
    createAsyncBufferFromR2(bucket, message.rawObjectKey),
  )
  const environment = resolveDataShardEnvironment(process.env.DATA_SHARD_ENV)
  const versionInsertContext = await timings.measure(
    'prepareVersionInsertContextMs',
    () => prepareDivisionVersionInsertContext(metaRepoDb, message, environment),
  )
  const currentRows = await timings.measure('loadCurrentVersionMapMs', () =>
    getCurrentDivisionVersionMap(historyRepoDb, message.regionCode, {
      buildDivisionBaseHashInput,
      normalizeDivisionI18nSnapshotRow,
    }),
  )
  const activeSnapshot = await resolveLatestPublishedSnapshotForResourceTypeRegion(
    metaRepoDb,
    'division',
    message.regionCode,
  )
  const isInitialCanonicalLoad = !activeSnapshot && currentRows.size === 0

  if (activeSnapshot) {
    const activeSnapshotRowCount = await timings.measure(
      'countDivisionCurrentSnapshotRowsMs',
      () => countDivisionCurrentSnapshotRows(currentRepoDb, activeSnapshot.id),
    )
    const activeSnapshotI18nRowCount = await timings.measure(
      'countDivisionCurrentSnapshotI18nRowsMs',
      () => countDivisionCurrentSnapshotI18nRows(currentRepoDb, activeSnapshot.id),
    )
    const expectedI18nRowCount = [...currentRows.values()].reduce(
      (total, row) => total + row.localizedRows.length,
      0,
    )

    if (currentRows.size > 0 && activeSnapshotRowCount !== currentRows.size) {
      throw new Error(
        `Active division snapshot ${activeSnapshot.id} is incomplete in current storage: expected ${currentRows.size} rows, found ${activeSnapshotRowCount}.`,
      )
    }

    if (
      expectedI18nRowCount > 0 &&
      activeSnapshotI18nRowCount !== expectedI18nRowCount
    ) {
      throw new Error(
        `Active division snapshot ${activeSnapshot.id} is incomplete in current i18n storage: expected ${expectedI18nRowCount} rows, found ${activeSnapshotI18nRowCount}.`,
      )
    }

    await timings.measure('cloneDivisionCurrentSnapshotMs', () =>
      cloneDivisionCurrentSnapshot(
        currentRepoDb,
        activeSnapshot.id,
        versionInsertContext.snapshotId,
      ),
    )
  }
  const previousRows = new Map(currentRows)
  const seenIds = new Set<string>()
  const processedRowsById = new Map<string, DivisionVersionSnapshot>()

  let processedRows = 0
  let insertedVersions = 0
  let i18nOnlyChangedRows = 0
  let sourceChangedRows = 0
  let sourceUnchangedRows = 0
  let unchangedRows = 0
  let localizedRows = 0
  const statsAccumulator = createLocaleStatsAccumulator()
  const currentSourceRows =
    sourceDb && message.source === 'overture'
      ? await timings.measure('loadCurrentSourceMapMs', () =>
          getCurrentSourceOvertureDivisionMap(sourceDb),
        )
      : null
  const isInitialSourceLoad =
    Boolean(sourceDb && message.source === 'overture') &&
    (currentSourceRows?.size ?? 0) === 0

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE)) {
    const sourceRows: Array<typeof sourceSchema.sourceOvertureDivisions.$inferInsert> =
      []
    const sourceI18nRows: Array<
      typeof sourceSchema.sourceOvertureDivisionI18n.$inferInsert
    > = []
    const sourceVersionRows: Array<
      typeof sourceSchema.sourceOvertureDivisionsVersions.$inferInsert
    > = []
    const sourceI18nVersionRows: Array<
      typeof sourceSchema.sourceOvertureDivisionI18nVersions.$inferInsert
    > = []
    const currentDivisionRows: Array<Omit<NewDivisionRow, 'snapshotId'>> = []
    const currentDivisionI18nRowIds = new Set<string>()
    const currentDivisionI18nRows: Array<Omit<NewDivisionI18nRow, 'snapshotId'>> = []
    const changedDivisionExistingIds = new Set<string>()
    const changedDivisionVersionRows: Array<
      Omit<NewDivisionRow, 'snapshotId'> & {
        versionHash: string
      }
    > = []
    const changedDivisionI18nVersionRows: Array<
      {
        divisionId: string
        isLocaleInferred: boolean
        locale: string
        name: string | null
        nameAlts: string | null
        nameRules: unknown
        nameVariant: unknown
        sourceReleaseId: string
      } & {
        versionHash: string
        createdAt: string
        updatedAt: string
      }
    > = []
    const changedSourceIds = new Set<string>()
    const unchangedSourceIds = new Set<string>()

    for (const row of batch) {
      const normalized = normalizeDivisionRow(row)
      const canonicalI18n = buildCanonicalDivisionApiI18n(normalized.i18n)
      const versionHash = await createHash(buildDivisionBaseHashInput(normalized.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalized.base),
        i18n: canonicalI18n,
      })

      processedRows += 1
      localizedRows += canonicalI18n.length
      seenIds.add(normalized.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        canonicalI18n.map(row => ({
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
        localizedRows: canonicalI18n,
        parentId: normalized.base.parentDivisionId,
        type: normalized.base.type,
        versionHash,
      })

      if (sourceDb && message.source === 'overture') {
        const releaseId = buildSourceReleaseId(message)
        const datasetId = buildSourceDatasetId(message)
        const sourcePayloadHash = await createHash(row)
        const currentSource = currentSourceRows?.get(normalized.base.id) ?? null
        const sourceChanged = currentSource?.sourcePayloadHash !== sourcePayloadHash

        if (sourceChanged) {
          sourceChangedRows += 1
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
              isLocaleInferred: localized.isLocaleInferred,
            })),
          )
          changedSourceIds.add(normalized.base.id)
          sourceVersionRows.push({
            sourceRecordId: normalized.base.id,
            versionHash: sourcePayloadHash,
            releaseId,
            validFromRelease: message.sourceVersion,
            validToRelease: null,
            isCurrent: true,
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
          sourceI18nVersionRows.push(
            ...normalized.i18n.map(localized => ({
              sourceRecordId: normalized.base.id,
              versionHash: sourcePayloadHash,
              releaseId,
              validFromRelease: message.sourceVersion,
              validToRelease: null,
              isCurrent: true,
              locale: localized.locale,
              name: localized.name,
              nameVariant: localized.nameVariant,
              nameAlts: localized.nameAlts,
              nameRules: localized.nameRules,
              isLocaleInferred: localized.isLocaleInferred,
            })),
          )
        } else if (currentSource) {
          sourceUnchangedRows += 1
          unchangedSourceIds.add(normalized.base.id)
        }
      }

      const current = currentRows.get(normalized.base.id)
      const currentChanged = current?.churnHash !== churnHash
      const baseChanged = current?.versionHash !== versionHash
      const currentDivisionI18nNow = normalized.base.updatedAt
      const i18nVersionHash =
        !baseChanged && currentChanged
          ? await createHash({
              baseVersionHash: versionHash,
              i18n: canonicalI18n.map(row => ({
                isLocaleInferred: row.isLocaleInferred,
                locale: row.locale,
                name: row.name ?? null,
                nameAlts: row.nameAlts ?? null,
                nameRules: row.nameRules,
                nameVariant: row.nameVariant,
              })),
              kind: 'division-i18n',
            })
          : versionHash

      if (!currentChanged) {
        unchangedRows += 1
        continue
      }

      if (current) {
        changedDivisionExistingIds.add(normalized.base.id)
      }

      currentDivisionI18nRowIds.add(normalized.base.id)
      currentDivisionI18nRows.push(
        ...canonicalI18n.map(row => ({
          ...row,
          createdAt: currentDivisionI18nNow,
          updatedAt: currentDivisionI18nNow,
        })),
      )

      if (!baseChanged) {
        i18nOnlyChangedRows += 1
        changedDivisionVersionRows.push({
          ...normalized.base,
          versionHash,
        })
        changedDivisionI18nVersionRows.push(
          ...canonicalI18n.map(row => ({
            divisionId: row.divisionId,
            isLocaleInferred: row.isLocaleInferred,
            locale: row.locale,
            name: row.name ?? null,
            nameAlts: row.nameAlts ?? null,
            nameRules: row.nameRules,
            nameVariant: row.nameVariant,
            sourceReleaseId: versionInsertContext.releaseId,
            versionHash: i18nVersionHash,
            createdAt: currentDivisionI18nNow,
            updatedAt: currentDivisionI18nNow,
          })),
        )
        continue
      }

      insertedVersions += 1
      currentDivisionRows.push(normalized.base)
      changedDivisionVersionRows.push({
        ...normalized.base,
        versionHash,
      })
      changedDivisionI18nVersionRows.push(
        ...canonicalI18n.map(row => ({
          divisionId: row.divisionId,
          isLocaleInferred: row.isLocaleInferred,
          locale: row.locale,
          name: row.name ?? null,
          nameAlts: row.nameAlts ?? null,
          nameRules: row.nameRules,
          nameVariant: row.nameVariant,
          sourceReleaseId: versionInsertContext.releaseId,
          versionHash,
          createdAt: currentDivisionI18nNow,
          updatedAt: currentDivisionI18nNow,
        })),
      )
    }

    if (changedDivisionExistingIds.size > 0) {
      await timings.measure('closeCurrentDivisionVersionsMs', () =>
        closeCurrentDivisionVersions(
          historyRepoDb,
          message.regionCode,
          [...changedDivisionExistingIds],
          versionInsertContext.snapshotId,
          message.cohortKey,
        ),
      )
    }

    await timings.measure('upsertDivisionCurrentStatesMs', () =>
      upsertDivisionCurrentStates(
        currentRepoDb,
        versionInsertContext.snapshotId,
        currentDivisionRows,
        {
          assumeSnapshotEmpty: isInitialCanonicalLoad,
        },
      ),
    )
    await timings.measure('replaceDivisionCurrentI18nMs', () =>
      replaceDivisionCurrentI18n(
        currentRepoDb,
        versionInsertContext.snapshotId,
        [...currentDivisionI18nRowIds],
        currentDivisionI18nRows,
        {
          assumeSnapshotEmpty: isInitialCanonicalLoad,
        },
      ),
    )
    await timings.measure('insertDivisionVersionRowsMs', () =>
      insertDivisionVersionRows(
        historyRepoDb,
        versionInsertContext,
        changedDivisionVersionRows,
        changedDivisionI18nVersionRows,
        {
          assumeVersionRowsAbsent: isInitialCanonicalLoad,
        },
      ),
    )
    if (sourceDb && message.source === 'overture') {
      const changedIds = [...changedSourceIds]
      const unchangedIds = [...unchangedSourceIds]
      const releaseId = buildSourceReleaseId(message)
      const datasetId = buildSourceDatasetId(message)

      if (changedIds.length > 0 && !isInitialSourceLoad) {
        await timings.measure('closeSourceOvertureDivisionVersionsMs', () =>
          closeSourceOvertureDivisionVersions(
            sourceDb,
            changedIds,
            message.sourceVersion,
          ),
        )
      }

      await timings.measure('upsertSourceOvertureDivisionsMs', () =>
        upsertSourceOvertureDivisions(sourceDb, sourceRows, {
          assumeCurrentRowsAbsent: isInitialSourceLoad,
        }),
      )
      await timings.measure('advanceSourceOvertureDivisionReleaseMs', () =>
        advanceSourceOvertureDivisionRelease(
          sourceDb,
          unchangedIds,
          releaseId,
          datasetId,
        ),
      )

      await timings.measure('replaceSourceOvertureDivisionI18nRowsMs', () =>
        replaceSourceOvertureDivisionI18nRows(sourceDb, changedIds, sourceI18nRows, {
          assumeCurrentRowsAbsent: isInitialSourceLoad,
        }),
      )

      await timings.measure('insertSourceOvertureDivisionVersionsMs', () =>
        insertSourceOvertureDivisionVersions(sourceDb, sourceVersionRows, {
          assumeVersionRowsAbsent: isInitialSourceLoad,
        }),
      )
      await timings.measure('insertSourceOvertureDivisionI18nVersionsMs', () =>
        insertSourceOvertureDivisionI18nVersions(sourceDb, sourceI18nVersionRows, {
          assumeVersionRowsAbsent: isInitialSourceLoad,
        }),
      )
    }

    if (reportProgress) {
      await reportProgress({
        localizedRows,
        processedRows,
      })
    }
  }

  const deletedRows = await timings.measure('deleteMissingCurrentDivisionsMs', () =>
    deleteMissingCurrentDivisions(
      historyRepoDb,
      message.regionCode,
      versionInsertContext.snapshotId,
      message.cohortKey,
      currentRows,
      seenIds,
    ),
  )
  await timings.measure('deleteStaleDivisionCurrentRowsMs', () =>
    deleteStaleDivisionCurrentRows(
      currentRepoDb,
      versionInsertContext.snapshotId,
      seenIds,
    ),
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
  const statsRows = await timings.measure('replaceDatasetStatsMs', () =>
    replaceDatasetStats(metaRepoDb, message.releaseId ?? message.datasetId, [
      ...buildLocaleStatsRows(statsAccumulator),
      ...churnStats,
      ...qualityStats,
    ]),
  )

  if (sourceDb && message.source === 'overture' && currentSourceRows) {
    await timings.measure('deleteMissingCurrentSourceOvertureDivisionsMs', () =>
      deleteMissingCurrentSourceOvertureDivisions(
        sourceDb,
        message.sourceVersion,
        currentSourceRows,
        seenIds,
      ),
    )
  }

  console.info(
    JSON.stringify({
      datasetId: message.datasetId,
      i18nOnlyChangedRows,
      insertedVersions,
      unchangedRows,
      phase: 'processDivisionDataset',
      processedRows,
      releaseId: message.releaseId ?? message.datasetId,
      snapshotId: versionInsertContext.snapshotId,
      source: message.source,
      sourceChangedRows,
      sourceUnchangedRows,
      sourceVersion: message.sourceVersion,
      ...(debugEnabled ? { timingsMs: timings.snapshot() } : {}),
      type: message.type,
    }),
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
  const i18n = normalizeDivisionI18n(id, row.names)
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
    } satisfies Omit<NewDivisionRow, 'snapshotId'>,
    i18n,
  }
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function buildDivisionBaseHashInput(
  base:
    | Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
    | Omit<NewDivisionRow, 'snapshotId'>,
) {
  return {
    bbox: base.bbox,
    cartography: base.cartography,
    class: base.class ?? null,
    geometry: base.geometry,
    hierarchy: base.hierarchy,
    id: base.id,
    level: base.level,
    parentDivisionId: base.parentDivisionId ?? null,
    population: base.population ?? null,
    sources: base.sources,
    subtype: base.subtype ?? null,
    type: base.type,
    wikidata: base.wikidata ?? null,
  } satisfies Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
}

function normalizeDivisionI18nSnapshotRow(row: DivisionI18nPayload) {
  return {
    ...row,
    isLocaleInferred: Boolean(row.isLocaleInferred),
  } satisfies DivisionI18nPayload
}

function buildCanonicalDivisionApiI18n(rows: DivisionI18nPayload[]) {
  const byLocale = new Map(rows.map(row => [row.locale, row] as const))
  const canonicalRows = [...rows]

  for (const [locale, candidates] of Object.entries(
    CANONICAL_DIVISION_API_LOCALE_FALLBACKS,
  ) as Array<[ApiLocale, string[]]>) {
    if (byLocale.has(locale)) {
      continue
    }

    const sourceRow = candidates
      .map(candidate => byLocale.get(candidate))
      .find((row): row is DivisionI18nPayload => row !== undefined)

    if (!sourceRow) {
      continue
    }

    canonicalRows.push({
      ...sourceRow,
      locale,
    })
  }

  return canonicalRows.sort((left, right) => left.locale.localeCompare(right.locale))
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
function normalizeDivisionI18n(divisionId: string, names: unknown) {
  const localizedNames = new Map<string, Set<string>>()
  const localizedRuleEntries = new Map<string, DivisionNameRuleRecord[]>()
  const localizedInferredFlags = new Map<string, boolean>()
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

  for (const inferredValue of inferLocale(namesRecord?.primary)) {
    addNameValue(inferredValue.locale, inferredValue.value, {
      inferred: true,
    })
  }

  const locales = new Set<string>(localizedNames.keys())

  return [...locales].sort().map(locale => {
    const values = [...(localizedNames.get(locale) ?? [])]
    const [name, ...alts] = values
    const nameRules = dedupeNameRules(localizedRuleEntries.get(locale) ?? [])

    return {
      divisionId,
      isLocaleInferred: localizedInferredFlags.get(locale) ?? false,
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
          geometry => (geometry as GeoJsonGeometry & { type: 'Point' }).coordinates,
        ),
      }
    case 5:
      return {
        type: 'MultiLineString',
        coordinates: readWkbNestedGeometries(reader, 'LineString').map(
          geometry =>
            (geometry as GeoJsonGeometry & { type: 'LineString' }).coordinates,
        ),
      }
    case 6:
      return {
        type: 'MultiPolygon',
        coordinates: readWkbNestedGeometries(reader, 'Polygon').map(
          geometry => (geometry as GeoJsonGeometry & { type: 'Polygon' }).coordinates,
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
): GeoJsonPosition {
  const x = reader.readFloat64()
  const y = reader.readFloat64()
  let coordinates: GeoJsonPosition = [x, y]

  if (hasZ) {
    coordinates = [x, y, reader.readFloat64()]
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
  const coordinates: GeoJsonPosition[] = []

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
  const coordinates: GeoJsonPosition[][] = []

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
