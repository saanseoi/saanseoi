import { createHash, stableJsonStringify } from '@repo/core/pipeline/utils'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import { sourceSchema } from '@repo/db'
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

/** Persists C&SD statistic assertions, then publishes the registered release. */
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
  const remoteClient = createHarbourControlClient(target)
  const client = target.remote
    ? remoteClient
    : createLocalControlClient(metaDb, { publishClient: remoteClient })
  try {
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: plan.type, sourceRows: plan.rowCount },
      releaseCode,
    )
    let importedRows = 0
    for await (const batch of readParquetObjectsInBatches(
      await asyncBufferFromFile(preparedUpload.filePath),
      256,
    )) {
      const rows = await Promise.all(
        batch.map(row => normalise(row, releaseId, releaseCode, plan.sourceVersion)),
      )
      const i18n = await Promise.all(
        rows.flatMap(row => [
          i18nRow(
            row.sourceRecordId,
            row.nameEn,
            'en',
            row.versionHash,
            releaseId,
            releaseCode,
          ),
          i18nRow(
            row.sourceRecordId,
            row.nameZhHant,
            'zh-hant',
            row.versionHash,
            releaseId,
            releaseCode,
          ),
        ]),
      )
      await context.sourceDb
        .insert(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities)
        .values(rows.map(({ nameEn: _en, nameZhHant: _zh, ...row }) => row))
        .onConflictDoUpdate({
          target: [
            sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
              .sourceRecordId,
            sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensities
              .versionHash,
          ],
          set: {
            isCurrent: true,
            releaseId,
            updatedAt: new Date().toISOString(),
            validToRelease: null,
          },
        })
        .run()
      await context.sourceDb
        .insert(sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n)
        .values(i18n)
        .onConflictDoUpdate({
          target: [
            sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
              .sourceRecordId,
            sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
              .versionHash,
            sourceSchema.sourceHkgovCenstatdDistrictLandAreaPopulationDensityI18n
              .locale,
          ],
          set: {
            isCurrent: true,
            releaseId,
            updatedAt: new Date().toISOString(),
            validToRelease: null,
          },
        })
        .run()
      importedRows += rows.length
    }
    if (importedRows !== 18 || importedRows !== plan.rowCount)
      throw new Error(
        `Expected 18 C&SD district statistic rows; imported ${importedRows}.`,
      )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      { importedRows },
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

async function normalise(
  value: Record<string, unknown>,
  releaseId: string,
  releaseCode: string,
  sourceVersion: string,
) {
  const sourceRecordId = string(value.id, 'id'),
    referenceYear = string(value.reference_year, 'reference_year')
  if (referenceYear !== sourceVersion)
    throw new Error(`Expected reference_year=${sourceVersion}.`)
  const payload = {
    districtCode: integer(value.district_code, 'district_code'),
    landAreaSqKm: number(value.land_area_sq_km, 'land_area_sq_km'),
    midYearPopulationDensityPerSqKm: integer(
      value.mid_year_population_density_per_sq_km,
      'mid_year_population_density_per_sq_km',
    ),
    midYearPopulationThousands: number(
      value.mid_year_population_thousands,
      'mid_year_population_thousands',
    ),
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
async function i18nRow(
  sourceRecordId: string,
  name: string,
  locale: 'en' | 'zh-hant',
  parentHash: string,
  releaseId: string,
  releaseCode: string,
) {
  const now = new Date().toISOString()
  return {
    createdAt: now,
    isCurrent: true,
    isLocaleInferred: false,
    locale,
    name,
    releaseId,
    sourceRecordId,
    updatedAt: now,
    validFromRelease: releaseCode,
    validToRelease: null,
    versionHash: await createHash(
      stableJsonStringify({ sourceRecordId, locale, name, parentHash }),
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
