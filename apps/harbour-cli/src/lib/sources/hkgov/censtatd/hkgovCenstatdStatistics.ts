import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { XMLParser } from 'fast-xml-parser'
import { parquetWriteBuffer } from 'hyparquet-writer'

import { buildDeterministicUuidV5 } from '@repo/db'
import {
  overtureHongKongAreaDivisionId,
  overtureHongKongAreaForCenstatdCode,
} from '@repo/core/pipeline/services/overtureHongKongAreas'
import { parseStatisticsReferencePeriod } from '@repo/core/pipeline/services/statisticsReferencePeriod'

import { parseHkgovCenstatdDistrictGml } from './hkgovCenstatdGml.ts'

// Shared with the Planning adapters: IDs are stable canonical identities, not
// release or geometry hashes. C&SD's native feature codes are the identifier.
const CANONICAL_DIVISION_ID_NAMESPACE = '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c'

const PERMANENT_LIVING_QUARTERS_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
const HMA_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'

type CenstatdStatisticLayer = {
  name: string
  required: string[]
  expectedRowCount?: number
  rowsPerReferencePeriod?: {
    field: string
    count: number
  }
}

type CenstatdStatisticProfile = {
  layers: CenstatdStatisticLayer[]
  sourceVersions: string[]
}

export const CENSTATD_STATISTIC_PROFILES = {
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups': {
    layers: [
      { expectedRowCount: 3322, name: 'BG_21C', required: ['bg', 'hma', 't_pop'] },
      { expectedRowCount: 173, name: 'HMA_21C', required: ['hma', 't_pop'] },
    ],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates': {
    layers: [{ expectedRowCount: 540, name: 'MHE_21C', required: ['estate', 't_pop'] }],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-new-towns': {
    layers: [
      { expectedRowCount: 13, name: 'NewTown_21C', required: ['newtown', 't_pop'] },
    ],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters': {
    layers: [
      { expectedRowCount: 3, name: 'AREA_LQ_2023', required: ['AREA_ENG', 'PERIOD'] },
    ],
    sourceVersions: ['2023-H2'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district': {
    layers: [
      { expectedRowCount: 18, name: 'DCD_LQ_Q32023', required: ['DC', 'YEAR', 'LQ'] },
    ],
    sourceVersions: ['2023-H2'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district': {
    layers: [
      {
        name: 'DC_GHS',
        required: ['dc', 'dc_class', 'year'],
        rowsPerReferencePeriod: { field: 'year', count: 18 },
      },
    ],
    sourceVersions: ['2024', '2026-Q2'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': {
    layers: [
      {
        expectedRowCount: 18,
        name: 'DC_16BC_SDU',
        required: ['dc', 'dc_class', 'sdu_pop'],
      },
      {
        expectedRowCount: 18,
        name: 'DC_21C_SDU',
        required: ['dc', 'dc_class', 'sdu_pop'],
      },
    ],
    sourceVersions: ['2016', '2021'],
  },
} as const satisfies Record<string, CenstatdStatisticProfile>

export type CenstatdStatisticDatasetCode = keyof typeof CENSTATD_STATISTIC_PROFILES

type SourceRow = {
  featureId: string
  layerName: string
  properties: Record<string, unknown>
  sourceGeometry: unknown
}

type StatisticGeography = {
  code: string
  layerName: string
  level?: number
  nameEn: string
  nameZhHant: string
  type: 'area' | 'housing-market-area'
}

export function hkgovCenstatdStatisticDivisionId(
  datasetCode: string,
  sourceCode: string,
) {
  const geography = statisticGeographyIdentity(datasetCode, sourceCode)
  if (!geography) return null
  if (geography.type === 'area') {
    const area = overtureHongKongAreaForCenstatdCode(geography.code)
    return area ? overtureHongKongAreaDivisionId(area.code) : null
  }
  return buildDeterministicUuidV5(
    CANONICAL_DIVISION_ID_NAMESPACE,
    `CENSTATD:HMA:${geography.code}`,
  )
}

/**
 * Creates the canonical division and area upload contracts from the exact GML
 * members that also feed the statistics source record. Building Groups deliberately
 * remain source-only: C&SD supplies centroids rather than division geometry.
 */
export async function prepareHkgovCenstatdStatisticGeographyUploads(input: {
  areaOutputFile: string
  datasetCode: CenstatdStatisticDatasetCode
  divisionOutputFile: string
  inputGml: Record<string, string>
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
}) {
  const layerName = geographyLayerForDataset(input.datasetCode)
  if (!layerName) {
    return { areaCount: 0, divisionCount: 0, sourceFeatureCount: 0 }
  }
  const gml = input.inputGml[`${layerName}.gml`]
  if (!gml) throw new Error(`CSDI archive is missing ${layerName}.gml.`)

  const sourceRows = readHkgovCenstatdStatisticArchive({
    datasetCode: input.datasetCode,
    inputGml: input.inputGml,
    sourceVersion: input.sourceVersion,
  }).filter(row => row.layerName === layerName)
  const features = parseHkgovCenstatdDistrictGml(gml, layerName)
  if (features.length !== sourceRows.length) {
    throw new Error(
      `${layerName}.gml geometry parsing found ${features.length} rows; expected ${sourceRows.length}.`,
    )
  }

  const rows = sourceRows.map((sourceRow, index) => {
    const feature = features[index]
    if (!feature) throw new Error(`Missing parsed ${layerName} feature ${index + 1}.`)
    const geography = statisticGeography(
      input.datasetCode,
      sourceRow.featureId,
      sourceRow.properties,
    )
    if (!geography) {
      throw new Error(
        `${layerName} feature ${sourceRow.featureId} has no reviewed division identity.`,
      )
    }
    const divisionId = hkgovCenstatdStatisticDivisionId(
      input.datasetCode,
      geography.code,
    )
    if (!divisionId)
      throw new Error(`Unable to build division ID for ${geography.code}.`)
    const sourceRecordId = `${layerName}:${sourceRow.featureId}`
    const names = {
      common: {
        en: [geography.nameEn],
        'zh-hant': [geography.nameZhHant],
      },
      primary: geography.nameEn,
    }
    const provenance = [
      {
        dataset: 'hkgov-censtatd',
        layerName,
        sourceArchiveKey: input.sourceArchiveKey,
        sourceArchiveSha256: input.sourceArchiveSha256,
        sourceRecordId,
      },
    ]
    return {
      area: {
        class: 'land',
        division_id: divisionId,
        geometry: feature.geometry,
        id: `CENSTATD:${geography.type}:${geography.code}`,
        source_geometry: feature.sourceGeometry,
        source_properties: sourceRow.properties,
        sources: provenance,
        type: 'divisionArea',
      },
      division:
        geography.type === 'area'
          ? null
          : {
              ...(geography.level === undefined
                ? {}
                : { canonical_level: geography.level }),
              canonical_type: geography.type,
              // The shared division Parquet reader builds its hierarchy lookup
              // before applying the C&SD-specific normaliser. Keep its required
              // structural columns present, while canonical_type remains the
              // authoritative C&SD classification.
              class: 'housing-market-area',
              geometry: feature.geometry,
              id: divisionId,
              identifiers: {
                hkgovCenstatd: { code: geography.code, geographyType: geography.type },
              },
              names,
              parent_division_id: '',
              source: 'hkgov-censtatd',
              source_properties: sourceRow.properties,
              sources: provenance,
              subtype: '',
              type: 'division',
            },
    }
  })
  const divisions = rows.flatMap(row => (row.division ? [row.division] : []))
  const ids = new Set(divisions.map(division => division.id))
  if (ids.size !== divisions.length)
    throw new Error(`${layerName} has duplicate division IDs.`)

  await Promise.all([
    divisions.length
      ? writePreparedGeographyParquet(input.divisionOutputFile, divisions)
      : Promise.resolve(),
    writePreparedGeographyParquet(
      input.areaOutputFile,
      rows.map(row => row.area),
    ),
  ])
  return {
    areaCount: rows.length,
    divisionCount: divisions.length,
    sourceFeatureCount: sourceRows.length,
  }
}

function geographyLayerForDataset(datasetCode: string) {
  if (datasetCode === PERMANENT_LIVING_QUARTERS_DATASET) return 'AREA_LQ_2023'
  if (datasetCode === HMA_DATASET) return 'HMA_21C'
  return null
}

function statisticGeography(
  datasetCode: string,
  featureId: string,
  properties: Record<string, unknown>,
): StatisticGeography | null {
  if (datasetCode === PERMANENT_LIVING_QUARTERS_DATASET) {
    const code = featureId.trim()
    const identity = statisticGeographyIdentity(datasetCode, code)
    const nameEn = string(properties.AREA_ENG)
    const nameZhHant = string(properties.AREA_CHI)
    return identity && nameEn && nameZhHant
      ? { ...identity, layerName: 'AREA_LQ_2023', nameEn, nameZhHant }
      : null
  }
  if (datasetCode === HMA_DATASET) {
    const code = string(properties.hma) || featureId.trim()
    const identity = statisticGeographyIdentity(datasetCode, code)
    const nameEn = string(properties.hma_eng) || code
    const nameZhHant = string(properties.hma_chi) || nameEn
    return identity ? { ...identity, layerName: 'HMA_21C', nameEn, nameZhHant } : null
  }
  return null
}

function statisticGeographyIdentity(datasetCode: string, sourceCode: string) {
  const code = sourceCode.trim()
  if (
    datasetCode === PERMANENT_LIVING_QUARTERS_DATASET &&
    ['HK', 'KLN', 'NT'].includes(code)
  ) {
    return { code, level: 1, type: 'area' as const }
  }
  if (datasetCode === HMA_DATASET && /^HMA\d+$/i.test(code)) {
    return { code: code.toUpperCase(), type: 'housing-market-area' as const }
  }
  return null
}

async function writePreparedGeographyParquet(
  outputFile: string,
  rows: Array<Record<string, unknown>>,
) {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))].sort()
  await writeFile(
    resolve(outputFile),
    new Uint8Array(
      parquetWriteBuffer({
        columnData: fields.map(name =>
          strings(
            name,
            rows.map(row => {
              const value = row[name]
              return typeof value === 'string' ? value : JSON.stringify(value ?? null)
            }),
          ),
        ),
      }),
    ),
  )
}

/**
 * Validates and normalises the publisher-native GML members. This is the
 * native intake boundary; Parquet export below is retained only for local
 * diagnostics and is not required for database publication.
 */
export function readHkgovCenstatdStatisticArchive(input: {
  datasetCode: CenstatdStatisticDatasetCode
  inputGml: Record<string, string>
  sourceVersion: string
}) {
  const profile = CENSTATD_STATISTIC_PROFILES[input.datasetCode]
  if (!profile.sourceVersions.includes(input.sourceVersion as never)) {
    throw new Error(
      `${input.datasetCode} has no ${input.sourceVersion} source profile.`,
    )
  }
  const rows: SourceRow[] = []
  const layers =
    input.datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
      ? profile.layers.filter(layer =>
          layer.name.includes(input.sourceVersion.slice(2)),
        )
      : profile.layers
  for (const layer of layers) {
    const gml = input.inputGml[`${layer.name}.gml`]
    if (!gml) throw new Error(`CSDI archive is missing ${layer.name}.gml.`)
    const layerRows = parseCsdiGml(gml, layer.name)
    if (
      'expectedRowCount' in layer &&
      layer.expectedRowCount !== undefined &&
      layerRows.length !== layer.expectedRowCount
    ) {
      throw new Error(
        `${layer.name}.gml must contain ${layer.expectedRowCount} rows; found ${layerRows.length}.`,
      )
    }
    for (const row of layerRows) {
      for (const property of layer.required) {
        if (row.properties[property] === undefined || row.properties[property] === '') {
          throw new Error(
            `${layer.name} feature ${row.featureId} requires ${property}.`,
          )
        }
      }
    }
    if ('rowsPerReferencePeriod' in layer && layer.rowsPerReferencePeriod) {
      assertRowsPerReferencePeriod(layerRows, layer.rowsPerReferencePeriod, layer.name)
    }
    rows.push(...layerRows)
  }
  const ids = new Set<string>()
  for (const row of rows) {
    const id = `${row.layerName}:${row.featureId}`
    if (ids.has(id)) throw new Error(`CSDI archive has duplicate feature ${id}.`)
    ids.add(id)
  }
  return rows
}

function assertRowsPerReferencePeriod(
  rows: readonly SourceRow[],
  rule: NonNullable<CenstatdStatisticLayer['rowsPerReferencePeriod']>,
  layerName: string,
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = row.properties[rule.field]
    const period =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' && Number.isFinite(value)
          ? String(value)
          : ''
    if (!period) continue
    counts.set(period, (counts.get(period) ?? 0) + 1)
  }
  const invalid = [...counts.entries()].filter(([, count]) => count !== rule.count)
  if (invalid.length > 0) {
    const detail = invalid.map(([period, count]) => `${period}=${count}`).join(', ')
    throw new Error(
      `${layerName}.gml must contain ${rule.count} rows for each ${rule.field}; found ${detail}.`,
    )
  }
}

export async function prepareHkgovCenstatdStatisticUpload(input: {
  datasetCode: CenstatdStatisticDatasetCode
  inputFiles: Record<string, string>
  outputFile: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
}) {
  const inputGml = Object.fromEntries(
    await Promise.all(
      Object.entries(input.inputFiles).map(async ([name, file]) => [
        name,
        await readFile(resolve(file), 'utf8'),
      ]),
    ),
  )
  const rows = readHkgovCenstatdStatisticArchive({
    datasetCode: input.datasetCode,
    inputGml,
    sourceVersion: input.sourceVersion,
  })
  await writeFile(
    resolve(input.outputFile),
    new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          strings(
            'id',
            rows.map(row => `CENSTATD:${row.layerName}:${row.featureId}`),
          ),
          strings(
            'dataset_code',
            rows.map(() => input.datasetCode),
          ),
          strings(
            'feature_id',
            rows.map(row => row.featureId),
          ),
          strings(
            'layer_name',
            rows.map(row => row.layerName),
          ),
          ...statisticsReferencePeriodColumns(
            rows.map(row => referencePeriodFor(row.properties, input.sourceVersion)),
          ),
          strings(
            'raw_properties',
            rows.map(row => JSON.stringify(row.properties)),
          ),
          strings(
            'source_geometry',
            rows.map(row => JSON.stringify(row.sourceGeometry)),
          ),
          strings(
            'sources',
            rows.map(row =>
              JSON.stringify([
                {
                  dataset: 'hkgov-censtatd',
                  layerName: row.layerName,
                  sourceArchiveKey: input.sourceArchiveKey,
                  sourceArchiveSha256: input.sourceArchiveSha256,
                },
              ]),
            ),
          ),
        ],
      }),
    ),
  )
  return { rowCount: rows.length }
}

function parseCsdiGml(input: string, layerName: string): SourceRow[] {
  const parsed = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(input) as Record<string, unknown>
  const collection = find(parsed, 'FeatureCollection')
  if (!record(collection)) throw new Error('CSDI GML must contain a FeatureCollection.')
  const members = array(find(collection, 'featureMember') ?? find(collection, 'member'))
  const rows = members.map((member, index) => {
    if (!record(member))
      throw new Error(`CSDI ${layerName} member ${index + 1} is invalid.`)
    const feature = find(member, layerName)
    if (!record(feature))
      throw new Error(`CSDI member ${index + 1} must contain ${layerName}.`)
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(feature)) {
      const name = key.split(':').at(-1)
      if (
        !name ||
        key.startsWith('@_') ||
        ['SHAPE', 'geometryProperty', 'boundedBy'].includes(name)
      )
        continue
      properties[name] = value
    }
    const publisherFeatureId =
      feature['@_gml:id'] ??
      feature['@_id'] ??
      feature['@_fid'] ??
      `${layerName}.${index + 1}`
    return {
      // Preserve the publisher feature identity. The layer is added by the
      // canonical observation as `<layerName>:<sourceFeatureRef>`.
      featureId: string(publisherFeatureId),
      layerName,
      properties,
      sourceGeometry:
        find(feature, 'SHAPE') ?? find(feature, 'geometryProperty') ?? null,
    }
  })
  const featureIdCounts = new Map<string, number>()
  for (const row of rows) {
    featureIdCounts.set(row.featureId, (featureIdCounts.get(row.featureId) ?? 0) + 1)
  }
  // C&SD's DC_GHS layer reuses its `fid` value across many members. Keep that
  // publisher value, but qualify collisions by their deterministic member
  // ordinal so source records and canonical provenance remain unique.
  return rows.map((row, index) =>
    (featureIdCounts.get(row.featureId) ?? 0) > 1
      ? { ...row, featureId: `${row.featureId}:${index + 1}` }
      : row,
  )
}

function strings(name: string, values: string[]) {
  return { name, data: values, type: 'STRING' as const }
}

/**
 * A compilation can contain observations for many reference years. Keep the
 * row-level publisher period in the raw source record; the source-version
 * remains the release identity carried by release metadata.
 */
function referencePeriodFor(
  properties: Record<string, unknown>,
  sourceVersion: string,
) {
  const populationYear = stringValue(properties.year)
  if (/^\d{4}$/.test(populationYear ?? '')) return populationYear as string

  const period = stringValue(properties.PERIOD)
  if (period) return period

  const year = stringValue(properties.YEAR)
  const quarter = stringValue(properties.QUARTER)?.replace(/^Q/i, '')
  if (year && quarter) return `${year}-Q${quarter}`

  return sourceVersion
}

function statisticsReferencePeriodColumns(codes: string[]) {
  const periods = codes.map(parseStatisticsReferencePeriod)
  return [
    strings(
      'reference_period_code',
      periods.map(period => period.code),
    ),
    nullableStrings(
      'reference_period_start',
      periods.map(period => period.start),
    ),
    nullableStrings(
      'reference_period_end',
      periods.map(period => period.end),
    ),
    strings(
      'reference_period_granularity',
      periods.map(period => period.granularity),
    ),
    strings(
      'reference_period_end_year',
      periods.map(period => period.endYear),
    ),
  ]
}

function nullableStrings(name: string, values: Array<string | null>) {
  return { name, data: values, nullable: true, type: 'STRING' as const }
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
function array(value: unknown) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value]
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function find(value: Record<string, unknown>, name: string): unknown {
  return Object.entries(value).find(([key]) => key.split(':').at(-1) === name)?.[1]
}
function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : String(value)
}
