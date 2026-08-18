import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { XMLParser } from 'fast-xml-parser'
import { parquetWriteBuffer } from 'hyparquet-writer'

export const CENSTATD_STATISTIC_PROFILES = {
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-2021': {
    layers: [
      { count: 3322, name: 'BG_21C', required: ['bg', 'hma', 't_pop'] },
      { count: 173, name: 'HMA_21C', required: ['hma', 't_pop'] },
    ],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates-2021': {
    layers: [{ count: 540, name: 'MHE_21C', required: ['estate', 't_pop'] }],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-new-towns-2021': {
    layers: [{ count: 13, name: 'NewTown_21C', required: ['newtown', 't_pop'] }],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type': {
    layers: [{ count: 3, name: 'AREA_LQ_2023', required: ['AREA_ENG', 'PERIOD'] }],
    sourceVersions: ['2023-H2'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district': {
    layers: [{ count: 18, name: 'DCD_LQ_Q32023', required: ['DC', 'YEAR', 'LQ'] }],
    sourceVersions: ['2023-H2'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district': {
    layers: [{ count: 180, name: 'DC_GHS', required: ['dc', 'dc_class', 'year'] }],
    sourceVersions: ['2021'],
  },
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': {
    layers: [
      { count: 18, name: 'DC_16BC_SDU', required: ['dc', 'dc_class', 'sdu_pop'] },
      { count: 18, name: 'DC_21C_SDU', required: ['dc', 'dc_class', 'sdu_pop'] },
    ],
    sourceVersions: ['2016', '2021'],
  },
} as const

export type CenstatdStatisticDatasetCode = keyof typeof CENSTATD_STATISTIC_PROFILES

type SourceRow = {
  featureId: string
  layerName: string
  properties: Record<string, unknown>
  sourceGeometry: unknown
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
    if (layerRows.length !== layer.count) {
      throw new Error(
        `${layer.name}.gml must contain ${layer.count} rows; found ${layerRows.length}.`,
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
          strings(
            'reference_year',
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
      // canonical observation as `<layerName>:<sourceFeatureId>`.
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
  // ordinal so source assertions and canonical provenance remain unique.
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
 * row-level publisher period in the raw source assertion; the source-version
 * remains the release identity carried by release metadata.
 */
function referencePeriodFor(
  properties: Record<string, unknown>,
  sourceVersion: string,
) {
  const year = properties.year
  return typeof year === 'string' && /^\d{4}$/.test(year.trim())
    ? year.trim()
    : sourceVersion
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
