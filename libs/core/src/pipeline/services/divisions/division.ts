import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
  assertPublishedSnapshotMaterialised,
} from '../publication/execute'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '../publication/sql'
import { missingOvertureHongKongAreaRows } from './overtureHongKongAreas'
import { missingOvertureHongKongCityRows } from './overtureHongKongCities'
import { geographicDivisionClassification, emptyDivisionHierarchies } from '@repo/db'
import { materialiseDivisionHierarchies } from './divisionHierarchies'
import { recordSourceResolutions, resolvedEntities } from '../../db/sourceResolutions'
import { landsdPlaceNameResolutions } from '../../db/landsdPlaceNameSources'
import type { NewSourceResolution } from '@repo/db/historySchema'
import { overtureSourcePayload } from '../sources/sourcePayload'
import {
  createBranchCounts,
  selectBranch,
  type BranchCounts,
} from '../../../provenance/branches'
import { divisionTaxonomyBranches } from './divisionTaxonomy'
import { divisionLocaleBranches } from './divisionLocaleBranches'
import { localeDetection, localeInferenceBranches } from '../../localeInference'
import {
  divisionLevel,
  divisionClass,
  hierarchyClassification,
  validateDivisionPolicy,
} from './divisionTaxonomy'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/division-normalisation.json'
import {
  checkHongKongHierarchy,
  createHongKongHierarchyGuard,
} from './hongKongHierarchyGuard'
import wkbFixture from '../../../../../../fixtures/meta/processing-rules/wkb-geometry.json'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import type { DatasetProcessingMessage } from '../../../types'
import {
  registerProcessingResult,
  registerRule,
  ProcessingGuardError,
  type ProvenanceStore,
} from '../../../provenance'
import { retainDivisionProvenance } from './divisionProvenance'
import {
  applyDivisionClassificationPatch,
  divisionClassificationFixture,
} from './divisionClassificationPatch'
import type { ApiLocale } from '../../../lib/apiLocales'
import { resolveLatestPublishedSnapshotForResourceTypeRegion } from '../../../lib/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  sourceSchema,
  SourceDatabase,
} from '@repo/db'
import { metaSchema } from '@repo/db'
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
} from '../../geojson'
import type { AsyncBuffer } from 'hyparquet'
import { resolveSourceRecordSchema } from '../../../sourceRecordSchemas'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../../parquetR2'
import {
  cloneDivisionCurrentSnapshot,
  closeCurrentDivisionVersions,
  countDivisionCurrentSnapshotI18nRows,
  countDivisionCurrentSnapshotRows,
  deleteStaleDivisionCurrentRows,
  getDivisionCurrentSnapshotTraceState,
  getDivisionVersionMapForSnapshot,
  insertDivisionVersionRows,
  prepareDivisionVersionInsertContext,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
} from '../../db/division'
import { replaceDatasetStats } from '../../db/stats'
import type { ReleaseProcessingAction } from '../../db/processingActions'
import {
  buildSourceReleaseId,
  closeSourceOvertureDivisionVersions,
  getMergedCurrentSourceOvertureDivisionMap,
  insertSourceOvertureDivisionVersions,
} from '../../db/source'
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
} from '../metrics/releaseStats'
import {
  addLocalisedValue,
  asNonEmptyString,
  createHash,
  inferLocale,
  normaliseLocale,
  stableJsonStringify,
} from '../../utils'
import {
  createOperationTimer,
  resolveDataShardEnvironment,
  resolveDebugEnabled,
} from '../runtime'
import {
  logDivisionTrace,
  logDivisionTraceGroup,
  logStructuredInfo,
  resolveDivisionTraceIds,
} from '../../logging'
import { readDivisionRowsWithFixtures } from './divisionFixtures'
import {
  buildOvertureHongKongAreaHierarchyEntry,
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  overtureHongKongAreaForDistrictName,
  overtureHongKongAreas,
  type OvertureHongKongArea,
} from './overtureHongKongAreas'

import type { DivisionVersionSnapshot } from '../../db/division'

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
  class: string
}

export type DivisionHierarchyLookup = ReadonlyMap<string, DivisionHierarchyLookupEntry>

type DivisionNormaliseOptions = {
  hierarchyGuard?: import('../../../provenance').AuditGuard
  /** A reviewed replacement will validate this identity's final hierarchy. */
  deferHierarchyGuard?: boolean
  branchCounts?: BranchCounts
  hierarchyLookup?: DivisionHierarchyLookup
  source?: Pick<DatasetProcessingMessage, 'source' | 'sourceVersion'> &
    Partial<Pick<DatasetProcessingMessage, 'regionCode'>>
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

const OVERTURE_HONG_KONG_LOK_MA_CHAU_LOOP_DIVISION_ID =
  '222b7818-970a-491d-98b6-b88d8c6f0161'

type DivisionCodeAssignment = {
  canonicalId: string
  divisionCode: string
  domainCode: string
}

async function loadDivisionCodeAssignments(metaDb: HarbourReadableDb) {
  const rows = await metaDb
    .select({
      canonicalId: metaSchema.metaDivisionCodes.canonicalId,
      divisionCode: metaSchema.metaDivisionCodes.divisionCode,
      domainCode: metaSchema.metaDivisionCodes.domainCode,
    })
    .from(metaSchema.metaDivisionCodes)
    .all()
  const assignments = new Map<string, string>()
  for (const row of rows as DivisionCodeAssignment[]) {
    const key = `${row.domainCode}\u0000${row.canonicalId}`
    if (assignments.has(key)) {
      throw new Error(`Duplicate curated Division code target for ${key}.`)
    }
    assignments.set(key, row.divisionCode)
  }
  return assignments
}

function divisionCodeDomainFor(
  message: Pick<DatasetProcessingMessage, 'source'>,
  division: Pick<NewDivisionRow, 'class'>,
) {
  if (message.source === 'overture') return 'geographic'
  if (message.source === 'hkgov-pland-new-town') return 'hkgov-pland-new-town'
  if (message.source === 'hkgov-censtatd' && division.class === 'housing-market-area') {
    return 'hkgov-censtatd-hma'
  }
  return null
}

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
    auditStore?: ProvenanceStore
  } = {},
): Promise<ProcessDatasetResult> {
  if (!options.auditStore)
    throw new Error('Division processing requires an audit assets store.')
  const debugEnabled = resolveDebugEnabled(process.env.DEBUG)
  const timings = createOperationTimer(debugEnabled)
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  let currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const file = await timings.measure('loadParquetBufferMs', () =>
    createAsyncBufferFromR2(bucket, message.rawObjectKey),
  )
  if (
    message.source === 'overture' &&
    message.resourceType === 'division' &&
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
  const publication: PublicationPreparation = {
    table: 'divisionPublicationState',
    scopeId: versionInsertContext.snapshotLineageId,
    snapshotId: versionInsertContext.snapshotId,
    publicationToken: versionInsertContext.releaseId,
    timestamp: new Date().toISOString(),
  }
  await beginSnapshotPublication(currentDb, publication)
  currentRepoDb = guardSnapshotPublicationWrites(currentRepoDb, publication)
  const divisionCodeAssignments = await timings.measure(
    'loadDivisionCodeAssignmentsMs',
    () => loadDivisionCodeAssignments(metaRepoDb),
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

    await assertPublishedSnapshotMaterialised(
      currentRepoDb,
      'divisionPublicationState',
      parentSnapshotId,
    )

    if (activeSnapshotRowCount !== currentRows.size) {
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

    if (activeSnapshotI18nRowCount !== expectedI18nRowCount) {
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
  const seenPublisherIds = new Set<string>()
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
  const hongKongAreaHierarchyAssignmentCounts = new Map<string, number>()
  let overtureHongKongDivisionClassificationCorrectionCount = 0
  const processingActions: ReleaseProcessingAction[] = []
  const branchCounts = createDivisionBranchCounts()
  const hierarchyGuard = createHongKongHierarchyGuard()
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
    buildDivisionHierarchyLookup(file, message),
  )

  for await (const {
    isSupplemental,
    replacedDivisionIds,
    rows: batch,
    processingActions: fixtureActions,
  } of readDivisionRowsWithFixtures(file, message, DIVISION_BATCH_SIZE)) {
    processingActions.push(...fixtureActions)
    const sourceResolutionRows: NewSourceResolution[] = []
    if (message.source === 'hkgov-landsd') {
      if (!sourceDb)
        throw new Error(
          'LandsD division resolution requires retained publisher source storage.',
        )
      sourceResolutionRows.push(
        ...(await landsdPlaceNameResolutions(
          [sourceDb as never],
          message.sourceVersion,
          versionInsertContext.snapshotId,
          batch.map(raw => ({ id: String(raw.id), raw })),
          buildSourceReleaseId(message),
        )),
      )
    }
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
        nameProvenance?: DivisionI18nPayload['nameProvenance']
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
      const normalised = normaliseDivisionRow(row, {
        deferHierarchyGuard: replacedDivisionIds.has(String(row.id)),
        hierarchyLookup,
        source: message,
        branchCounts,
        hierarchyGuard,
      })
      if (normalised.overtureHongKongDivisionClassificationCorrection) {
        overtureHongKongDivisionClassificationCorrectionCount += 1
      }
      if (normalised.overtureHongKongAreaHierarchyAssignment) {
        const { code } = normalised.overtureHongKongAreaHierarchyAssignment
        hongKongAreaHierarchyAssignmentCounts.set(
          code,
          (hongKongAreaHierarchyAssignmentCounts.get(code) ?? 0) + 1,
        )
      }
      const divisionCodeDomain = divisionCodeDomainFor(message, normalised.base)
      if (divisionCodeDomain) {
        Object.assign(normalised.base, {
          divisionCode:
            divisionCodeAssignments.get(
              `${divisionCodeDomain}\u0000${normalised.base.id}`,
            ) ?? null,
        })
      }
      const canonicalI18n = buildCanonicalDivisionApiI18n(normalised.i18n, branchCounts)
      if (message.source === 'overture' && message.resourceType === 'division') {
        processingActions.push(
          ...buildOvertureDivisionLocaleProcessingActions({
            canonicalI18n,
            division: normalised.base,
            rawNames: row.names,
            sourceI18n: normalised.i18n,
          }),
        )
      }
      const storedCanonicalI18n = normaliseDivisionI18nForStorage(canonicalI18n)
      const versionHash = await createHash(buildDivisionBaseHashInput(normalised.base))
      const churnHash = await createHash({
        base: buildDivisionBaseHashInput(normalised.base),
        i18n: storedCanonicalI18n,
      })

      processedRows += 1
      localisedRows += storedCanonicalI18n.length
      seenIds.add(normalised.base.id)
      updateLocaleStatsAccumulator(
        statsAccumulator,
        storedCanonicalI18n.map(row => ({
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
        localisedRows: storedCanonicalI18n,
        parentId: resolveParentDivisionIdFromHierarchy(normalised.base.hierarchies),
        type: normalised.base.class,
        versionHash,
      })
      let sourceChanged: boolean | null = null

      if (sourceDb && message.source === 'overture' && !isSupplemental) {
        seenPublisherIds.add(normalised.base.id)
        const releaseId = buildSourceReleaseId(message)
        const sourcePayloadHash = await createHash(row)
        sourceResolutionRows.push({
          snapshotId: versionInsertContext.snapshotId,
          sourceReleaseId: releaseId,
          sourceRecordId: normalised.base.id,
          sourceVersionHash: sourcePayloadHash,
          resolutions: { entities: resolvedEntities({ division: normalised.base.id }) },
        })
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
            sourceLocator: overtureSourcePayload(row).sourceLocator,
            rawProperties: overtureSourcePayload(row).rawProperties,
            sourceGeometry: overtureSourcePayload(row).sourceGeometry,
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
              i18n: storedCanonicalI18n.map(row => ({
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
        localeCount: storedCanonicalI18n.length,
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
        ...storedCanonicalI18n.map(row => ({
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
          ...storedCanonicalI18n.map(row => ({
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
        ...storedCanonicalI18n.map(row => ({
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

      await timings.measure('insertSourceOvertureDivisionVersionsMs', () =>
        insertSourceOvertureDivisionVersions(sourceDb, sourceVersionRows, {
          assumeVersionRowsAbsent: isInitialSourceLoad,
        }),
      )
    }
    await recordSourceResolutions(historyRepoDb, sourceResolutionRows)

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
  processingActions.push(
    ...buildOvertureHongKongDivisionClassificationProcessingActions(
      overtureHongKongDivisionClassificationCorrectionCount,
    ),
    ...buildOvertureHongKongAreaHierarchyProcessingActions(
      hongKongAreaHierarchyAssignmentCounts,
    ),
  )
  const audit = await retainDivisionProvenance(options.auditStore, {
    releaseId: message.releaseId ?? message.datasetId,
    datasetCode: message.datasetCode ?? message.datasetId,
    actions: processingActions,
    branchCounts,
    inputCount: processedRows,
    guards: [hierarchyGuard],
    outputCount: processedRowsById.size,
  })
  await registerProcessingResult(
    metaRepoDb,
    options.auditStore,
    message.releaseId ?? message.datasetId,
    audit.ref,
  )

  if (sourceDb && message.source === 'overture' && currentSourceRows) {
    const missingSourceIds = [...currentSourceRows.keys()].filter(
      id => !seenPublisherIds.has(id),
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
    resourceType: message.resourceType,
  })

  await completeSnapshotPublication(
    currentDb,
    publication,
    [
      buildPublicationRowCountSql('divisions', publication.snapshotId, processedRows),
      buildPublicationRowCountSql(
        'divisionsI18n',
        publication.snapshotId,
        localisedRows,
      ),
    ].join(' AND '),
  )
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
    const reason = [
      'Overture Hong Kong division parquet no longer matches dropped-field assumptions.',
      ...violations.map(violation => `- ${violation}`),
    ].join('\n')
    throw new ProcessingGuardError(reason, [
      {
        id: 'overture-division-source-assumptions',
        summary:
          'Verify the registered assumptions for dropped Overture source fields.',
        consequence: 'block-ingestion',
        status: 'failed',
        checked: 1,
        failed: 1,
        reason,
      },
    ])
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
 * Bulk rules are documented in the dataset fixture as
 * `derive_division_type_from_overture_taxonomy`,
 * `derive_division_level_from_overture_taxonomy`, and
 * `decode_wkb_geometry_to_geojson`. Keep those fixture descriptions aligned
 * with this transformation when changing its behaviour.
 */
function normaliseDivisionRowInternal(
  row: Record<string, unknown>,
  options: DivisionNormaliseOptions = {},
) {
  if (row.source === 'hkgov-censtatd') {
    return normaliseHkgovCenstatdStatisticDivisionRow(row, options.branchCounts)
  }
  const id = asNonEmptyString(row.id)
  const now = new Date().toISOString()

  if (!id) {
    throw new Error('Division row is missing `id`.')
  }

  const parentDivisionId = asNonEmptyString(row.parent_division_id)
  const otSubtype = asNonEmptyString(row.subtype)
  const otClass = asNonEmptyString(row.class)
  const overtureHongKongDivisionClassificationCorrection =
    applyDivisionClassificationPatch(row, options.source)
  const landsdPlaceName = row.source === 'hkgov-landsd'
  const type = landsdPlaceName
    ? 'settlement'
    : (overtureHongKongDivisionClassificationCorrection?.class ??
      resolveDivisionClass({
        row,
        otClass,
        otSubtype,
        parentDivisionId,
        branchCounts: options.branchCounts,
      }))
  const level = landsdPlaceName
    ? 5
    : (overtureHongKongDivisionClassificationCorrection?.level ??
      resolveDivisionLevel({
        row,
        otClass,
        otSubtype,
        parentDivisionId,
        branchCounts: options.branchCounts,
      }))
  const i18n = normaliseDivisionI18n(id, row.names, options.branchCounts)
  const normalisedHierarchies = normaliseDivisionHierarchies(
    row.hierarchies,
    id,
    options.hierarchyLookup,
  )
  const enrichedPaths = normalisedHierarchies.map(hierarchy =>
    insertOvertureHongKongAreaIntoHierarchy({
      division: { id, level, class: type },
      hierarchy,
      i18n,
    }),
  )
  const hierarchyWithHongKongArea = {
    hierarchy: materialiseDivisionHierarchies(
      id,
      enrichedPaths.map(path => path.hierarchy as NormalisedHierarchyEntry[]),
    ),
    assignment: enrichedPaths.find(path => path.assignment)?.assignment ?? null,
  }
  const normalisedGeometry = parseWkbGeometry(row.geometry)
  if (!options.deferHierarchyGuard)
    for (const enrichedPath of enrichedPaths)
      checkHongKongHierarchy(
        {
          country:
            row.country ?? (options.source?.regionCode === 'hk' ? 'HK' : undefined),
          id,
          class: type,
          level,
          name: i18n.find(entry => entry.locale === 'en')?.name ?? undefined,
          hierarchy: (enrichedPath.hierarchy as NormalisedHierarchyEntry[]).filter(
            entry => entry.class !== 'city',
          ),
        },
        options.hierarchyGuard,
      )

  return {
    base: {
      bbox: normalisedGeometry ? calculateGeoJsonBbox(normalisedGeometry) : null,
      cartography: row.cartography ?? null,
      createdAt: now,
      divisionCode: null,
      geometry: normalisedGeometry,
      hierarchies: hierarchyWithHongKongArea.hierarchy,
      id,
      identifiers: row.identifiers ?? null,
      level,
      category: geographicDivisionClassification(type)?.category ?? null,
      class: type,
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
    overtureHongKongDivisionClassificationCorrection,
    overtureHongKongAreaHierarchyAssignment: hierarchyWithHongKongArea.assignment,
  }
}

type OvertureHongKongAreaHierarchyAssignment = Pick<
  OvertureHongKongArea,
  'code' | 'names'
>

type NormalisedHierarchyEntry = {
  division_id: string
  i18n: DivisionHierarchyI18n
  level: number
  class: string
}

function insertOvertureHongKongAreaIntoHierarchy(input: {
  division: { id: string; level: number | null; class: string }
  hierarchy: unknown
  i18n: DivisionI18nPayload[]
}): {
  assignment: OvertureHongKongAreaHierarchyAssignment | null
  hierarchy: unknown
} {
  if (!Array.isArray(input.hierarchy)) {
    return { assignment: null, hierarchy: input.hierarchy }
  }

  const hierarchy = input.hierarchy as NormalisedHierarchyEntry[]
  const districtName = resolveDistrictNameForHongKongArea(input, hierarchy)
  const area = districtName ? overtureHongKongAreaForDistrictName(districtName) : null
  if (!area) return { assignment: null, hierarchy }

  const hongKongSarIndex = hierarchy.findIndex(
    entry => entry.division_id === OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  )
  if (hongKongSarIndex === -1) return { assignment: null, hierarchy }

  const areaEntry = buildOvertureHongKongAreaHierarchyEntry(area)
  // The source point for a recognised Area may sit inside one of its own
  // districts. Its canonical identity is the Area, so retain only its SAR
  // ancestors instead of inserting that same Area into its own ancestry.
  if (
    input.division.id === areaEntry.division_id &&
    input.division.class === 'area' &&
    input.division.level === 1
  ) {
    return { assignment: area, hierarchy: hierarchy.slice(0, hongKongSarIndex + 1) }
  }
  const withoutArea = hierarchy.filter(
    entry => entry.division_id !== areaEntry.division_id,
  )
  const insertionIndex =
    withoutArea.findIndex(
      entry => entry.division_id === OVERTURE_HONG_KONG_SAR_DIVISION_ID,
    ) + 1
  const enrichedHierarchy = [
    ...withoutArea.slice(0, insertionIndex),
    areaEntry,
    ...withoutArea.slice(insertionIndex),
  ]
  const unchanged =
    enrichedHierarchy.length === hierarchy.length &&
    enrichedHierarchy.every(
      (entry, index) => entry.division_id === hierarchy[index]?.division_id,
    )

  return {
    assignment: unchanged ? null : area,
    hierarchy: unchanged ? hierarchy : enrichedHierarchy,
  }
}

function resolveDistrictNameForHongKongArea(
  input: Pick<
    Parameters<typeof insertOvertureHongKongAreaIntoHierarchy>[0],
    'division' | 'i18n'
  >,
  hierarchy: NormalisedHierarchyEntry[],
) {
  if (input.division.class === 'district' && input.division.level === 2) {
    return input.i18n.find(row => row.locale === 'en')?.name ?? null
  }

  return hierarchy.find(entry => entry.class === 'district')?.i18n.en?.name ?? null
}

validateDivisionPolicy(ruleFixture.parameters)

export const divisionNormalisationRule = registerRule(
  {
    ...ruleDeclarationFromFixture(ruleFixture),
    parameters: {
      ...ruleFixture.parameters,
      localeDetection,
      branchCountSemantics:
        'Selected branches after precedence. Classification: one decision per source division; changed compares the result to raw level/class. Locale normalisation: one decision per target locale; changed means a copied row. Inference: one decision per evaluated primary/unlabelled text value; changed means locale-bearing output. Preparatory hierarchy lookups are excluded.',
    },
    branches: [
      ...divisionTaxonomyBranches(ruleFixture.parameters),
      ...divisionLocaleBranches(ruleFixture.parameters),
      ...localeInferenceBranches,
    ],
  },
  ({
    row,
    options,
  }: {
    row: Record<string, unknown>
    options: DivisionNormaliseOptions
  }) => normaliseDivisionRowInternal(row, options),
)

export function normaliseDivisionRow(
  row: Record<string, unknown>,
  options: DivisionNormaliseOptions = {},
) {
  try {
    return divisionNormalisationRule.execute({ row, options })
  } catch (error) {
    if (error instanceof ProcessingGuardError) throw error
    const reason = error instanceof Error ? error.message : String(error)
    throw new ProcessingGuardError(reason, [
      {
        id: 'division-source-normalisation',
        summary:
          'Require a source identity, supported classification, resolvable hierarchy and decodable geometry.',
        consequence: 'block-ingestion',
        status: 'failed',
        checked: 1,
        failed: 1,
        reason,
      },
    ])
  }
}

export function createDivisionBranchCounts() {
  return createBranchCounts(divisionNormalisationRule.declaration.branches!)
}

export function buildOvertureHongKongAreaHierarchyProcessingActions(
  assignmentCounts: ReadonlyMap<string, number>,
): ReleaseProcessingAction[] {
  return overtureHongKongAreas.flatMap(area => {
    const affectedRecordCount = assignmentCounts.get(area.code) ?? 0
    if (affectedRecordCount === 0) return []

    const areaHierarchyEntry = buildOvertureHongKongAreaHierarchyEntry(area)
    return [
      {
        action: 'overture_division_hong_kong_area_hierarchy_assigned',
        affectedRecordCount,
        evidence: {
          area: {
            code: area.code,
            divisionId: areaHierarchyEntry.division_id,
            names: area.names,
          },
        },
        mode: 'automatic',
        summary: `Normalised the ${area.names.en} hierarchy for ${affectedRecordCount} divisions.`,
      },
    ]
  })
}

export function buildOvertureHongKongDivisionClassificationProcessingActions(
  affectedRecordCount: number,
): ReleaseProcessingAction[] {
  if (affectedRecordCount === 0) return []

  return [
    {
      action: 'overture_hong_kong_lok_ma_chau_loop_reclassified',
      affectedRecordCount,
      evidence: {
        canonical: divisionClassificationFixture.entries[0]!.replacement,
        divisionId: OVERTURE_HONG_KONG_LOK_MA_CHAU_LOOP_DIVISION_ID,
        hierarchy:
          'The canonical hierarchy lookup applies the same correction to descendants.',
        source: divisionClassificationFixture.entries[0]!.expected,
      },
      mode: 'automatic',
      summary:
        'Reclassified Lok Ma Chau Loop from Overture’s level-2 region to a level-4 macrohood.',
    },
  ]
}

function normaliseHkgovCenstatdStatisticDivisionRow(
  row: Record<string, unknown>,
  branchCounts?: BranchCounts,
) {
  const id = asNonEmptyString(row.id)
  const type = asNonEmptyString(row.canonical_type)
  const level = asOptionalInteger(row.canonical_level)
  if (!id || !type || (level === null && type !== 'housing-market-area')) {
    throw new Error(
      'C&SD statistic geography requires id, canonical_type and a hierarchy level when applicable.',
    )
  }
  const names = parseJsonRecord(row.names, 'names')
  const geometry = parseJsonGeometry(row.geometry, 'geometry')
  const identifiers = parseJsonValue(row.identifiers, 'identifiers')
  const sources = parseJsonValue(row.sources, 'sources')
  const sourceProperties = parseJsonValue(row.source_properties, 'source_properties')
  const now = new Date().toISOString()
  return {
    base: {
      bbox: calculateGeoJsonBbox(geometry),
      cartography: null,
      createdAt: now,
      divisionCode: null,
      geometry,
      hierarchies: emptyDivisionHierarchies(),
      id,
      identifiers,
      level,
      sources: { hkgovCenstatd: { properties: sourceProperties, sources } },
      class: type,
      category: geographicDivisionClassification(type)?.category ?? null,
      updatedAt: now,
      wikidata: null,
    } satisfies Omit<NewDivisionRow, 'snapshotId'>,
    i18n: normaliseDivisionI18n(id, names, branchCounts),
    overtureHongKongDivisionClassificationCorrection: null,
    overtureHongKongAreaHierarchyAssignment: null,
  }
}

function parseJsonValue(value: unknown, field: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`C&SD statistic geography ${field} must be valid JSON.`)
  }
}

function parseJsonRecord(value: unknown, field: string) {
  const parsed = parseJsonValue(value, field)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`C&SD statistic geography ${field} must be an object.`)
  }
  return parsed as Record<string, unknown>
}

function parseJsonGeometry(value: unknown, field: string): GeoJsonGeometry {
  const parsed = parseJsonValue(value, field)
  const geometry = asGeoJsonGeometry(parsed)
  if (!geometry) throw new Error(`C&SD statistic geography ${field} is invalid.`)
  return geometry
}

function asOptionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function buildDivisionBaseHashInput(
  base:
    | Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
    | Omit<NewDivisionRow, 'snapshotId'>,
) {
  return {
    bbox: base.bbox,
    cartography: base.cartography,
    divisionCode: base.divisionCode ?? null,
    geometry: base.geometry,
    hierarchies: base.hierarchies,
    id: base.id,
    identifiers: base.identifiers ?? null,
    level: base.level ?? null,
    sources: base.sources,
    class: base.class,
    category: base.category ?? null,
    wikidata: base.wikidata ?? null,
  } satisfies Omit<DivisionRow, 'snapshotId' | 'createdAt' | 'updatedAt'>
}

function resolveParentDivisionIdFromHierarchy(hierarchy: unknown): string | null {
  const paths = (hierarchy as import('@repo/db').DivisionHierarchies | null)?.full ?? []
  const ids = [...new Set(paths.flatMap(path => path.at(-1)?.id ?? []))].sort()
  return ids.length === 1 ? ids[0]! : ids.length ? JSON.stringify(ids) : null
}

export function resolveDistrictId(base: {
  hierarchies: import('@repo/db').DivisionHierarchies
  id: string
  class: string
}) {
  if (base.class === 'district') return base.id
  const ids = new Set(
    base.hierarchies.administrative
      .flat()
      .filter(entry => entry.class === 'district')
      .map(entry => entry.id),
  )
  return ids.size === 1 ? [...ids][0]! : null
}

export function normaliseDivisionI18nSnapshotRow(row: DivisionI18nPayload) {
  return {
    ...row,
    isLocaleInferred: Boolean(row.isLocaleInferred),
    nameProvenance:
      row.nameProvenance ?? (row.isLocaleInferred ? 'inferred' : 'provided'),
  } satisfies DivisionI18nPayload
}

/**
 * Canonical records use an explicit provenance value. This keeps new rows equal
 * to their persisted predecessors when an upstream-provided name has no
 * provenance field of its own.
 */
export function normaliseDivisionI18nForStorage(rows: DivisionI18nPayload[]) {
  return rows.map(normaliseDivisionI18nSnapshotRow)
}

export function buildCanonicalDivisionApiI18n(
  rows: DivisionI18nPayload[],
  branchCounts?: BranchCounts,
) {
  const byLocale = new Map(rows.map(row => [row.locale, row] as const))
  const canonicalRows = [...rows]

  for (const [locale] of Object.entries(
    divisionNormalisationRule.declaration.parameters.apiLocaleFallbacks,
  ) as Array<[ApiLocale, string[]]>) {
    const source = selectBranch(
      divisionLocaleBranches(divisionNormalisationRule.declaration.parameters).filter(
        branch => branch.group === `Locale Normalisation: ${locale}`,
      ),
      Object.fromEntries([...byLocale.keys()].map(key => [key, true])),
      byLocale.has(locale) ? locale : 'none',
      branchCounts,
    )
    if (byLocale.has(locale) || source === 'none') continue
    const sourceRow = byLocale.get(String(source))
    if (!sourceRow) throw new Error('Selected locale branch has no source row.')

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
  division: { id: string; level: number | null; class: string }
  rawNames: unknown
  sourceI18n: DivisionI18nPayload[]
}): ReleaseProcessingAction[] {
  const canonicalDivision = {
    id: input.division.id,
    level: input.division.level,
    class: input.division.class,
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
    if (!sourceRow) return []

    return [
      {
        ...row,
        sourceLocale: sourceRow.locale,
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
    source.nameProvenance === fallback.nameProvenance &&
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

export function normaliseOvertureSourceReferences(sources: unknown) {
  if (
    Array.isArray(sources) &&
    sources.length > 0 &&
    sources.every(hasOvertureSourceReference)
  ) {
    return sources
  }
  return null
}

function hasOvertureSourceReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const dataset = (value as Record<string, unknown>).dataset
  return typeof dataset === 'string' && dataset.trim().length > 0
}

/**
 * Builds localised division name/type rows from mixed source fields.
 */
function normaliseDivisionI18n(
  divisionId: string,
  names: unknown,
  branchCounts?: BranchCounts,
) {
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

  collectLocalisedValues(namesRecord?.common, addNameValue, undefined, branchCounts)
  collectLocalisedRuleValues(namesRecord?.rules, addNameValue, undefined, branchCounts)

  for (const inferredValue of inferLocale(namesRecord?.primary, branchCounts)) {
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
  branchCounts?: BranchCounts,
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

    for (const inferredValue of inferLocale(value, branchCounts)) {
      appendValue(inferredValue.locale, inferredValue.value, {
        inferred: true,
      })
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalisedValues(item, appendValue, localeHint, branchCounts)
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
    collectLocalisedValues(nestedValue, appendValue, nestedLocale, branchCounts)
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
  branchCounts?: BranchCounts,
) {
  if (value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLocalisedRuleValues(item, appendValue, localeHint, branchCounts)
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

    for (const inferredValue of inferLocale(value, branchCounts)) {
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
      ? inferLocale(directValue, branchCounts).map(inferredValue => ({
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
    collectLocalisedRuleValues(nestedValue, appendValue, nestedLocale, branchCounts)
  }
}

/**
 * Builds canonical ancestor classifications from the source division schema.
 */
export async function buildDivisionHierarchyLookup(
  file: AsyncBuffer,
  source: Pick<DatasetProcessingMessage, 'source' | 'sourceVersion'> &
    Partial<Pick<DatasetProcessingMessage, 'regionCode'>>,
) {
  const lookup = new Map<string, DivisionHierarchyLookupEntry>()
  const sourceRows: Record<string, unknown>[] = []
  const schema = resolveSourceRecordSchema({ ...source, resourceType: 'division' })
  if (source.source === 'overture' && !schema) {
    throw new Error(`No accepted Overture division schema for ${source.sourceVersion}.`)
  }
  const columns = ['id', 'subtype', 'class', 'parent_division_id', 'names']
  if (schema?.fields.some(field => field.name === 'admin_level')) {
    columns.push('admin_level')
  }

  for await (const batch of readParquetObjectsInBatches(file, DIVISION_BATCH_SIZE, {
    columns,
  })) {
    sourceRows.push(...batch)
    for (const row of batch) {
      const id = asNonEmptyString(row.id)

      if (!id || lookup.has(id)) {
        const reason = !id
          ? 'Division source row is missing its identity.'
          : `Duplicate division source identity: ${id}.`
        throw new ProcessingGuardError(reason, [
          {
            id: 'division-source-identities',
            summary: 'Require non-empty, unique source division identities.',
            consequence: 'block-ingestion',
            status: 'failed',
            checked: lookup.size + 1,
            failed: 1,
            reason,
          },
        ])
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

      const classification = applyDivisionClassificationPatch(row, source)
      lookup.set(id, {
        i18n,
        level:
          classification?.level ??
          resolveDivisionLevel({
            row,
            otClass,
            otSubtype,
            parentDivisionId,
          }),
        class:
          classification?.class ??
          resolveDivisionClass({
            row,
            otClass,
            otSubtype,
            parentDivisionId,
          }),
      })
    }
  }

  if (source.source === 'overture' && source.regionCode === 'hk') {
    const message = {
      source: 'overture',
      regionCode: 'hk',
      resourceType: 'division',
    } as const
    const supplemental = [
      ...missingOvertureHongKongAreaRows(message, sourceRows),
      ...missingOvertureHongKongCityRows(message, sourceRows),
    ]
    for (const row of supplemental) {
      const normalised = normaliseDivisionRow(row, {
        hierarchyLookup: lookup,
        deferHierarchyGuard: true,
      })
      lookup.set(normalised.base.id, {
        class: normalised.base.class,
        level: normalised.base.level ?? 0,
        i18n: Object.fromEntries(
          normalised.i18n
            .filter(entry => entry.name)
            .map(entry => [entry.locale, { name: entry.name! }]),
        ),
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
  if (!Array.isArray(value) || !value.length)
    return [[]] as NormalisedHierarchyEntry[][]
  const paths = Array.isArray(value[0]) ? value : [value]
  return paths.map(normalised => {
    if (!Array.isArray(normalised))
      throw new Error(`Invalid hierarchy path for ${divisionId}.`)
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
          class: lookupEntry?.class ?? resolveHierarchyDivisionType(rawSubtype),
        },
      ]
    })
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

function resolveHierarchyDivisionLevel(rawSubtype: string | null): number {
  return hierarchyClassification(
    divisionNormalisationRule.declaration.parameters,
    normaliseDivisionLevelToken(rawSubtype),
  ).level
}

function resolveHierarchyDivisionType(rawSubtype: string | null): string {
  return hierarchyClassification(
    divisionNormalisationRule.declaration.parameters,
    normaliseDivisionLevelToken(rawSubtype),
  ).class
}

type DivisionTaxonomyInput = {
  otSubtype: string | null
  otClass: string | null
  parentDivisionId: string | null
  row: Record<string, unknown>
  branchCounts?: BranchCounts
}

function divisionTaxonomyHints(input: DivisionTaxonomyInput) {
  return {
    subtype: normaliseDivisionLevelToken(input.otSubtype),
    class: normaliseDivisionLevelToken(input.otClass),
    adminLevel: normaliseDivisionLevelToken(resolveAdminLevelToken(input.row)),
    hasParent: Boolean(input.parentDivisionId),
    isHongKongArea: isHongKongArea(input.row),
  }
}

function resolveDivisionLevel(input: DivisionTaxonomyInput): number {
  return divisionLevel(
    divisionNormalisationRule.declaration.parameters,
    divisionTaxonomyHints(input),
    input.branchCounts,
    input.row.level,
  )
}

function resolveDivisionClass(input: DivisionTaxonomyInput): string {
  return divisionClass(
    divisionNormalisationRule.declaration.parameters,
    divisionTaxonomyHints(input),
    input.branchCounts,
    input.row.class,
  )
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

function normaliseDivisionLevelToken(value: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replaceAll(/[\s-]+/g, '_') ?? ''
  )
}

function isHongKongArea(row: Record<string, unknown>) {
  const identifiers = row.identifiers as
    | { saanseoiCorrection?: { code?: string } }
    | undefined
  return Boolean(
    identifiers?.saanseoiCorrection?.code &&
      overtureHongKongAreas.some(
        area => area.code === identifiers.saanseoiCorrection?.code,
      ),
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
  return wkbGeometryRule.execute(value)
}

export const wkbGeometryRule = registerRule(
  ruleDeclarationFromFixture(wkbFixture),
  decodeWkbGeometry,
)

function decodeWkbGeometry(value: unknown): GeoJsonGeometry | null {
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
