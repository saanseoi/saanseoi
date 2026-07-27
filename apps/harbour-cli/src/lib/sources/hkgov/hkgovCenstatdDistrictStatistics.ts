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
      id: `CENSTATD:DENSITY:${referenceYear}:${districtCode}`,
      land_area_sq_km: number(properties.LA, 'LA', index),
      mid_year_population_density_per_sq_km: integer(
        properties.POPN_D,
        'POPN_D',
        index,
      ),
      mid_year_population_thousands: number(
        properties.MYPOPN_LAND,
        'MYPOPN_LAND',
        index,
      ),
      name_en: text(properties.DC_ENG, 'DC_ENG', index),
      name_zh_hant: text(properties.DC_CHI, 'DC_CHI', index),
      raw_properties: JSON.stringify(properties),
      reference_year: referenceYear,
      source_archive_key: input.sourceArchiveKey,
      source_geometry: JSON.stringify(feature.sourceGeometry),
      sources: JSON.stringify([{ dataset: 'hkgov-censtatd', districtCode }]),
    }
  })

  await writeFile(
    resolve(input.outputFile),
    new Uint8Array(
      parquetWriteBuffer({
        columnData: {
          district_code: { data: rows.map(row => row.district_code), type: 'INT64' },
          id: { data: rows.map(row => row.id), type: 'STRING' },
          land_area_sq_km: {
            data: rows.map(row => row.land_area_sq_km),
            type: 'DOUBLE',
          },
          mid_year_population_density_per_sq_km: {
            data: rows.map(row => row.mid_year_population_density_per_sq_km),
            type: 'INT64',
          },
          mid_year_population_thousands: {
            data: rows.map(row => row.mid_year_population_thousands),
            type: 'DOUBLE',
          },
          name_en: { data: rows.map(row => row.name_en), type: 'STRING' },
          name_zh_hant: { data: rows.map(row => row.name_zh_hant), type: 'STRING' },
          raw_properties: { data: rows.map(row => row.raw_properties), type: 'STRING' },
          reference_year: { data: rows.map(row => row.reference_year), type: 'STRING' },
          source_archive_key: {
            data: rows.map(row => row.source_archive_key),
            type: 'STRING',
          },
          source_geometry: {
            data: rows.map(row => row.source_geometry),
            type: 'STRING',
          },
          sources: { data: rows.map(row => row.sources), type: 'STRING' },
        },
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

function integer(value: unknown, field: string, index: number) {
  const parsed = number(value, field, index)
  if (!Number.isInteger(parsed))
    throw new Error(`C&SD Density row ${index + 1} has non-integer ${field}.`)
  return parsed
}
