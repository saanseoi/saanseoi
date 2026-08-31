import { readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parquetWriteBuffer } from 'hyparquet-writer'
import { strFromU8 } from 'fflate'
import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'
import { readSafeZipArchive } from '../zipArchive.ts'
import { simplifyPolygonCoverage } from '../../geometry/simplifyPolygonCoverage.ts'

import { parseHkgovCenstatdDistrictGml } from './hkgovCenstatdGml.ts'

const HKGOV_CENSTATD_SOURCE = 'hkgov-censtatd'
const HKGOV_CENSTATD_SCHEMA_VERSION = '1.0'
export const HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM = 'simplified'
const DISPLAY_SIMPLIFICATION_TOLERANCE_METRES = 10

type CenstatdDistrictSourceVersion =
  | '2016'
  | '2021'
  | '2022'
  | '2023-H2'
  | '2024'
  | '2026-Q2'

type CenstatdDistrictDatasetCode =
  | 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
  | 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'
  | 'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  | 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'

const DEFAULT_DISTRICT_DATASET =
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'

const SOURCE_PROFILES: Record<
  CenstatdDistrictDatasetCode,
  Partial<
    Record<
      CenstatdDistrictSourceVersion,
      { layerName: string; referencePeriodField?: string }
    >
  >
> = {
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district': {
    '2022': { layerName: 'Density_2022' },
    '2024': { layerName: 'Density_2024' },
  },
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district': {
    '2023-H2': { layerName: 'DCD_LQ_Q32023' },
  },
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district': {
    // The annual release is filtered to its publisher-labelled year below.
    '2024': { layerName: 'DC_GHS', referencePeriodField: 'year' },
    '2026-Q2': { layerName: 'DC_GHS', referencePeriodField: 'year' },
  },
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district': {
    '2016': { layerName: 'DC_16BC_SDU' },
    '2021': { layerName: 'DC_21C_SDU' },
  },
}

function sourceProfile(
  datasetCode: CenstatdDistrictDatasetCode,
  sourceVersion: CenstatdDistrictSourceVersion,
) {
  const profile = SOURCE_PROFILES[datasetCode][sourceVersion]
  if (!profile) {
    throw new Error(
      `No C&SD district parser profile exists for ${datasetCode} ${sourceVersion}.`,
    )
  }
  return profile
}

export function hkgovCenstatdDistrictLayerName(
  datasetCode: CenstatdDistrictDatasetCode,
  sourceVersion: CenstatdDistrictSourceVersion,
) {
  return sourceProfile(datasetCode, sourceVersion).layerName
}

export type PreparedHkgovCenstatdDistrictUpload = {
  cohortKey: string
  cleanup(): Promise<void>
  filePath: string
  originalFileName: string
  regionCode: 'hk'
  source: typeof HKGOV_CENSTATD_SOURCE
  sourceSchemaVersion: typeof HKGOV_CENSTATD_SCHEMA_VERSION
  sourceVersion: string
  transform?: typeof HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
  theme: 'divisions'
  type: 'divisionArea'
}

type CsdIFeature = {
  geometry?: unknown
  sourceGeometry?: GeoJsonGeometry
  properties?: unknown
  sourceGml?: Record<string, unknown>
  type?: unknown
}

type CsdIProperties = {
  DC?: unknown
  DC_CLASS?: unknown
  dc?: unknown
  dc_chi?: unknown
  dc_class?: unknown
  dc_eng?: unknown
}

type PreparedDistrictRow = {
  census_year: string
  derivation: Record<string, unknown> | null
  district_class: string
  district_code: number
  geometry: GeoJsonGeometry
  id: string
  source_geometry: GeoJsonGeometry
  source_properties: Record<string, unknown>
  sources: Array<Record<string, string | number>>
  theme: 'divisions'
  type: 'divisionArea'
}

/**
 * Converts either Census dataset's GML 3.2 WFS delivery into the normalised
 * division-area Parquet contract. The source delivery's district geometry and
 * complete GML feature member are retained for the C&SD provider variant.
 */
export async function prepareHkgovCenstatdDistrictUpload(
  inputFile: string,
  outputDir: string,
  sourceVersion: CenstatdDistrictSourceVersion,
  options: {
    datasetCode?: CenstatdDistrictDatasetCode
    cohortKey?: string
    sourceArchive?: { key: string; sha256: string }
    transform?: typeof HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
  } = {},
): Promise<PreparedHkgovCenstatdDistrictUpload> {
  const datasetCode = options.datasetCode ?? DEFAULT_DISTRICT_DATASET
  const profile = sourceProfile(datasetCode, sourceVersion)
  const resolvedInputFile = resolve(inputFile)
  const input = await readFile(resolvedInputFile, 'utf8')
  if (!input.trimStart().startsWith('<')) {
    throw new Error('C&SD district input must be a GML 3.2 WFS FeatureCollection.')
  }
  const cohortKey = options.cohortKey ?? sourceVersion
  const sourceFeatures = parseHkgovCenstatdDistrictGml(input, profile.layerName)
  const referencePeriodField = profile.referencePeriodField
  const features = referencePeriodField
    ? sourceFeatures.filter(
        feature => String(feature.properties[referencePeriodField]) === cohortKey,
      )
    : sourceFeatures
  if (features.length !== 18) {
    throw new Error(
      `C&SD ${sourceVersion} district input must contain 18 district areas; found ${features.length}.`,
    )
  }

  const exactRows = features.map((feature, index) =>
    normaliseCsdIDistrictFeature(feature, index, cohortKey, options.sourceArchive),
  )
  assertUniqueDistricts(exactRows, sourceVersion)
  const rows =
    options.transform === HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
      ? await withDisplayGeometry(exactRows, sourceVersion, datasetCode)
      : exactRows
  const outputSourceVersion = sourceVersion
  const outputVersion =
    cohortKey === sourceVersion ? sourceVersion : `${sourceVersion}-${cohortKey}`
  const filePath = join(
    resolve(outputDir),
    `${HKGOV_CENSTATD_SOURCE}-hk-${outputVersion}${
      options.transform ? '-simplified' : ''
    }-division-area.parquet`,
  )

  const parquet = parquetWriteBuffer({
    // Individual C&SD geometry/source-feature values are larger than the
    // writer's default 1 MiB page. Keeping each column in one page avoids the
    // writer emitting an unreadable continuation page for those values.
    pageSize: 0,
    rowGroupSize: 1_000,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => row.id),
        false,
      ),
      stringColumn(
        'theme',
        rows.map(row => row.theme),
        false,
      ),
      stringColumn(
        'type',
        rows.map(row => row.type),
        false,
      ),
      jsonColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      int32Column(
        'district_code',
        rows.map(row => row.district_code),
        false,
      ),
      stringColumn(
        'district_class',
        rows.map(row => row.district_class),
        false,
      ),
      stringColumn(
        'census_year',
        rows.map(row => row.census_year),
        false,
      ),
      jsonColumn(
        'source_geometry',
        rows.map(row => row.source_geometry),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => row.source_properties),
        false,
      ),
      jsonColumn(
        'sources',
        rows.map(row => row.sources),
        false,
      ),
      jsonColumn(
        'derivation',
        rows.map(row => row.derivation),
      ),
    ],
  })
  await writeFile(filePath, new Uint8Array(parquet))

  return {
    cohortKey,
    cleanup: async () => undefined,
    filePath,
    originalFileName: basename(resolvedInputFile),
    regionCode: 'hk',
    source: HKGOV_CENSTATD_SOURCE,
    sourceSchemaVersion: HKGOV_CENSTATD_SCHEMA_VERSION,
    sourceVersion: outputSourceVersion,
    transform: options.transform,
    theme: 'divisions',
    type: 'divisionArea',
  }
}

/**
 * Opens the publisher's native CSDI ZIP and returns its sole cohort GML.
 * This deliberately rejects CSDI's converted GeoJSON download.
 */
export function readHkgovCenstatdDistrictGmlArchive(
  archiveBytes: Uint8Array,
  sourceVersion: CenstatdDistrictSourceVersion,
  datasetCode: CenstatdDistrictDatasetCode = DEFAULT_DISTRICT_DATASET,
) {
  const profile = sourceProfile(datasetCode, sourceVersion)
  const expectedMember = `${profile.layerName}.gml`
  const { entries: archive, files } = readSafeZipArchive(archiveBytes, {
    select: member => member.toLowerCase().endsWith('.gml'),
  })
  const gml = archive[expectedMember]
  if (!gml) {
    throw new Error(
      `C&SD ${sourceVersion} source archive must contain ${expectedMember}.`,
    )
  }
  const unexpectedGml = files.filter(
    member => member.toLowerCase().endsWith('.gml') && member !== expectedMember,
  )
  if (unexpectedGml.length > 0) {
    throw new Error(
      `C&SD ${sourceVersion} source archive has unexpected GML layers: ${unexpectedGml.join(', ')}.`,
    )
  }
  return strFromU8(gml)
}

function normaliseCsdIDistrictFeature(
  value: unknown,
  index: number,
  sourceVersion: string,
  sourceArchive?: { key: string; sha256: string },
): PreparedDistrictRow {
  if (!isRecord(value) || value.type !== 'Feature') {
    throw new Error(`C&SD district feature ${index + 1} is not a GeoJSON Feature.`)
  }
  const feature = value as CsdIFeature
  const geometry = requireDistrictGeometry(feature.geometry, index)
  const sourceGeometry = feature.sourceGeometry
  if (!sourceGeometry) {
    throw new Error(
      `C&SD district feature ${index + 1} has no EPSG:2326 source geometry.`,
    )
  }
  const properties = isRecord(feature.properties)
    ? (feature.properties as CsdIProperties)
    : null
  if (!properties) {
    throw new Error(`C&SD district feature ${index + 1} has no properties.`)
  }
  const districtClass = optionalString(properties.dc_class ?? properties.DC_CLASS)
  const districtCode = requireInteger(properties.dc ?? properties.DC, 'DC', index)

  return {
    census_year: sourceVersion,
    derivation: null,
    district_class: districtClass ?? '',
    district_code: districtCode,
    geometry,
    id: `CENSTATD:${districtClass || districtCode}`,
    source_geometry: sourceGeometry,
    source_properties: properties as Record<string, unknown>,
    sources: [
      {
        dataset: HKGOV_CENSTATD_SOURCE,
        ...(districtClass ? { districtClass } : {}),
        districtCode,
        ...(sourceArchive
          ? {
              sourceArchiveKey: sourceArchive.key,
              sourceArchiveSha256: sourceArchive.sha256,
            }
          : {}),
      },
    ],
    theme: 'divisions',
    type: 'divisionArea',
  }
}

async function withDisplayGeometry(
  rows: PreparedDistrictRow[],
  sourceVersion: string,
  datasetCode = 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
) {
  const simplified = await simplifyPolygonCoverage(
    rows.map(row => row.geometry),
    DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
  )
  return rows.map((row, index) => {
    const geometry = simplified.geometries[index]
    if (!geometry) {
      throw new Error(`C&SD display geometry ${row.district_class} was not produced.`)
    }
    return {
      ...row,
      derivation: {
        inputDatasetCode: datasetCode,
        inputSource: HKGOV_CENSTATD_SOURCE,
        inputSourceVersion: sourceVersion,
        inputGeometryProjection: 'EPSG:4326',
        method: 'geos-coverage-simplification',
        toleranceMetres: DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
        coordinateSpace: 'wgs84-interface-local-equirectangular-metre-plane',
        engine: simplified.engine,
        engineVersion: simplified.engineVersion,
        ...(simplified.inputValidationRepairIndexes.includes(index)
          ? { inputValidationRepair: 'make-valid' }
          : {}),
        ...(sourceVersion === '2024'
          ? { preservesPublisherGeometry: true }
          : { preservesLandClip: true }),
      },
      geometry: normaliseSinglePolygon(geometry),
      // A display transform is another representation of the same C&SD
      // assertion, not a new source record. The snapshot variant selects it.
      id: row.id,
      sources: row.sources,
    }
  })
}

function normaliseSinglePolygon(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return geometry.type === 'MultiPolygon' && geometry.coordinates.length === 1
    ? { type: 'Polygon', coordinates: geometry.coordinates[0]! }
    : geometry
}

function assertUniqueDistricts(rows: PreparedDistrictRow[], sourceVersion: string) {
  const classes = new Set(rows.map(row => row.district_class))
  const codes = new Set(rows.map(row => row.district_code))
  if (
    (rows.every(row => row.district_class) && classes.size !== rows.length) ||
    codes.size !== rows.length
  ) {
    throw new Error(
      `C&SD ${sourceVersion} district input has duplicate district identifiers.`,
    )
  }
}

function requireDistrictGeometry(value: unknown, index: number): GeoJsonGeometry {
  if (!isRecord(value) || (value.type !== 'Polygon' && value.type !== 'MultiPolygon')) {
    throw new Error(
      `C&SD district feature ${index + 1} must have a Polygon or MultiPolygon geometry.`,
    )
  }
  const geometry = value as GeoJsonGeometry
  const positions = collectPositions(geometry)
  if (
    positions.length === 0 ||
    positions.some(position => !isWgs84Position(position))
  ) {
    throw new Error(
      `C&SD district feature ${index + 1} does not contain valid WGS84 longitude/latitude coordinates.`,
    )
  }
  return geometry
}

function collectPositions(geometry: GeoJsonGeometry): GeoJsonPosition[] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat()
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  return []
}

function isWgs84Position(position: GeoJsonPosition) {
  return (
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  )
}

function requireString(value: unknown, field: string, index: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`C&SD district feature ${index + 1} requires ${field}.`)
  }
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireInteger(value: unknown, field: string, index: number) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  throw new Error(`C&SD district feature ${index + 1} requires integer ${field}.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringColumn(name: string, data: string[], nullable = true) {
  return { data, name, nullable, type: 'STRING' as const }
}

function int32Column(name: string, data: number[], nullable = true) {
  return { data, name, nullable, type: 'INT32' as const }
}

function jsonColumn<T>(name: string, data: T[], nullable = true) {
  return { data, name, nullable, type: 'JSON' as const }
}
