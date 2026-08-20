import { readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parquetWriteBuffer } from 'hyparquet-writer'
import { strFromU8 } from 'fflate'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import TopologyPreservingSimplifier from 'jsts/org/locationtech/jts/simplify/TopologyPreservingSimplifier.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'
import { readSafeZipArchive } from '../zipArchive.ts'

import { parseHkgovCenstatdDistrictGml } from './hkgovCenstatdGml.ts'

const HKGOV_CENSTATD_SOURCE = 'hkgov-censtatd'
const HKGOV_CENSTATD_SCHEMA_VERSION = '1.0'
export const HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM = 'simplified'
const DISPLAY_SIMPLIFICATION_TOLERANCE_METRES = 10
const HONG_KONG_REFERENCE_LONGITUDE = 114
const HONG_KONG_REFERENCE_LATITUDE = 22.35
const METRES_PER_DEGREE_LATITUDE = 110_574
const METRES_PER_DEGREE_LONGITUDE =
  111_320 * Math.cos((HONG_KONG_REFERENCE_LATITUDE * Math.PI) / 180)

const SOURCE_PROFILE: Record<string, { layerName: string }> = {
  '2016': { layerName: 'DC_16BC_SDU' },
  '2021': { layerName: 'DC_21C_SDU' },
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
 * division-area Parquet contract. The source delivery already contains the
 * detailed land-clipped census district boundaries; its geometry and complete
 * GML feature member are retained for the C&SD provider variant.
 */
export async function prepareHkgovCenstatdDistrictUpload(
  inputFile: string,
  outputDir: string,
  sourceVersion: '2016' | '2021',
  options: {
    sourceArchive?: { key: string; sha256: string }
    transform?: typeof HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
  } = {},
): Promise<PreparedHkgovCenstatdDistrictUpload> {
  const profile = SOURCE_PROFILE[sourceVersion]
  if (!profile) {
    throw new Error(
      `No registered ${HKGOV_CENSTATD_SOURCE} parser profile exists for source version ${sourceVersion}.`,
    )
  }
  const resolvedInputFile = resolve(inputFile)
  const input = await readFile(resolvedInputFile, 'utf8')
  if (!input.trimStart().startsWith('<')) {
    throw new Error('C&SD district input must be a GML 3.2 WFS FeatureCollection.')
  }
  const features = parseHkgovCenstatdDistrictGml(input, profile.layerName)
  if (features.length !== 18) {
    throw new Error(
      `C&SD ${sourceVersion} district input must contain 18 district areas; found ${features.length}.`,
    )
  }

  const exactRows = features.map((feature, index) =>
    normaliseCsdIDistrictFeature(feature, index, sourceVersion, options.sourceArchive),
  )
  assertUniqueDistricts(exactRows, sourceVersion)
  const rows =
    options.transform === HKGOV_CENSTATD_SIMPLIFIED_TRANSFORM
      ? withDisplayGeometry(exactRows, sourceVersion)
      : exactRows
  const outputSourceVersion = sourceVersion
  const filePath = join(
    resolve(outputDir),
    `${HKGOV_CENSTATD_SOURCE}-hk-${sourceVersion}${
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
    cohortKey: sourceVersion,
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
  sourceVersion: '2016' | '2021',
) {
  const profile = SOURCE_PROFILE[sourceVersion]
  if (!profile) throw new Error(`No C&SD district profile exists for ${sourceVersion}.`)
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
  const districtClass = requireString(properties.dc_class, 'dc_class', index)
  const districtCode = requireInteger(properties.dc, 'dc', index)

  return {
    census_year: sourceVersion,
    derivation: null,
    district_class: districtClass,
    district_code: districtCode,
    geometry,
    id: `CENSTATD:${districtClass}`,
    source_geometry: sourceGeometry,
    source_properties: properties as Record<string, unknown>,
    sources: [
      {
        dataset: HKGOV_CENSTATD_SOURCE,
        districtClass,
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

function withDisplayGeometry(rows: PreparedDistrictRow[], sourceVersion: string) {
  const simplifiedGeometries = simplifyTogether(rows.map(row => row.geometry))
  return rows.map((row, index) => {
    const geometry = simplifiedGeometries[index]
    if (!geometry) {
      throw new Error(`C&SD display geometry ${row.district_class} was not produced.`)
    }
    return {
      ...row,
      derivation: {
        inputDatasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
        inputSource: HKGOV_CENSTATD_SOURCE,
        inputSourceVersion: sourceVersion,
        inputGeometryProjection: 'EPSG:4326',
        method: 'topology-preserving-simplification',
        toleranceMetres: DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
        coordinateSpace: 'local-equirectangular-metre-plane',
        preservesLandClip: true,
      },
      geometry,
      // A display transform is another representation of the same C&SD
      // assertion, not a new source record. The snapshot variant selects it.
      id: row.id,
      sources: row.sources,
    }
  })
}

/**
 * Simplify all 18 districts in one geometry collection. This keeps shared
 * district edges topology-consistent and preserves the publisher's land clip.
 * A 10 m tolerance reduces the current 25 MB delivery to roughly 0.8 MB while
 * remaining appropriate for a Hong Kong-wide preview map.
 */
function simplifyTogether(geometries: GeoJsonGeometry[]) {
  const input = {
    type: 'GeometryCollection' as const,
    geometries: geometries.map(toLocalMetreGeometry),
  }
  const reader = new GeoJSONReader(new GeometryFactory())
  const parsed = reader.read(input)
  const simplified = TopologyPreservingSimplifier.simplify(
    parsed,
    DISPLAY_SIMPLIFICATION_TOLERANCE_METRES,
  )
  if (!new IsValidOp(simplified).isValid()) {
    throw new Error('C&SD display simplification produced invalid geometry.')
  }
  const written = new GeoJSONWriter().write(simplified) as unknown
  if (
    !isGeometryCollection(written) ||
    written.geometries.length !== geometries.length
  ) {
    throw new Error(
      'C&SD display simplification changed the district geometry collection.',
    )
  }
  return written.geometries.map((geometry, index) =>
    requireDistrictGeometry(fromLocalMetreGeometry(geometry), index),
  )
}

function toLocalMetreGeometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([longitude, latitude, elevation]) =>
    positionWithOptionalElevation(
      (longitude - HONG_KONG_REFERENCE_LONGITUDE) * METRES_PER_DEGREE_LONGITUDE,
      (latitude - HONG_KONG_REFERENCE_LATITUDE) * METRES_PER_DEGREE_LATITUDE,
      elevation,
    ),
  )
}

function fromLocalMetreGeometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([x, y, elevation]) =>
    positionWithOptionalElevation(
      x / METRES_PER_DEGREE_LONGITUDE + HONG_KONG_REFERENCE_LONGITUDE,
      y / METRES_PER_DEGREE_LATITUDE + HONG_KONG_REFERENCE_LATITUDE,
      elevation,
    ),
  )
}

function positionWithOptionalElevation(
  first: number,
  second: number,
  elevation: number | undefined,
): GeoJsonPosition {
  return elevation === undefined ? [first, second] : [first, second, elevation]
}

function mapGeometryPositions(
  geometry: GeoJsonGeometry,
  transform: (position: GeoJsonPosition) => GeoJsonPosition,
): GeoJsonGeometry {
  if (geometry.type === 'GeometryCollection') {
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries.map(child =>
        mapGeometryPositions(child, transform),
      ),
    }
  }
  return mapCoordinates(geometry, transform)
}

function mapCoordinates(
  geometry: Exclude<GeoJsonGeometry, { type: 'GeometryCollection' }>,
  transform: (position: GeoJsonPosition) => GeoJsonPosition,
): Exclude<GeoJsonGeometry, { type: 'GeometryCollection' }> {
  const mapValue = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value
    if (typeof value[0] === 'number') return transform(value as GeoJsonPosition)
    return value.map(mapValue)
  }
  return { ...geometry, coordinates: mapValue(geometry.coordinates) } as Exclude<
    GeoJsonGeometry,
    { type: 'GeometryCollection' }
  >
}

function assertUniqueDistricts(rows: PreparedDistrictRow[], sourceVersion: string) {
  const classes = new Set(rows.map(row => row.district_class))
  const codes = new Set(rows.map(row => row.district_code))
  if (classes.size !== rows.length || codes.size !== rows.length) {
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

function requireInteger(value: unknown, field: string, index: number) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value)) {
    return Number.parseInt(value, 10)
  }
  throw new Error(`C&SD district feature ${index + 1} requires integer ${field}.`)
}

function isGeometryCollection(value: unknown): value is {
  type: 'GeometryCollection'
  geometries: GeoJsonGeometry[]
} {
  return (
    isRecord(value) &&
    value.type === 'GeometryCollection' &&
    Array.isArray(value.geometries)
  )
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
