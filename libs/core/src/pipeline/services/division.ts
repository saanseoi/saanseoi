import type { DatasetProcessingMessage } from '../../types'
import type { ApiLocale } from '../../lib/apiLocales'
import { resolveLatestPublishedSnapshotForResourceTypeRegion } from '../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
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
import {
  calculateGeoJsonBbox,
  type GeoJsonGeometry,
  type GeoJsonPosition,
} from '../geojson'
import type { AsyncBuffer } from 'hyparquet'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../parquetR2'
import {
  cloneDivisionCurrentSnapshot,
  closeCurrentDivisionVersions,
  countDivisionCurrentSnapshotI18nRows,
  countDivisionCurrentSnapshotRows,
  deleteStaleDivisionCurrentRows,
  getDivisionCurrentSnapshotTraceState,
  getDivisionVersionMapForSnapshot,
  getMergedCurrentDivisionVersionMap,
  insertDivisionVersionRows,
  prepareDivisionVersionInsertContext,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
} from '../db/division'
import { replaceDatasetStats } from '../db/stats'
import {
  replaceReleaseProcessingActions,
  type ReleaseProcessingAction,
} from '../db/processingActions'
import {
  advanceSourceOvertureDivisionRelease,
  buildSourceReleaseId,
  closeSourceOvertureDivisionVersions,
  getMergedCurrentSourceOvertureDivisionMap,
  insertSourceOvertureDivisionVersions,
} from '../db/source'
import {
  buildChurnCounts,
  buildChurnStatsRows,
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  buildQualityCounts,
  buildQualityStatsRows,
  createLocaleStatsAccumulator,
  hasLocaleRegression,
  hasNameRegression,
  updateLocaleStatsAccumulator,
} from './stats'
import {
  addLocalisedValue,
  asNonEmptyString,
  createHash,
  inferLocale,
  normaliseLocale,
  stableJsonStringify,
} from '../utils'
import {
  createOperationTimer,
  resolveDataShardEnvironment,
  resolveDebugEnabled,
} from './shared'
import {
  logDivisionTrace,
  logDivisionTraceGroup,
  logStructuredInfo,
  resolveDivisionTraceIds,
} from '../logging'
import { readDivisionRowsWithFixtures } from './divisionFixtures'

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
  localisedRows: number
  processedRows: number
  statsRows: number
  unchangedRows: number
}

type ReportProgress = (stats: {
  localisedRows: number
  processedRows: number
}) => Promise<void>

type DivisionNameRuleRecord = {
  value: string
  variant: string | null
}

type DivisionHierarchyI18n = {
  en?: {
    name: string
  }
  'zh-hant'?: {
    name: string
  }
}

type DivisionHierarchyLookupEntry = {
  i18n: DivisionHierarchyI18n
  level: number
  type: string
}

export type DivisionHierarchyLookup = ReadonlyMap<string, DivisionHierarchyLookupEntry>

type DivisionNormaliseOptions = {
  hierarchyLookup?: DivisionHierarchyLookup
}

const DIVISION_BATCH_SIZE = 128
const OVERTURE_HK_DIVISION_PREFLIGHT_COLUMNS = [
  'id',
  'theme',
  'type',
  'country',
  'region',
  'perspectives',
  'norms',
  'names',
  'hierarchies',
]
const PRIMARY_HISTORY_OWNER_KEY = 'history-current'
const PRIMARY_SOURCE_OWNER_KEY = 'source-current'
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

function collectOwnerShardKeys(
  ownerShardKeys: string[] | undefined,
  fallbackKey: string,
) {
  return ownerShardKeys && ownerShardKeys.length > 0 ? ownerShardKeys : [fallbackKey]
}

function groupIdsByOwnerShard<
  TRow extends {
    ownerShardKeys?: string[]
  },
>(rows: Map<string, TRow>, ids: Iterable<string>, fallbackKey: string) {
  const idsByOwnerKey = new Map<string, string[]>()

  for (const id of ids) {
    const row = rows.get(id)

    if (!row) {
      continue
    }

    for (const ownerKey of collectOwnerShardKeys(row.ownerShardKeys, fallbackKey)) {
      const ownerIds = idsByOwnerKey.get(ownerKey) ?? []
      ownerIds.push(id)
      idsByOwnerKey.set(ownerKey, ownerIds)
    }
  }

  return idsByOwnerKey
}
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
  options: {
    previousHistoryDbs?: HistoryDatabase[]
    previousSourceDbs?: SourceDatabase[]
  } = {},
): Promise<ProcessDatasetResult> {
  const debugEnabled = resolveDebugEnabled(process.env.DEBUG)
  const timings = createOperationTimer(debugEnabled)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const file = await timings.measure('loadParquetBufferMs', () =>
    createAsyncBufferFromR2(bucket, message.rawObjectKey),
  )
  if (
    message.source === 'overture' &&
    message.type === 'division' &&
    message.regionCode === 'hk'
  ) {
    await timings.measure('validateDroppedDivisionSourceFieldsMs', () =>
      assertOvertureHongKongDivisionSourceAssumptions(file),
    )
  }
  const environment = resolveDataShardEnvironment(process.env.DATA_SHARD_ENV)
  const versionInsertContext = await timings.measure(
    'prepareVersionInsertContextMs',
    () => prepareDivisionVersionInsertContext(metaRepoDb, message, environment),
  )
  const traceDivisionIds = resolveDivisionTraceIds()
  const historyBaselineSources = [
    ...(options.previousHistoryDbs ?? []).map((db, index) => ({
      db,
      key: `history-previous-${index}`,
      sortOrder: index,
    })),
    {
      db: historyDb,
      key: 'history-current',
      sortOrder: options.previousHistoryDbs?.length ?? 0,
    },
  ]
  const currentRows = await timings.measure('loadCurrentVersionMapMs', () =>
    versionInsertContext.parentSnapshotId
      ? getDivisionVersionMapForSnapshot(
          currentRepoDb,
          versionInsertContext.parentSnapshotId,
          { buildDivisionBaseHashInput, normaliseDivisionI18nSnapshotRow },
          historyBaselineSources.map(source => source.key),
        )
      : Promise.resolve(new Map<string, DivisionVersionSnapshot>()),
  )
  const activeSnapshot = await resolveLatestPublishedSnapshotForResourceTypeRegion(
    metaRepoDb,
    'division',
    message.regionCode,
  )
  const isInitialCanonicalLoad = !activeSnapshot && currentRows.size === 0

  const parentSnapshotId = versionInsertContext.parentSnapshotId
  if (parentSnapshotId) {
    const activeSnapshotRowCount = await timings.measure(
      'countDivisionCurrentSnapshotRowsMs',
      () => countDivisionCurrentSnapshotRows(currentRepoDb, parentSnapshotId),
    )
    const activeSnapshotI18nRowCount = await timings.measure(
      'countDivisionCurrentSnapshotI18nRowsMs',
      () => countDivisionCurrentSnapshotI18nRows(currentRepoDb, parentSnapshotId),
    )
    const expectedI18nRowCount = [...currentRows.values()].reduce(
      (total, row) => total + row.localisedRows.length,
      0,
    )

    if (activeSnapshotRowCount === 0) {
      throw new Error(
        `Parent division snapshot ${parentSnapshotId} is not materialised in current storage; refusing to branch from another snapshot.`,
      )
    }

    if (currentRows.size > 0 && activeSnapshotRowCount !== currentRows.size) {
      const traceState = await getDivisionCurrentSnapshotTraceState(
        currentRepoDb,
        parentSnapshotId,
        [...traceDivisionIds],
      )

      for (const divisionId of traceDivisionIds) {
        const snapshotState = traceState.get(divisionId)

        logDivisionTrace(traceDivisionIds, divisionId, {
          activeSnapshotCode: activeSnapshot?.code ?? parentSnapshotId,
          activeSnapshotId: parentSnapshotId,
          event: 'activeSnapshotMismatch',
          historyCurrentExists: currentRows.has(divisionId),
          historyCurrentLocaleCount:
            currentRows.get(divisionId)?.localisedRows.length ?? 0,
          phase: 'processDivisionDataset',
          releaseId: message.releaseId ?? message.datasetId,
          snapshotI18nRowCount: snapshotState?.i18nRowCount ?? 0,
          snapshotRowExists: snapshotState?.isPresent ?? false,
          sourceVersion: message.sourceVersion,
        })
      }

      throw new Error(
        `Parent division snapshot ${parentSnapshotId} is incomplete in current storage: expected ${currentRows.size} rows, found ${activeSnapshotRowCount}.`,
      )
    }

    if (
      expectedI18nRowCount > 0 &&
      activeSnapshotI18nRowCount !== expectedI18nRowCount
    ) {
      throw new Error(
        `Parent division snapshot ${parentSnapshotId} is incomplete in current i18n storage: expected ${expectedI18nRowCount} rows, found ${activeSnapshotI18nRowCount}.`,
      )
    }

    await timings.measure('cloneDivisionCurrentSnapshotMs', () =>
      cloneDivisionCurrentSnapshot(
        currentRepoDb,
        parentSnapshotId,
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
  let localisedRows = 0
  const statsAccumulator = createLocaleStatsAccumulator()
  const districtCounts = new Map<string, number>()
  const processingActions: ReleaseProcessingAction[] = []
  const sourceBaselineSources =
    sourceDb && message.source === 'overture'
      ? [
          ...(options.previousSourceDbs ?? []).map((db, index) => ({
            db,
            key: `source-previous-${index}`,
            sortOrder: index,
          })),
          {
            db: sourceDb,
            key: 'source-current',
            sortOrder: options.previousSourceDbs?.length ?? 0,
          },
        ]
      : []
  const currentSourceRows =
    sourceDb && message.source === 'overture'
      ? await timings.measure('loadCurrentSourceMapMs', () =>
          getMergedCurrentSourceOvertureDivisionMap(sourceBaselineSources),
        )
      : null
  const isInitialSourceLoad =
    Boolean(sourceDb && message.source === 'overture') &&
    (currentSourceRows?.size ?? 0) === 0
  const historyDbByOwnerKey = new Map(
    historyBaselineSources.map(source => [source.key, source.db]),
  )
  const sourceDbByOwnerKey = new Map(
    sourceBaselineSources.map(source => [source.key, source.db]),
  )

  for (const divisionId of traceDivisionIds) {
    logDivisionTrace(traceDivisionIds, divisionId, {
      activeSnapshotCode: activeSnapshot?.code ?? null,
      activeSnapshotId: activeSnapshot?.id ?? null,
      event: 'baseline',
      historyCurrentExists: currentRows.has(divisionId),
      historyCurrentLocaleCount: currentRows.get(divisionId)?.localisedRows.length ?? 0,
      phase: 'processDivisionDataset',
      releaseId: message.releaseId ?? message.datasetId,
      sourceCurrentExists: currentSourceRows?.has(divisionId) ?? null,
      sourceVersion: message.sourceVersion,
    })
  }

  const hierarchyLookup = await timings.measure('buildHierarchyLookupMs', () =>
    buildDivisionHierarchyLookup(file),
  )

  for await (const { isSupplemental, rows: batch } of readDivisionRowsWithFixtures(
    file,
    message,
    DIVISION_BATCH_SIZE,
  )) {
    const sourceVersionRows: Array<
      typeof sourceSchema.sourceOvertureDivisions.$inferInsert
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
      const normalised = normaliseDivisionRow(row, { hierarchyLookup })
      const canonicalI18n = buildCanonicalDivisionApiI18n(normalised.i18n)
      if (message.source === 'overture' && message.type === 'division') {
        processingActions.push(
          ...buildOvertureDivisionLocaleProcessingActions({
            canonicalI18n,
            division: normalised.base,
            rawNames: row.names,
            sourceI18n: normalised.i18n,
          }),
        )
      }
      const versionHash = await createHash(buildDivisionBaseHashInput(normalised.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalised.base),
        i18n: canonicalI18n,
      })

      processedRows += 1
      localisedRows += canonicalI18n.length
      seenIds.add(normalised.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        canonicalI18n.map(row => ({
          hasAltName: Boolean(row.nameAlts),
          hasName: Boolean(row.name),
          isLocaleInferred: row.isLocaleInferred,
          locale: row.locale,
        })),
      )
      const districtId = resolveDistrictId(normalised.base)
      if (districtId) {
        districtCounts.set(districtId, (districtCounts.get(districtId) ?? 0) + 1)
      }
      processedRowsById.set(normalised.base.id, {
        churnHash,
        geometry: normalised.base.geometry,
        id: normalised.base.id,
        localisedRows: canonicalI18n,
        parentId: resolveParentDivisionIdFromHierarchy(normalised.base.hierarchy),
        type: normalised.base.type,
        versionHash,
      })
      let sourceChanged: boolean | null = null

      if (sourceDb && message.source === 'overture') {
        const releaseId = buildSourceReleaseId(message)
        const sourcePayloadHash = await createHash(row)
        const currentSource = currentSourceRows?.get(normalised.base.id) ?? null
        sourceChanged = currentSource?.sourcePayloadHash !== sourcePayloadHash

        if (sourceChanged) {
          sourceChangedRows += 1
          changedSourceIds.add(normalised.base.id)
          sourceVersionRows.push({
            sourceRecordId: normalised.base.id,
            versionHash: sourcePayloadHash,
            releaseId,
            validFromRelease: message.sourceVersion,
            validToRelease: null,
            isCurrent: true,
            adminLevel: resolveAdminLevelValue(row),
            names: row.names ?? null,
            subtype: sourceString(row.subtype),
            class: sourceString(row.class),
            version: asOptionalInteger(row.version),
            wikidata: normalised.base.wikidata,
            hierarchies: row.hierarchies,
            cartography: normalised.base.cartography,
            sources: normaliseOvertureSourceReferences(row.sources, normalised.base.id),
            rawProperties: row,
          })
        } else if (currentSource) {
          sourceUnchangedRows += 1
          unchangedSourceIds.add(normalised.base.id)
        }
      }

      const current = currentRows.get(normalised.base.id)
      const currentChanged = current?.churnHash !== churnHash
      const baseChanged = current?.versionHash !== versionHash
      const currentDivisionI18nNow = normalised.base.updatedAt
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

      logDivisionTrace(traceDivisionIds, normalised.base.id, {
        baseChanged,
        currentChanged,
        currentExists: Boolean(current),
        event: 'rowSeen',
        historyCurrentLocaleCount: current?.localisedRows.length ?? 0,
        localeCount: canonicalI18n.length,
        phase: 'processDivisionDataset',
        sourceChanged,
        sourceCurrentExists: currentSourceRows?.has(normalised.base.id) ?? null,
        sourceVersion: message.sourceVersion,
      })

      if (!currentChanged) {
        unchangedRows += 1
        continue
      }

      if (current) {
        changedDivisionExistingIds.add(normalised.base.id)
      }

      currentDivisionI18nRowIds.add(normalised.base.id)
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
          ...normalised.base,
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
      currentDivisionRows.push(normalised.base)
      changedDivisionVersionRows.push({
        ...normalised.base,
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
      const changedDivisionIdsByOwner = groupIdsByOwnerShard(
        currentRows,
        changedDivisionExistingIds,
        PRIMARY_HISTORY_OWNER_KEY,
      )

      await timings.measure('closeCurrentDivisionVersionsMs', async () => {
        for (const [ownerKey, divisionIds] of changedDivisionIdsByOwner) {
          const ownerDb = historyDbByOwnerKey.get(ownerKey)

          if (!ownerDb) {
            throw new Error(
              `History DB owner not found for division rollover: ${ownerKey}`,
            )
          }

          await closeCurrentDivisionVersions(
            ownerDb as unknown as HarbourReadableDb & HarbourWritableDb,
            divisionIds,
            versionInsertContext.snapshotId,
            message.cohortKey,
            versionInsertContext.releaseId,
          )
        }
      })
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

      if (changedIds.length > 0 && !isInitialSourceLoad) {
        const changedSourceIdsByOwner = groupIdsByOwnerShard(
          currentSourceRows ?? new Map(),
          changedIds,
          PRIMARY_SOURCE_OWNER_KEY,
        )

        await timings.measure('closeSourceOvertureDivisionVersionsMs', async () => {
          for (const [ownerKey, sourceRecordIds] of changedSourceIdsByOwner) {
            const ownerDb = sourceDbByOwnerKey.get(ownerKey)

            if (!ownerDb) {
              throw new Error(
                `Source DB owner not found for division rollover: ${ownerKey}`,
              )
            }

            await closeSourceOvertureDivisionVersions(
              ownerDb,
              sourceRecordIds,
              message.sourceVersion,
            )
          }
        })
      }

      const unchangedSourceIdsByOwner = groupIdsByOwnerShard(
        currentSourceRows ?? new Map(),
        unchangedIds,
        PRIMARY_SOURCE_OWNER_KEY,
      )

      await timings.measure('advanceSourceOvertureDivisionReleaseMs', async () => {
        for (const [ownerKey, sourceRecordIds] of unchangedSourceIdsByOwner) {
          const ownerDb = sourceDbByOwnerKey.get(ownerKey)

          if (!ownerDb) {
            throw new Error(
              `Source DB owner not found for division rollover: ${ownerKey}`,
            )
          }

          await advanceSourceOvertureDivisionRelease(
            ownerDb,
            sourceRecordIds,
            releaseId,
          )
        }
      })

      await timings.measure('insertSourceOvertureDivisionVersionsMs', () =>
        insertSourceOvertureDivisionVersions(sourceDb, sourceVersionRows, {
          assumeVersionRowsAbsent: isInitialSourceLoad,
        }),
      )
    }

    if (reportProgress && !isSupplemental) {
      await reportProgress({
        localisedRows,
        processedRows,
      })
    }
  }

  const missingCurrentIds = [...currentRows.keys()].filter(id => !seenIds.has(id))
  logDivisionTraceGroup(traceDivisionIds, missingCurrentIds, {
    event: 'missingFromDataset',
    phase: 'processDivisionDataset',
    releaseId: message.releaseId ?? message.datasetId,
    snapshotId: versionInsertContext.snapshotId,
    sourceVersion: message.sourceVersion,
  })
  const missingDivisionIdsByOwner = groupIdsByOwnerShard(
    currentRows,
    missingCurrentIds,
    PRIMARY_HISTORY_OWNER_KEY,
  )
  const deletedRows = await timings.measure(
    'deleteMissingCurrentDivisionsMs',
    async () => {
      for (const [ownerKey, divisionIds] of missingDivisionIdsByOwner) {
        const ownerDb = historyDbByOwnerKey.get(ownerKey)

        if (!ownerDb) {
          throw new Error(
            `History DB owner not found for division rollover: ${ownerKey}`,
          )
        }

        await closeCurrentDivisionVersions(
          ownerDb as unknown as HarbourReadableDb & HarbourWritableDb,
          divisionIds,
          versionInsertContext.snapshotId,
          message.cohortKey,
          versionInsertContext.releaseId,
        )
      }

      return missingCurrentIds.length
    },
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
      ...buildDistrictDistributionStatsRows(districtCounts),
      ...churnStats,
      ...qualityStats,
    ]),
  )
  await timings.measure('replaceReleaseProcessingActionsMs', () =>
    replaceReleaseProcessingActions(
      metaRepoDb,
      message.releaseId ?? message.datasetId,
      processingActions,
    ),
  )

  if (sourceDb && message.source === 'overture' && currentSourceRows) {
    const missingSourceIds = [...currentSourceRows.keys()].filter(
      id => !seenIds.has(id),
    )
    const missingSourceIdsByOwner = groupIdsByOwnerShard(
      currentSourceRows,
      missingSourceIds,
      PRIMARY_SOURCE_OWNER_KEY,
    )

    await timings.measure('deleteMissingCurrentSourceOvertureDivisionsMs', async () => {
      for (const [ownerKey, sourceRecordIds] of missingSourceIdsByOwner) {
        const ownerDb = sourceDbByOwnerKey.get(ownerKey)

        if (!ownerDb) {
          throw new Error(
            `Source DB owner not found for division rollover: ${ownerKey}`,
          )
        }

        await closeSourceOvertureDivisionVersions(
          ownerDb,
          sourceRecordIds,
          message.sourceVersion,
        )
      }
    })
  }

  logStructuredInfo({
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
  })

  return {
    deletedRows,
    insertedVersions,
    localisedRows,
    processedRows,
    statsRows,
    unchangedRows,
  }
}

/**
 * Guards the low-value Overture source fields that the HK division pipeline drops.
 */
export async function assertOvertureHongKongDivisionSourceAssumptions(
  file: AsyncBuffer,
) {
  const rows: Record<string, unknown>[] = []

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE, {
    columns: OVERTURE_HK_DIVISION_PREFLIGHT_COLUMNS,
  })) {
    rows.push(...batch)
  }

  const violations = collectOvertureHongKongDivisionSourceAssumptionViolations(rows)

  if (violations.length > 0) {
    throw new Error(
      [
        'Overture Hong Kong division parquet no longer matches dropped-field assumptions.',
        ...violations.map(violation => `- ${violation}`),
      ].join('\n'),
    )
  }
}

export function collectOvertureHongKongDivisionSourceAssumptionViolations(
  rows: Array<Record<string, unknown>>,
) {
  const violations: string[] = []
  let nonNullNormRows = 0

  const addViolation = (message: string) => {
    if (violations.length < 20) {
      violations.push(message)
    }
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1
    const rowId = asNonEmptyString(row.id)
    const rowLabel = `row ${rowNumber}${rowId ? ` (${rowId})` : ''}`

    if (row.theme !== 'divisions') {
      addViolation(
        `${rowLabel}: expected theme=divisions, got ${formatSourceValue(row.theme)}`,
      )
    }

    if (row.type !== 'division') {
      addViolation(
        `${rowLabel}: expected type=division, got ${formatSourceValue(row.type)}`,
      )
    }

    if (row.country !== 'HK') {
      addViolation(
        `${rowLabel}: expected country=HK, got ${formatSourceValue(row.country)}`,
      )
    }

    if (!isEmptySourceValue(row.region)) {
      addViolation(
        `${rowLabel}: expected empty region, got ${formatSourceValue(row.region)}`,
      )
    }

    if (!isEmptySourceValue(row.perspectives)) {
      addViolation(
        `${rowLabel}: expected empty perspectives, got ${formatSourceValue(row.perspectives)}`,
      )
    }

    const hierarchyCount = getTopLevelHierarchyCount(row.hierarchies)

    if (hierarchyCount > 1) {
      addViolation(
        `${rowLabel}: expected at most one hierarchies entry, got ${hierarchyCount}`,
      )
    }

    if (!isEmptySourceValue(row.norms)) {
      nonNullNormRows += 1

      if (!isExpectedHongKongDivisionNorms(row.norms)) {
        addViolation(
          `${rowLabel}: expected norms={driving_side:left}, got ${formatSourceValue(row.norms)}`,
        )
      }
    }

    for (const rule of getDivisionNameRules(row.names)) {
      for (const field of ['perspectives', 'between', 'side'] as const) {
        if (!isEmptySourceValue(rule[field])) {
          addViolation(
            `${rowLabel}: expected empty names.rules[].${field}, got ${formatSourceValue(rule[field])}`,
          )
        }
      }
    }
  })

  if (nonNullNormRows !== 1) {
    addViolation(
      `expected exactly one non-empty norms row with {driving_side:left}, found ${nonNullNormRows}`,
    )
  }

  return violations
}

function getTopLevelHierarchyCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function getDivisionNameRules(names: unknown) {
  if (!names || typeof names !== 'object') {
    return []
  }

  const rules = (names as Record<string, unknown>).rules

  if (!Array.isArray(rules)) {
    return []
  }

  return rules.filter(
    (rule): rule is Record<string, unknown> =>
      Boolean(rule) && typeof rule === 'object' && !Array.isArray(rule),
  )
}

function isExpectedHongKongDivisionNorms(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  const nonEmptyEntries = Object.entries(record).filter(
    ([, nestedValue]) => !isEmptySourceValue(nestedValue),
  )

  return nonEmptyEntries.length === 1 && record.driving_side === 'left'
}

function isEmptySourceValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'string') {
    return value.trim().length === 0
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptySourceValue)
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isEmptySourceValue)
  }

  return false
}

function formatSourceValue(value: unknown) {
  return stableJsonStringify(value) ?? String(value)
}

/**
 * Normalises a raw parquet row into the base division record plus locale rows.
 */
export function normaliseDivisionRow(
  row: Record<string, unknown>,
  options: DivisionNormaliseOptions = {},
) {
  const id = asNonEmptyString(row.id)
  const now = new Date().toISOString()

  if (!id) {
    throw new Error('Division row is missing `id`.')
  }

  const parentDivisionId = asNonEmptyString(row.parent_division_id)
  const otSubtype = asNonEmptyString(row.subtype)
  const otClass = asNonEmptyString(row.class)
  const landsdPlaceName = row.source === 'hkgov-landsd'
  const sourceFeatureVersion = asOptionalFeatureVersion(row.version)
  const type = landsdPlaceName
    ? 'settlement'
    : resolveDivisionType({
        row,
        otClass,
        otSubtype,
        parentDivisionId,
      })
  const level = landsdPlaceName
    ? 5
    : resolveDivisionLevel({
        row,
        otClass,
        otSubtype,
        parentDivisionId,
      })
  const i18n = normaliseDivisionI18n(id, row.names)
  const normalisedHierarchies = normaliseDivisionHierarchies(
    row.hierarchies,
    id,
    options.hierarchyLookup,
  )
  const normalisedGeometry = parseWkbGeometry(row.geometry)

  return {
    base: {
      bbox: normalisedGeometry ? calculateGeoJsonBbox(normalisedGeometry) : null,
      cartography: row.cartography ?? null,
      createdAt: now,
      geometry: normalisedGeometry,
      hierarchy: normalisedHierarchies,
      id,
      identifiers: row.identifiers ?? null,
      level,
      sourceKeys: landsdPlaceName
        ? {
            hkgovLandsd: {
              district: asNonEmptyString(row.district),
              geoNameId: asNonEmptyString(row.geo_name_id),
              placeClass: asNonEmptyString(row.place_class),
              placeType: asNonEmptyString(row.place_type),
            },
          }
        : {
            overture: {
              subtype: otSubtype ?? '',
              class: otClass ?? '',
              hierarchies: row.hierarchies ?? null,
              ...(sourceFeatureVersion !== null
                ? { version: sourceFeatureVersion }
                : {}),
              ...buildOvertureCompatibilitySourceKeys(level),
            },
          },
      type,
      sources: landsdPlaceName
        ? {
            hkgovLandsd: {
              feature: row.source_feature ?? null,
              properties: row.source_properties ?? null,
            },
          }
        : normaliseOvertureSources(row.sources),
      updatedAt: now,
      wikidata: asNonEmptyString(row.wikidata),
    } satisfies Omit<NewDivisionRow, 'snapshotId'>,
    i18n,
  }
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function asOptionalFeatureVersion(value: unknown) {
  const version = asOptionalInteger(value)

  return version !== null && version >= 0 && version <= 2_147_483_647 ? version : null
}

export function buildDivisionBaseHashInput(
  base:
    | Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
    | Omit<NewDivisionRow, 'snapshotId'>,
) {
  return {
    bbox: base.bbox,
    cartography: base.cartography,
    geometry: base.geometry,
    hierarchy: base.hierarchy,
    id: base.id,
    identifiers: base.identifiers ?? null,
    level: base.level,
    sourceKeys: base.sourceKeys,
    sources: base.sources,
    type: base.type,
    wikidata: base.wikidata ?? null,
  } satisfies Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
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

export function resolveDistrictId(base: {
  hierarchy: unknown
  id: string
  type: string
}) {
  if (base.type === 'district') return base.id
  if (!Array.isArray(base.hierarchy)) return null

  for (const entry of base.hierarchy) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (record.type !== 'district') continue
    const divisionId = record.division_id
    if (typeof divisionId === 'string' && divisionId.trim()) return divisionId
  }

  return null
}

export function normaliseDivisionI18nSnapshotRow(row: DivisionI18nPayload) {
  return {
    ...row,
    isLocaleInferred: Boolean(row.isLocaleInferred),
  } satisfies DivisionI18nPayload
}

export function buildCanonicalDivisionApiI18n(rows: DivisionI18nPayload[]) {
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

/**
 * Produces record-level audit entries only when locale inference or an API-facing
 * locale fallback changes the released division i18n rows.
 */
export function buildOvertureDivisionLocaleProcessingActions(input: {
  canonicalI18n: DivisionI18nPayload[]
  division: Pick<NewDivisionRow, 'id' | 'level' | 'type'>
  rawNames: unknown
  sourceI18n: DivisionI18nPayload[]
}): ReleaseProcessingAction[] {
  const canonicalDivision = {
    id: input.division.id,
    level: input.division.level,
    type: input.division.type,
  }
  const evidenceBase = {
    canonicalDivision,
    sourceNames: input.rawNames ?? null,
    normalisedI18n: input.sourceI18n,
  }
  const inferredI18n = input.sourceI18n.filter(row => row.isLocaleInferred)
  const sourceLocales = new Set(input.sourceI18n.map(row => row.locale))
  const fallbackI18n = input.canonicalI18n.flatMap(row => {
    if (sourceLocales.has(row.locale)) return []

    const sourceRow = input.sourceI18n.find(candidate =>
      isDivisionI18nFallbackSource(candidate, row),
    )
    return [
      {
        ...row,
        sourceLocale: sourceRow?.locale ?? null,
      },
    ]
  })

  return [
    ...(inferredI18n.length > 0
      ? [
          {
            action: 'overture_division_locale_inferred',
            affectedRecordCount: 1,
            evidence: {
              ...evidenceBase,
              inferredI18n,
            },
            mode: 'automatic' as const,
            summary:
              'Inferred one or more division-name locales from unlabeled source text.',
          },
        ]
      : []),
    ...(fallbackI18n.length > 0
      ? [
          {
            action: 'overture_division_api_locale_fallback_added',
            affectedRecordCount: 1,
            evidence: {
              ...evidenceBase,
              fallbackI18n,
            },
            mode: 'automatic' as const,
            summary:
              'Added API-facing division locale fallback rows from available source variants.',
          },
        ]
      : []),
  ]
}

function isDivisionI18nFallbackSource(
  source: DivisionI18nPayload,
  fallback: DivisionI18nPayload,
) {
  return (
    source.name === fallback.name &&
    source.nameAlts === fallback.nameAlts &&
    source.nameRules === fallback.nameRules &&
    source.nameVariant === fallback.nameVariant &&
    source.isLocaleInferred === fallback.isLocaleInferred
  )
}

function normaliseOvertureSources(sources: unknown) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return undefined
  }

  return { overture: sources }
}

function normaliseOvertureSourceReferences(sources: unknown, sourceRecordId: string) {
  if (
    Array.isArray(sources) &&
    sources.length > 0 &&
    sources.every(hasOvertureSourceReference)
  ) {
    return sources
  }
  return [{ dataset: 'overture', sourceRecordId }]
}

function hasOvertureSourceReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const dataset = (value as Record<string, unknown>).dataset
  return typeof dataset === 'string' && dataset.trim().length > 0
}

/**
 * Builds localised division name/type rows from mixed source fields.
 */
function normaliseDivisionI18n(divisionId: string, names: unknown) {
  const localisedNames = new Map<string, Set<string>>()
  const localisedRuleEntries = new Map<string, DivisionNameRuleRecord[]>()
  const localisedInferredFlags = new Map<string, boolean>()
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
    addLocalisedValue(localisedNames, locale, value)

    if (options?.rule) {
      const rules = localisedRuleEntries.get(locale) ?? []
      rules.push(options.rule)
      localisedRuleEntries.set(locale, rules)
    }

    if (options?.inferred) {
      if (!localisedInferredFlags.has(locale)) {
        localisedInferredFlags.set(locale, true)
      }
      return
    }

    localisedInferredFlags.set(locale, false)
  }

  collectLocalisedValues(namesRecord?.common, addNameValue)
  collectLocalisedRuleValues(namesRecord?.rules, addNameValue)

  for (const inferredValue of inferLocale(namesRecord?.primary)) {
    addNameValue(inferredValue.locale, inferredValue.value, {
      inferred: true,
    })
  }

  const locales = new Set<string>(localisedNames.keys())

  return [...locales].sort().map(locale => {
    const values = [...(localisedNames.get(locale) ?? [])]
    const [name, ...alts] = values
    const nameRules = dedupeNameRules(localisedRuleEntries.get(locale) ?? [])

    return {
      divisionId,
      isLocaleInferred: localisedInferredFlags.get(locale) ?? false,
      locale,
      name: name ?? null,
      nameAlts: alts.length > 0 ? alts.join('|') : null,
      nameRules: nameRules.length > 0 ? nameRules : null,
      nameVariant: values.length > 0 ? values : null,
    } satisfies DivisionI18nPayload
  })
}

/**
 * Recursively collects localised text values from mixed object/array/string shapes.
 */
function collectLocalisedValues(
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
    const normalised = normaliseLocale(localeHint)

    if (normalised) {
      appendValue(normalised, value)
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
      collectLocalisedValues(item, appendValue, localeHint)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  const explicitLocale =
    normaliseLocale(asNonEmptyString(record.locale)) ??
    normaliseLocale(asNonEmptyString(record.language)) ??
    normaliseLocale(asNonEmptyString(record.lang)) ??
    normaliseLocale(localeHint)
  const directValue =
    asNonEmptyString(record.value) ??
    asNonEmptyString(record.name) ??
    asNonEmptyString(record.text)

  if (explicitLocale && directValue) {
    appendValue(explicitLocale, directValue)
    return
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    const nestedLocale = normaliseLocale(key) ?? explicitLocale
    collectLocalisedValues(nestedValue, appendValue, nestedLocale)
  }
}

/**
 * Collects localised rule entries and appends their values to locale name sets.
 */
function collectLocalisedRuleValues(
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
      collectLocalisedRuleValues(item, appendValue, localeHint)
    }
    return
  }

  if (typeof value === 'string') {
    const normalisedLocale = normaliseLocale(localeHint)

    if (normalisedLocale) {
      appendValue(normalisedLocale, value, {
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
    normaliseLocale(asNonEmptyString(record.locale)) ??
    normaliseLocale(asNonEmptyString(record.language)) ??
    normaliseLocale(asNonEmptyString(record.lang)) ??
    normaliseLocale(localeHint)
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
    const nestedLocale = normaliseLocale(key) ?? explicitLocale
    collectLocalisedRuleValues(nestedValue, appendValue, nestedLocale)
  }
}

/**
 * Unwraps singleton nested list wrappers produced by parquet decoding.
 */
export async function buildDivisionHierarchyLookup(file: AsyncBuffer) {
  const lookup = new Map<string, DivisionHierarchyLookupEntry>()

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE, {
    columns: ['id', 'subtype', 'class', 'parent_division_id', 'names'],
  })) {
    for (const row of batch) {
      const id = asNonEmptyString(row.id)

      if (!id) {
        continue
      }

      const otSubtype = asNonEmptyString(row.subtype)
      const otClass = asNonEmptyString(row.class)
      const parentDivisionId = asNonEmptyString(row.parent_division_id)
      const canonicalI18n = buildCanonicalDivisionApiI18n(
        normaliseDivisionI18n(id, row.names),
      )
      const i18n = Object.fromEntries(
        canonicalI18n
          .filter(
            (localised): localised is DivisionI18nPayload & { name: string } =>
              (localised.locale === 'en' || localised.locale === 'zh-hant') &&
              Boolean(localised.name),
          )
          .map(localised => [localised.locale, { name: localised.name }]),
      ) as DivisionHierarchyI18n

      lookup.set(id, {
        i18n,
        level: resolveDivisionLevel({
          row,
          otClass,
          otSubtype,
          parentDivisionId,
        }),
        type: resolveDivisionType({
          row,
          otClass,
          otSubtype,
          parentDivisionId,
        }),
      })
    }
  }

  return lookup
}

function normaliseDivisionHierarchies(
  value: unknown,
  divisionId: string,
  lookup: DivisionHierarchyLookup | undefined,
) {
  let normalised = value

  while (
    Array.isArray(normalised) &&
    normalised.length === 1 &&
    Array.isArray(normalised[0])
  ) {
    ;[normalised] = normalised
  }

  if (!Array.isArray(normalised)) {
    return normalised
  }

  return normalised.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return []
    }

    const record = entry as Record<string, unknown>
    const hierarchyDivisionId = asNonEmptyString(record.division_id)

    if (!hierarchyDivisionId || hierarchyDivisionId === divisionId) {
      return []
    }

    const rawSubtype = asNonEmptyString(record.subtype)
    const subtype = normaliseDivisionLevelToken(rawSubtype)

    if (subtype === 'country') {
      return []
    }

    const lookupEntry = lookup?.get(hierarchyDivisionId)

    if (subtype === 'locality' && !lookupEntry) {
      throw new Error(
        `Cannot normalise hierarchy locality entry ${hierarchyDivisionId} for division ${divisionId}.`,
      )
    }

    return [
      {
        division_id: hierarchyDivisionId,
        i18n:
          lookupEntry?.i18n ??
          buildHierarchyI18nFromName(hierarchyDivisionId, record.name),
        level: lookupEntry?.level ?? resolveHierarchyDivisionLevel(rawSubtype),
        type: lookupEntry?.type ?? resolveHierarchyDivisionType(rawSubtype),
      },
    ]
  })
}

function buildHierarchyI18nFromName(divisionId: string, name: unknown) {
  const inferred = inferLocale(name).filter(
    (value): value is { locale: 'en' | 'zh-hant'; value: string } =>
      value.locale === 'en' || value.locale === 'zh-hant',
  )

  if (inferred.length === 0) {
    throw new Error(
      `Could not resolve hierarchy i18n for division ${divisionId}; hierarchy division row was not available and hierarchy name did not infer en/zh-hant.`,
    )
  }

  return Object.fromEntries(
    inferred.map(value => [value.locale, { name: value.value }]),
  ) as DivisionHierarchyI18n
}

function resolveHierarchyDivisionLevel(rawSubtype: string | null) {
  const subtype = normaliseDivisionLevelToken(rawSubtype)

  if (subtype === 'dependency') {
    return 0
  }

  if (subtype === 'region') {
    return 2
  }

  if (subtype === 'macrohood') {
    return 4
  }

  if (subtype === 'neighborhood' || subtype === 'neighbourhood') {
    return 5
  }

  if (subtype === 'microhood') {
    return 6
  }

  if (subtype === 'locality') {
    throw new Error(
      'Cannot normalise hierarchy subtype `locality` without a class value.',
    )
  }

  throw new Error(`Unsupported hierarchy subtype: ${rawSubtype ?? 'null'}.`)
}

function resolveHierarchyDivisionType(rawSubtype: string | null) {
  const subtype = normaliseDivisionLevelToken(rawSubtype)

  if (subtype === 'dependency') {
    return 'sar'
  }

  if (subtype === 'region') {
    return 'district'
  }

  if (subtype === 'macrohood') {
    return 'macrohood'
  }

  if (subtype === 'neighborhood' || subtype === 'neighbourhood') {
    return 'neighbourhood'
  }

  if (subtype === 'microhood') {
    return 'microhood'
  }

  if (subtype === 'locality') {
    throw new Error(
      'Cannot normalise hierarchy subtype `locality` without a class value.',
    )
  }

  throw new Error(`Unsupported hierarchy subtype: ${rawSubtype ?? 'null'}.`)
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
  const normalisedSubtype = normaliseDivisionLevelToken(input.otSubtype)
  const normalisedClass = normaliseDivisionLevelToken(input.otClass)
  const normalisedAdminLevel = normaliseDivisionLevelToken(
    resolveAdminLevelToken(input.row),
  )

  if (isHongKongArea(input.row)) {
    return 1
  }

  if (normalisedSubtype === 'dependency') {
    return 0
  }

  if (normalisedSubtype === 'region') {
    return 2
  }

  if (normalisedSubtype === 'locality') {
    if (normalisedClass === 'city') {
      return 1
    }

    if (normalisedClass === 'town') {
      return 3
    }

    if (normalisedClass === 'village') {
      return 5
    }

    if (normalisedClass === 'hamlet') {
      return 6
    }
  }

  const candidates = [normalisedSubtype, normalisedClass, normalisedAdminLevel].filter(
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
  const normalisedSubtype = normaliseDivisionLevelToken(input.otSubtype)
  const normalisedClass = normaliseDivisionLevelToken(input.otClass)

  if (isHongKongArea(input.row)) {
    return 'area'
  }

  if (normalisedSubtype === 'country') {
    return 'country'
  }

  if (normalisedSubtype === 'dependency') {
    return 'sar'
  }

  if (normalisedSubtype === 'region') {
    return 'district'
  }

  if (normalisedSubtype === 'locality') {
    if (normalisedClass === 'city') {
      return 'area'
    }

    if (normalisedClass === 'town') {
      return 'town'
    }

    if (normalisedClass === 'village') {
      return 'village'
    }

    if (normalisedClass === 'hamlet') {
      return 'hamlet'
    }
  }

  if (normalisedSubtype === 'macrohood' || normalisedClass === 'macrohood') {
    return 'macrohood'
  }

  if (
    normalisedSubtype === 'neighborhood' ||
    normalisedSubtype === 'neighbourhood' ||
    normalisedClass === 'neighborhood' ||
    normalisedClass === 'neighbourhood'
  ) {
    return 'neighbourhood'
  }

  if (normalisedSubtype === 'microhood' || normalisedClass === 'microhood') {
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

export function resolveAdminLevelValue(row: Record<string, unknown>) {
  return asOptionalInteger(row.admin_level) ?? asOptionalInteger(row.adminLevel)
}

function buildOvertureCompatibilitySourceKeys(level: number) {
  if (level === 0) {
    return {
      admin_level: 1,
    }
  }

  if (level === 2) {
    return {
      admin_level: 2,
    }
  }

  return {}
}

function sourceString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function normaliseDivisionLevelToken(value: string | null) {
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

  const pushLocalised = (value: unknown) => {
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
      for (const localisedValue of Object.values(value as Record<string, unknown>)) {
        pushValue(localisedValue)
      }
    }
  }

  pushValue(names.primary)
  pushLocalised(names.common)

  return [...candidates]
}

function dedupeNameRules(rules: DivisionNameRuleRecord[]) {
  const seen = new Set<string>()
  const deduped: DivisionNameRuleRecord[] = []

  for (const rule of rules) {
    const normalisedRule = {
      value: rule.value.trim(),
      variant: rule.variant?.trim() ?? null,
    }

    if (!normalisedRule.value) {
      continue
    }

    const key = stableJsonStringify(normalisedRule)

    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(normalisedRule)
  }

  return deduped
}

export function parseWkbGeometry(value: unknown): GeoJsonGeometry | null {
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

export function asGeoJsonGeometry(value: unknown): GeoJsonGeometry | null {
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
