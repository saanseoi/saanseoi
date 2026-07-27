import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import {
  buildHkgovCenstatdDistrictStatisticHistoryRecord,
  createHkgovCenstatdDistrictResolution,
  type ResolvedHkgovCenstatdDistrict,
} from '@repo/core/pipeline/services/divisionStatistics'
import {
  chunkArray,
  createHash,
  getMaxRowsPerInsert,
  stableJsonStringify,
} from '@repo/core/pipeline/utils'
import { historySchema, metaSchema, sourceSchema } from '@repo/db'
import { and, eq, inArray } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { createHarbourControlClient } from '../api/harbourControl.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'

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
  isCurrent: boolean
  landAreaSqKm: number
  midYearPopulation: number
  midYearPopulationDensityPerSqKm: number
  nameEn: string
  nameZhHant: string
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
  const context = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = target.remote
    ? (createHarbourControlClient(target) as HarbourClient)
    : createLocalControlClient(metaDb, {
        publishClient: createLocalStatisticPublishClient(metaDb),
      })

  try {
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: plan.type, sourceRows: plan.rowCount },
      releaseCode,
    )
    const resolutionBySourceDistrictCode = await resolveCanonicalDistricts(metaDb)
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
    const historyRows = await Promise.all(
      sourceRows.map(row =>
        normaliseHistoryRow(row, resolutionBySourceDistrictCode, releaseId),
      ),
    )
    const now = new Date().toISOString()

    await closeCurrentSourceRows(
      context.sourceDb as HarbourWritableDb,
      sourceRows.map(row => row.sourceRecordId),
      releaseCode,
      now,
    )
    await closeCurrentHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      historyRows.map(row => row.id),
      now,
    )
    await insertSourceRows(context.sourceDb as HarbourWritableDb, sourceRows)
    await insertSourceI18nRows(
      context.sourceDb as HarbourWritableDb,
      await Promise.all(
        sourceRows.flatMap(row => [
          i18nRow(row, 'en', row.nameEn),
          i18nRow(row, 'zh-hant', row.nameZhHant),
        ]),
      ),
    )
    await insertHistoryRows(
      context.historyDb as unknown as HarbourWritableDb,
      historyRows,
    )

    await client.stageCompleted(
      releaseId,
      'processDataset',
      { historyRows: historyRows.length, importedRows: sourceRows.length },
      releaseCode,
    )
    return client.publishDataset(releaseId, releaseCode)
  } catch (error) {
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
    nameEn: string(value.name_en, 'name_en'),
    nameZhHant: string(value.name_zh_hant, 'name_zh_hant'),
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
      nameEn: source.nameEn,
      nameZhHant: source.nameZhHant,
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

async function closeCurrentSourceRows(
  db: HarbourWritableDb,
  sourceRecordIds: string[],
  releaseCode: string,
  now: string,
) {
  if (sourceRecordIds.length === 0) return
  await db
    .update(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities)
    .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
    .where(
      and(
        eq(
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities.isCurrent,
          true,
        ),
        inArray(
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
            .sourceRecordId,
          sourceRecordIds,
        ),
      ),
    )
    .run()
  await db
    .update(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n)
    .set({ isCurrent: false, updatedAt: now, validToRelease: releaseCode })
    .where(
      and(
        eq(
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
            .isCurrent,
          true,
        ),
        inArray(
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
            .sourceRecordId,
          sourceRecordIds,
        ),
      ),
    )
    .run()
}

async function closeCurrentHistoryRows(
  db: HarbourWritableDb,
  ids: string[],
  now: string,
) {
  if (ids.length === 0) return
  await db
    .update(historySchema.divisionStatistics)
    .set({ isCurrent: false, updatedAt: now })
    .where(
      and(
        eq(historySchema.divisionStatistics.isCurrent, true),
        inArray(historySchema.divisionStatistics.id, ids),
      ),
    )
    .run()
}

async function insertSourceRows(db: HarbourWritableDb, rows: SourceStatisticRow[]) {
  // This source assertion has 17 bound columns, including source versioning.
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(17))) {
    await db
      .insert(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities)
      .values(chunk.map(({ nameEn: _en, nameZhHant: _zh, ...row }) => row))
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
            .sourceRecordId,
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
            .versionHash,
        ],
        set: {
          isCurrent: true,
          releaseId: chunk[0]?.releaseId,
          updatedAt: new Date().toISOString(),
          validToRelease: null,
        },
      })
      .run()
  }
}

async function insertSourceI18nRows(
  db: HarbourWritableDb,
  rows: Awaited<ReturnType<typeof i18nRow>>[],
) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(13))) {
    await db
      .insert(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
            .sourceRecordId,
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
            .versionHash,
          sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n.locale,
        ],
        set: {
          isCurrent: true,
          releaseId: chunk[0]?.releaseId,
          updatedAt: new Date().toISOString(),
          validToRelease: null,
        },
      })
      .run()
  }
}

async function insertHistoryRows(db: HarbourWritableDb, rows: HistoryStatisticRow[]) {
  for (const chunk of chunkArray(rows, getMaxRowsPerInsert(13))) {
    await db
      .insert(historySchema.divisionStatistics)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          historySchema.divisionStatistics.id,
          historySchema.divisionStatistics.versionHash,
        ],
        set: {
          isCurrent: true,
          sourceReleaseId: chunk[0]?.sourceReleaseId,
          updatedAt: new Date().toISOString(),
        },
      })
      .run()
  }
}

async function i18nRow(
  source: SourceStatisticRow,
  locale: 'en' | 'zh-hant',
  name: string,
) {
  const now = new Date().toISOString()
  return {
    createdAt: now,
    isCurrent: true,
    isLocaleInferred: false,
    locale,
    name,
    releaseId: source.releaseId,
    sourceRecordId: source.sourceRecordId,
    updatedAt: now,
    validFromRelease: source.validFromRelease,
    validToRelease: null,
    versionHash: await createHash(
      stableJsonStringify({
        locale,
        name,
        parentHash: source.versionHash,
        sourceRecordId: source.sourceRecordId,
      }),
    ),
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
