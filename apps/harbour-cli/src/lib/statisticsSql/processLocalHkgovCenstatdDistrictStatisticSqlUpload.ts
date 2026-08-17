import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import {
  buildHkgovCenstatdDistrictStatisticHistoryRecord,
  createHkgovCenstatdDistrictResolution,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisionStatistics'
import { createHash, stableJsonStringify } from '@repo/core/pipeline/utils'
import { metaSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
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
  type StatisticSqlReplayProgress,
} from './statisticSqlReplay.ts'

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
        cacheTableProfile: 'divisionStatistic',
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
    progress.complete(
      `Prepared statistic cache in ${formatDuration(Date.now() - cacheStartedAt)}`,
    )
  }
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = target.remote
    ? (createHarbourControlClient(target) as HarbourClient)
    : createLocalControlClient(metaDb, {
        publishClient: createLocalStatisticPublishClient(metaDb),
      })

  try {
    const processingStepCount = target.remote ? 7 : 5
    progress.beginPhase('Start district statistic processing', {
      max: processingStepCount,
    })
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: plan.type, sourceRows: plan.rowCount },
      releaseCode,
    )
    progress.update(1, { label: 'Resolve canonical districts' })
    const resolutionBySourceDistrictCode = await resolveCanonicalDistricts(metaDb)
    progress.update(2, { label: 'Read 18 publisher statistic rows' })
    const sourceRows = await readSourceRows(
      preparedUpload.filePath,
      releaseId,
      releaseCode,
      plan.sourceVersion,
    )
    if (sourceRows.length !== 18 || sourceRows.length !== plan.rowCount) {
      throw new Error(
        `Expected 18 C&SD district statistic rows; imported ${sourceRows.length}.`,
      )
    }
    assertUniqueDistrictAssertions(sourceRows)
    progress.update(3, { label: 'Normalise district statistics' })
    const historyRows = await Promise.all(
      sourceRows.map(row =>
        normaliseHistoryRow(row, resolutionBySourceDistrictCode, releaseId),
      ),
    )
    const batches = buildStatisticSqlBatches({
      history: { rows: historyRows, table: 'divisionStatistics' },
      releaseCode,
      releaseId,
      source: {
        rows: sourceRows,
        table: 'hkgovCenstatdDistrictLandAreaPopulationDensities',
      },
    })
    await replayStatisticSqlBatches(
      target,
      context,
      plan.sourceVersion.slice(0, 4),
      batches,
      {
        onProgress(event) {
          updateStatisticReplayProgress(progress, event, target.remote)
        },
      },
    )

    progress.update(processingStepCount - 1, {
      label: 'Complete district statistic replay',
    })
    await client.stageCompleted(
      releaseId,
      'processDataset',
      { historyRows: historyRows.length, importedRows: sourceRows.length },
      releaseCode,
    )
    progress.update(processingStepCount, {
      label: 'Publish district statistic release',
    })
    const published = await client.publishDataset(releaseId, releaseCode)
    progress.complete('Published district statistic release')
    return published
  } catch (error) {
    progress.fail()
    await client
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    context.cleanup()
  }
}

function formatDuration(durationMs: number) {
  return `${Math.max(0, Math.round(durationMs / 1_000))} s`
}

function updateStatisticReplayProgress(
  progress: LocalUploadProgress,
  event: StatisticSqlReplayProgress,
  isRemote: boolean,
) {
  const phaseLabels = {
    'local-replay': 'Replay source and history in local cache',
    'remote-history-replay': 'Replay history into remote D1',
    'remote-source-replay': 'Replay source into remote D1',
  } as const
  const phaseStep =
    event.phase === 'local-replay' ? 4 : event.phase === 'remote-source-replay' ? 5 : 6
  if (!isRemote && event.phase !== 'local-replay') return
  progress.update(phaseStep, {
    label: `${phaseLabels[event.phase]} (${event.completedBatches}/${event.totalBatches})`,
  })
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

async function resolveCanonicalDistricts(metaDb: HarbourReadableDb) {
  const [censtatdRows, hadRows] = await Promise.all([
    metaDb
      .select({
        canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
        externalCode: metaSchema.metaIdentifierBridges.externalCode,
      })
      .from(metaSchema.metaIdentifierBridges)
      .where(
        and(
          eq(metaSchema.metaIdentifierBridges.authority, 'hkgov-censtatd'),
          eq(metaSchema.metaIdentifierBridges.cohortKey, '2021'),
          eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
          eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
        ),
      )
      .all(),
    metaDb
      .select({
        canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
        externalCode: metaSchema.metaIdentifierBridges.externalCode,
      })
      .from(metaSchema.metaIdentifierBridges)
      .where(
        and(
          eq(metaSchema.metaIdentifierBridges.authority, 'hkgov-had'),
          eq(metaSchema.metaIdentifierBridges.cohortKey, '2022'),
          eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
          eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
        ),
      )
      .all(),
  ])
  return createHkgovCenstatdDistrictResolution(censtatdRows, hadRows)
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
