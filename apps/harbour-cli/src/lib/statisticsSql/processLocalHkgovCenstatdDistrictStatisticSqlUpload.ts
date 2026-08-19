import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import { replaceDatasetStatsAndReturnRows } from '@repo/core/pipeline/db/stats'
import { replaceReleaseProcessingActionsAndReturnRows } from '@repo/core/pipeline/db/processingActions'
import {
  buildCenstatdGeographyLinkAuditActions,
  buildCenstatdMeasureCurationAuditActions,
  buildCenstatdNormalisationAuditActions,
  buildCenstatdReleaseStats,
  buildCenstatdStructuralChurnStats,
  censtatdReleaseStatsProfileFor,
} from '@repo/core/pipeline/services/censtatdReleaseStats'
import { createHash as createNodeHash } from 'node:crypto'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import {
  buildHkgovCenstatdDistrictStatisticHistoryRecord,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisionStatistics'
import { createHash, stableJsonStringify } from '@repo/core/pipeline/utils'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  updateDbCacheProgress,
} from '../dbCache/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  buildStatisticSqlBatches,
  replayStatisticSqlBatches,
} from './statisticSqlReplay.ts'
import {
  buildCanonicalStatsSqlBatches,
  replayCanonicalStatsSqlBatches,
} from './canonicalStatsSql.ts'
import { resolveHkgovCenstatdDistrictBridge } from './censtatdDistrictBridge.ts'
import {
  normaliseHkgovCenstatdStatistics,
  persistedCanonicalObservation,
} from './normaliseHkgovCenstatdStatistics.ts'
import { resolveCenstatdMeasureMetadata } from './censtatdMeasureCuration.ts'
import { findPreviousComparableCenstatdReleaseStats } from './censtatdReleaseChurn.ts'
import {
  replayReleaseProcessingActionsMetaToRemote,
  replayReleaseStatsMetaToRemote,
} from './releaseStatsMetaReplay.ts'
import {
  completeStatisticCache,
  runStatisticProgressStep,
} from './statisticProgress.ts'

type Plan = {
  cohortKey: string
  regionCode: 'hk'
  releaseCode: string
  rowCount: number
  source: 'hkgov-censtatd'
  sourceVersion: string
  theme: 'stats'
  type: 'divisionStatistic'
}
type UploadResult = { releaseCode?: string; releaseId?: string }

type SourceStatisticRow = {
  createdAt: string
  districtCode: number
  districtEn: string
  districtZhHant: string
  isCurrent: boolean
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  rawProperties: unknown
  referenceYear: string
  releaseId: string
  sourceGeometry: unknown
  sourceRecordId: string
  sources: unknown
  updatedAt: string
  validFromRelease: string
  validToRelease: null
  version: number
  versionHash: string
}

type HistoryStatisticRow = {
  createdAt: string
  districtCode: string
  divisionId: string
  id: string
  isCurrent: boolean
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  referenceYear: string
  sourceKeys: unknown
  sourceReleaseId: string
  sources: unknown
  updatedAt: string
  versionHash: string
}

/**
 * Persists raw C&SD source assertions, then publishes their canonical
 * Division Statistics history observations. Source rows never contain a
 * canonical district code or division ID.
 */
export async function processLocalHkgovCenstatdDistrictStatisticSqlUpload(
  target: UploadTarget,
  plan: Plan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { promptForCuration: boolean },
) {
  const releaseId = required(uploadResult.releaseId, 'releaseId')
  const releaseCode = required(uploadResult.releaseCode, 'releaseCode')
  const progress = new LocalUploadProgress()
  const cacheStartedAt = Date.now()
  progress.beginPhase('Prepare statistic processing cache', { max: null })
  let context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  try {
    context = await resolveLocalAddressDbContext(
      target,
      plan.regionCode,
      plan.sourceVersion.slice(0, 4),
      {
        cacheTableProfile: 'statistics',
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }
  if (progress.hasActivePhase()) {
    completeStatisticCache(progress, {
      durationMs: Date.now() - cacheStartedAt,
      remote: target.remote,
    })
  }
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = target.remote
    ? (createHarbourControlClient(target) as HarbourClient)
    : createLocalControlClient(metaDb, {
        publishClient: createLocalStatisticPublishClient(metaDb),
      })

  let processingStarted = false
  try {
    const resolutionBySourceDistrictCode = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: 18, subject: 'canonical districts' },
      () => resolveHkgovCenstatdDistrictBridge(metaDb, '2021'),
    )
    const sourceRows = await runStatisticProgressStep(
      progress,
      { action: 'Prepare', count: plan.rowCount, subject: 'statistic rows' },
      () =>
        readSourceRows(
          preparedUpload.filePath,
          releaseId,
          releaseCode,
          plan.sourceVersion,
        ),
    )
    if (sourceRows.length !== 18 || sourceRows.length !== plan.rowCount) {
      throw new Error(
        `Expected 18 C&SD district statistic rows; imported ${sourceRows.length}.`,
      )
    }
    assertUniqueDistrictAssertions(sourceRows)
    const historyRows = await runStatisticProgressStep(
      progress,
      { action: 'Normalise', count: sourceRows.length, subject: 'records' },
      () =>
        Promise.all(
          sourceRows.map(row =>
            normaliseHistoryRow(row, resolutionBySourceDistrictCode, releaseId),
          ),
        ),
    )
    const canonicalInput = sourceRows.map(row => ({
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      divisionId:
        resolutionBySourceDistrictCode.get(row.districtCode)?.divisionId ?? null,
      properties: object(row.rawProperties, 'rawProperties'),
      sourceFeatureId: `Density_${plan.sourceVersion}:${row.districtCode}`,
      sourceReleaseId: releaseId,
      sourceVersion: plan.sourceVersion,
    }))
    let canonical = normaliseHkgovCenstatdStatistics(canonicalInput)
    const measureMetadata = await runStatisticProgressStep(
      progress,
      { action: 'Review', count: canonical.measures.length, subject: 'measures' },
      () =>
        resolveCenstatdMeasureMetadata({
          measures: canonical.measures,
          promptForCuration: options.promptForCuration,
        }),
    )
    canonical = await runStatisticProgressStep(
      progress,
      { action: 'Curate', count: canonical.measures.length, subject: 'measures' },
      () => normaliseHkgovCenstatdStatistics(canonicalInput, { measureMetadata }),
    )
    const batches = await runStatisticProgressStep(
      progress,
      { action: 'Generate SQL', count: sourceRows.length, subject: 'source' },
      () =>
        buildStatisticSqlBatches({
          history: { rows: historyRows, table: 'divisionStatistics' },
          releaseCode,
          releaseId,
          source: {
            rows: sourceRows,
            table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
          },
        }),
    )
    const canonicalHistoryBatches = await runStatisticProgressStep(
      progress,
      {
        action: 'Generate SQL',
        count: canonical.observations.length,
        subject: 'history',
      },
      () =>
        buildCanonicalStatsSqlBatches({
          current: [],
          history: canonicalHistoryRows(canonical, releaseId),
        }),
    )
    const canonicalCurrentBatches = await runStatisticProgressStep(
      progress,
      {
        action: 'Generate SQL',
        count: canonical.observations.length,
        subject: 'current',
      },
      () =>
        buildCanonicalStatsSqlBatches({
          current: canonicalCurrentRows(canonical),
          history: [],
        }),
    )
    const canonicalBatches = {
      current: canonicalCurrentBatches.current,
      history: canonicalHistoryBatches.history,
    }
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: plan.type, sourceRows: plan.rowCount },
      releaseCode,
    )
    processingStarted = true
    await runStatisticProgressStep(
      progress,
      {
        action: 'Import SQL',
        count:
          (batches.source.length + batches.history.length) * (target.remote ? 2 : 1),
        subject: 'batches',
      },
      () =>
        replayStatisticSqlBatches(
          target,
          context,
          plan.sourceVersion.slice(0, 4),
          batches,
        ),
    )
    await runStatisticProgressStep(
      progress,
      {
        action: 'Import canonical SQL',
        count:
          (canonicalBatches.current.length + canonicalBatches.history.length) *
          (target.remote ? 2 : 1),
        subject: 'batches',
      },
      () =>
        replayCanonicalStatsSqlBatches(
          target,
          context,
          plan.sourceVersion.slice(0, 4),
          canonicalBatches,
          {
            onProgress(event) {
              progress.update(event.completedBatches, {
                label: `Import canonical SQL: ${event.phase} (${event.completedBatches}/${event.totalBatches})`,
              })
            },
          },
        ),
    )
    const statsProfile = censtatdReleaseStatsProfileFor(
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      plan.sourceVersion,
    )
    const structuralStats = buildCenstatdReleaseStats(
      sourceRows.map(row => ({
        featureId: String(row.districtCode),
        layerName: `Density_${plan.sourceVersion}`,
      })),
      canonical,
      statsProfile,
    )
    const previousStats = await findPreviousComparableCenstatdReleaseStats(
      metaDb,
      releaseId,
    )
    const { materialisedProcessingActions, materialisedStats } =
      await runStatisticProgressStep(
        progress,
        { action: 'Calculate', count: structuralStats.length, subject: 'stats' },
        async () => {
          const materialisedStats = await replaceDatasetStatsAndReturnRows(
            metaDb,
            releaseId,
            [
              ...structuralStats,
              ...buildCenstatdStructuralChurnStats(structuralStats, previousStats),
            ],
          )
          const materialisedProcessingActions =
            await replaceReleaseProcessingActionsAndReturnRows(metaDb, releaseId, [
              ...buildCenstatdGeographyLinkAuditActions(
                statsProfile,
                sourceRows.length,
              ),
              ...buildCenstatdMeasureCurationAuditActions(canonical),
              ...buildCenstatdNormalisationAuditActions(canonical),
            ])
          await replayReleaseStatsMetaToRemote(
            target,
            context,
            releaseId,
            materialisedStats,
          )
          await replayReleaseProcessingActionsMetaToRemote(
            target,
            context,
            releaseId,
            materialisedProcessingActions,
          )
          return { materialisedProcessingActions, materialisedStats }
        },
      )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        historyRows: historyRows.length,
        importedRows: sourceRows.length,
        statsRows: materialisedStats.length,
        auditActions: materialisedProcessingActions.actions.length,
      },
      releaseCode,
    )
    const published = await runStatisticProgressStep(
      progress,
      { action: 'Publish', subject: 'statistic release' },
      async () => {
        const published = await client.publishDataset(releaseId, releaseCode)
        if (target.remote) {
          await refreshRemoteMetaCache(
            target.environment === 'production' ? 'production' : 'preview',
            context.state.dbCacheDir,
          )
        }
        return published
      },
    )
    return published
  } catch (error) {
    progress.fail()
    if (processingStarted) {
      await client
        .stageFailed(
          releaseId,
          'processDataset',
          error instanceof Error ? error.message : String(error),
          undefined,
          releaseCode,
        )
        .catch(() => undefined)
    }
    throw error
  } finally {
    context.cleanup()
  }
}

/**
 * The Stats API composition has not yet been activated. The local target must
 * still publish the processed source release so update checks compare source
 * release versions, rather than CSDI archive slots.
 */
function createLocalStatisticPublishClient(
  metaDb: HarbourReadableDb & HarbourWritableDb,
): HarbourClient {
  return {
    async publishDataset(releaseId) {
      await updateDatasetStatus(metaDb, releaseId, 'published')
    },
    async stageCompleted() {},
    async stageFailed() {},
    async stageRunning() {},
  }
}

async function readSourceRows(
  filePath: string,
  releaseId: string,
  releaseCode: string,
  sourceVersion: string,
) {
  const rows: SourceStatisticRow[] = []
  for await (const batch of readParquetObjectsInBatches(
    await asyncBufferFromFile(filePath),
    18,
  )) {
    rows.push(
      ...(await Promise.all(
        batch.map(row =>
          normaliseSourceRow(row, releaseId, releaseCode, sourceVersion),
        ),
      )),
    )
  }
  return rows
}

async function normaliseSourceRow(
  value: Record<string, unknown>,
  releaseId: string,
  releaseCode: string,
  sourceVersion: string,
): Promise<SourceStatisticRow> {
  const sourceRecordId = string(value.id, 'id')
  const referenceYear = string(value.reference_year, 'reference_year')
  if (referenceYear !== sourceVersion) {
    throw new Error(`Expected reference_year=${sourceVersion}.`)
  }
  const payload = {
    districtCode: integer(value.district_code, 'district_code'),
    districtEn: string(value.name_en, 'name_en'),
    districtZhHant: string(value.name_zh_hant, 'name_zh_hant'),
    landAreaSqKm: number(value.land_area_sq_km, 'land_area_sq_km'),
    midYearPopulationDensityPerSqKm: integer(
      value.mid_year_population_density_per_sq_km,
      'mid_year_population_density_per_sq_km',
    ),
    midYearPopulation: integer(value.mid_year_population, 'mid_year_population'),
    rawProperties: json(value.raw_properties, 'raw_properties'),
    referenceYear,
    sourceGeometry: json(value.source_geometry, 'source_geometry'),
    sourceRecordId,
    sources: json(value.sources, 'sources'),
  }
  const now = new Date().toISOString()
  return {
    ...payload,
    createdAt: now,
    isCurrent: true,
    releaseId,
    updatedAt: now,
    validFromRelease: releaseCode,
    validToRelease: null,
    version: 1,
    versionHash: await createHash(stableJsonStringify(payload)),
  }
}

async function normaliseHistoryRow(
  source: SourceStatisticRow,
  resolutionBySourceDistrictCode: ReadonlyMap<number, ResolvedHkgovCenstatdDistrict>,
  sourceReleaseId: string,
): Promise<HistoryStatisticRow> {
  // See `map_censtatd_district_code_to_canonical_division` in the
  // division-statistic merge ruleset selected by this dataset fixture. Keep
  // its field paths and localised description in sync with this canonical
  // identity resolution.
  const resolved = resolutionBySourceDistrictCode.get(source.districtCode)
  if (!resolved) {
    throw new Error(
      `No reviewed canonical district identity for C&SD districtCode=${source.districtCode}.`,
    )
  }
  const payload = buildHkgovCenstatdDistrictStatisticHistoryRecord(
    {
      districtCode: source.districtCode,
      id: source.sourceRecordId,
      landAreaSqKm: source.landAreaSqKm,
      midYearPopulation: source.midYearPopulation,
      midYearPopulationDensityPerSqKm: source.midYearPopulationDensityPerSqKm,
      nameEn: source.districtEn,
      nameZhHant: source.districtZhHant,
      referenceYear: source.referenceYear,
      sources: source.sources,
    },
    resolved,
  )
  const now = new Date().toISOString()
  return {
    ...payload,
    createdAt: now,
    isCurrent: true,
    sourceReleaseId,
    updatedAt: now,
    versionHash: await createHash(stableJsonStringify(payload)),
  }
}

function assertUniqueDistrictAssertions(rows: SourceStatisticRow[]) {
  const sourceRecordIds = new Set(rows.map(row => row.sourceRecordId))
  const districtCodes = new Set(rows.map(row => row.districtCode))
  if (sourceRecordIds.size !== rows.length || districtCodes.size !== rows.length) {
    throw new Error('C&SD district statistic input contains duplicate DC assertions.')
  }
}

function json(value: unknown, field: string) {
  if (typeof value !== 'string') throw new Error(`Expected ${field} JSON string.`)
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${field} JSON.`)
  }
}

function string(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Expected ${field}.`)
  return value.trim()
}

function number(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`Expected numeric ${field}.`)
  return parsed
}

function integer(value: unknown, field: string) {
  const parsed = number(value, field)
  if (!Number.isInteger(parsed)) throw new Error(`Expected integer ${field}.`)
  return parsed
}

function required(value: string | undefined, field: string) {
  if (!value) throw new Error(`Expected ${field}.`)
  return value
}

function object(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${field} object.`)
  }
  return value as Record<string, unknown>
}

function canonicalCurrentRows(
  canonical: ReturnType<typeof normaliseHkgovCenstatdStatistics>,
) {
  const now = new Date().toISOString()
  return [
    {
      rows: canonical.series.map(row => ({ ...row, createdAt: now, updatedAt: now })),
      table: 'statsSeries' as const,
    },
    {
      rows: canonical.observations.map(row => ({
        ...persistedCanonicalObservation(row),
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsObservations' as const,
    },
    {
      rows: canonical.measures.map(row => ({ ...row, createdAt: now, updatedAt: now })),
      table: 'statsMeasures' as const,
    },
    {
      rows: canonical.measuresI18n.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsMeasuresI18n' as const,
    },
    {
      rows: canonical.dimensions.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsDimensions' as const,
    },
    {
      rows: canonical.values.map(row => ({ ...row, createdAt: now, updatedAt: now })),
      table: 'statsValues' as const,
    },
    {
      rows: canonical.valuesI18n.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsValuesI18n' as const,
    },
    {
      rows: canonical.seriesDimensions.map(row => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
      table: 'statsSeriesDimensions' as const,
    },
  ]
}

function canonicalHistoryRows(
  canonical: ReturnType<typeof normaliseHkgovCenstatdStatistics>,
  sourceReleaseId: string,
) {
  const now = new Date().toISOString()
  const version = (row: Record<string, unknown>) => ({
    ...row,
    createdAt: now,
    isCurrent: true,
    sourceReleaseId,
    updatedAt: now,
    versionHash: createNodeHash('sha256')
      .update(stableJsonStringify(row) ?? JSON.stringify(row))
      .digest('hex'),
  })
  return [
    { rows: canonical.series.map(version), table: 'statsSeries' as const },
    {
      rows: canonical.observations.map(row =>
        version(persistedCanonicalObservation(row)),
      ),
      table: 'statsObservations' as const,
    },
    { rows: canonical.measures.map(version), table: 'statsMeasures' as const },
    { rows: canonical.measuresI18n.map(version), table: 'statsMeasuresI18n' as const },
    { rows: canonical.dimensions.map(version), table: 'statsDimensions' as const },
    { rows: canonical.values.map(version), table: 'statsValues' as const },
    { rows: canonical.valuesI18n.map(version), table: 'statsValuesI18n' as const },
    {
      rows: canonical.seriesDimensions.map(version),
      table: 'statsSeriesDimensions' as const,
    },
  ]
}
