import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { parquetWriteBuffer } from 'hyparquet-writer'

import { parseHkgovCenstatdDistrictGml } from './hkgovCenstatdGml.ts'

export type PreparedHkgovCenstatdDistrictStatistic = {
  outputFile: string
  rowCount: number
}

/** Converts C&SD's native Density_YYYY GML into the local statistic ingest shape. */
export async function prepareHkgovCenstatdDistrictStatisticUpload(input: {
  inputFile: string
  outputFile: string
  sourceArchiveKey: string
  sourceVersion: '2022' | '2024'
}): Promise<PreparedHkgovCenstatdDistrictStatistic> {
  const gml = await readFile(resolve(input.inputFile), 'utf8')
  const features = parseHkgovCenstatdDistrictGml(gml, `Density_${input.sourceVersion}`)
  if (features.length !== 18) {
    throw new Error(
      `C&SD Density_${input.sourceVersion}.gml must contain 18 district rows; found ${features.length}.`,
    )
  }

  const rows = features.map((feature, index) => {
    const properties = feature.properties
    const districtCode = integer(properties.DC, 'DC', index)
    const referenceYear = text(properties.PERIOD, 'PERIOD', index)
    if (referenceYear !== input.sourceVersion) {
      throw new Error(
        `C&SD Density row ${index + 1} has PERIOD=${referenceYear}; expected ${input.sourceVersion}.`,
      )
    }
    return {
      district_code: districtCode,
      // A publisher district assertion remains the same feature across source
      // releases; its reference year is a versioned property, not its identity.
      id: `CENSTATD:DENSITY:${districtCode}`,
      land_area_sq_km: number(properties.LA, 'LA', index),
      mid_year_population_density_per_sq_km: integer(
        properties.POPN_D,
        'POPN_D',
        index,
      ),
      mid_year_population: populationInPeople(properties.MYPOPN_LAND, index),
      name_en: text(properties.DC_ENG, 'DC_ENG', index),
      name_zh_hant: text(properties.DC_CHI, 'DC_CHI', index),
      raw_properties: JSON.stringify(properties),
      reference_year: referenceYear,
      source_geometry: JSON.stringify(feature.sourceGeometry),
      sources: JSON.stringify([
        {
          dataset: 'hkgov-censtatd',
          districtCode,
          sourceArchiveKey: input.sourceArchiveKey,
        },
      ]),
    }
  })
  assertUniqueDistrictCodes(rows)

  await writeFile(
    resolve(input.outputFile),
    new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          integerColumn(
            'district_code',
            rows.map(row => row.district_code),
          ),
          stringColumn(
            'id',
            rows.map(row => row.id),
          ),
          numberColumn(
            'land_area_sq_km',
            rows.map(row => row.land_area_sq_km),
          ),
          integerColumn(
            'mid_year_population_density_per_sq_km',
            rows.map(row => row.mid_year_population_density_per_sq_km),
          ),
          integerColumn(
            'mid_year_population',
            rows.map(row => row.mid_year_population),
          ),
          stringColumn(
            'name_en',
            rows.map(row => row.name_en),
          ),
          stringColumn(
            'name_zh_hant',
            rows.map(row => row.name_zh_hant),
          ),
          stringColumn(
            'raw_properties',
            rows.map(row => row.raw_properties),
          ),
          stringColumn(
            'reference_year',
            rows.map(row => row.reference_year),
          ),
          stringColumn(
            'source_geometry',
            rows.map(row => row.source_geometry),
          ),
          stringColumn(
            'sources',
            rows.map(row => row.sources),
          ),
        ],
      }),
    ),
  )
  return { outputFile: resolve(input.outputFile), rowCount: rows.length }
}

function text(value: unknown, field: string, index: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`C&SD Density row ${index + 1} requires ${field}.`)
  }
  return value.trim()
}

function number(value: unknown, field: string, index: number) {
  const parsed = Number(text(value, field, index))
  if (!Number.isFinite(parsed))
    throw new Error(`C&SD Density row ${index + 1} has invalid ${field}.`)
  return parsed
}

function populationInPeople(value: unknown, index: number) {
  const thousands = number(value, 'MYPOPN_LAND', index)
  const population = thousands * 1_000
  if (!Number.isSafeInteger(population)) {
    throw new Error(
      `C&SD Density row ${index + 1} has a non-integral MYPOPN_LAND population.`,
    )
  }
  return population
}

function integer(value: unknown, field: string, index: number) {
  const parsed = number(value, field, index)
  if (!Number.isInteger(parsed))
    throw new Error(`C&SD Density row ${index + 1} has non-integer ${field}.`)
  return parsed
}

function assertUniqueDistrictCodes(rows: Array<{ district_code: number }>) {
  if (new Set(rows.map(row => row.district_code)).size !== rows.length) {
    throw new Error('C&SD Density GML contains duplicate DC values.')
  }
}

function stringColumn(name: string, data: string[]) {
  return { data, name, nullable: false, type: 'STRING' as const }
}

function integerColumn(name: string, data: number[]) {
  return {
    data: data.map(value => BigInt(value)),
    name,
    nullable: false,
    type: 'INT64' as const,
  }
}

function numberColumn(name: string, data: number[]) {
  return { data, name, nullable: false, type: 'DOUBLE' as const }
}
