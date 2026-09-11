import { requireDefined } from '@repo/core/requireDefined'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parquetWriteFile } from 'hyparquet-writer'

import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'
import { readFileGeodatabaseArchive } from '../../fileGeodatabase.ts'
import { readNativeFileGeodatabaseArchive } from '../../fileGeodatabaseNative.ts'

const HKGOV_HAD_SOURCE = 'hkgov-had'
const HKGOV_HAD_SOURCE_SCHEMA_VERSION = '1.2'

export type PreparedHkgovHadDistrictUpload = {
  cohortKey: string
  cleanup(): Promise<void>
  filePath: string
  originalFileName: string
  regionCode: 'hk'
  source: typeof HKGOV_HAD_SOURCE
  sourceSchemaVersion: typeof HKGOV_HAD_SOURCE_SCHEMA_VERSION
  sourceVersion: string
  theme: 'divisions'
  resourceType: 'divisionArea'
}

type HkgovHadFeatureCollection = {
  features?: unknown
  type?: unknown
}

type HkgovHadFeature = {
  sourceGeometry?: unknown
  geometry?: unknown
  properties?: unknown
  type?: unknown
}

type HkgovHadProperties = {
  AREA_CODE?: unknown
  AREA_ID?: unknown
  AREA_TYPE?: unknown
  CSDI_ADMIN_AREA_ID?: unknown
  OBJECTID?: unknown
}

type PreparedHkgovHadDistrictRow = {
  area_code: string
  area_id: string
  area_type: string
  country: 'HK'
  csdi_admin_area_id: number | null
  geometry: GeoJsonGeometry
  id: string
  object_id: number | null
  region: 'HK'
  source_geometry: GeoJsonGeometry
  source_properties: Record<string, unknown>
  sources: Array<Record<string, string>>
  theme: 'divisions'
  resourceType: 'divisionArea'
}

/**
 * Converts the CSDI District Boundary GeoJSON into the normalised Parquet
 * contract consumed by the division-geometry SQL processor. GeoJSON without a
 * CRS member is WGS84 by definition, so projected coordinates are rejected
 * rather than silently stored as longitude/latitude.
 */
export async function prepareHkgovHadDistrictUpload(
  inputFile: string,
  outputDir: string,
  sourceVersion: string,
  options: { sourceArchive?: { key: string; sha256: string } } = {},
): Promise<PreparedHkgovHadDistrictUpload> {
  if (sourceVersion !== '2022') {
    throw new Error(
      `No registered ${HKGOV_HAD_SOURCE} parser profile exists for source version ${sourceVersion}.`,
    )
  }

  const resolvedInputFile = resolve(inputFile)
  const payload = JSON.parse(
    await readFile(resolvedInputFile, 'utf8'),
  ) as HkgovHadFeatureCollection

  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('HAD district input must be a GeoJSON FeatureCollection.')
  }

  const rows = payload.features.map((feature, index) =>
    normaliseHkgovHadDistrictFeature(feature, index, options.sourceArchive),
  )
  const publisherIds = rows.map(row => row.source_properties.OBJECTID)
  if (
    publisherIds.some(id => id == null || !String(id).trim()) ||
    new Set(publisherIds.map(String)).size !== rows.length
  ) {
    throw new Error('HAD records require unique publisher OBJECTID values.')
  }
  if (rows.length !== 18) {
    throw new Error(
      `HAD district input must contain the 18 Hong Kong district areas; found ${rows.length}.`,
    )
  }

  const filePath = join(
    resolve(outputDir),
    `${HKGOV_HAD_SOURCE}-hk-${sourceVersion}-division-area.parquet`,
  )
  parquetWriteFile({
    filename: filePath,
    rowGroupSize: 1000,
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
        rows.map(row => row.resourceType),
        false,
      ),
      stringColumn(
        'country',
        rows.map(row => row.country),
        false,
      ),
      stringColumn(
        'region',
        rows.map(row => row.region),
        false,
      ),
      jsonColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      stringColumn(
        'area_id',
        rows.map(row => row.area_id),
        false,
      ),
      stringColumn(
        'area_code',
        rows.map(row => row.area_code),
        false,
      ),
      stringColumn(
        'area_type',
        rows.map(row => row.area_type),
        false,
      ),
      int32Column(
        'object_id',
        rows.map(row => row.object_id),
      ),
      int32Column(
        'csdi_admin_area_id',
        rows.map(row => row.csdi_admin_area_id),
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
    ],
  })

  return {
    cohortKey: sourceVersion,
    cleanup: async () => undefined,
    filePath,
    originalFileName: basename(resolvedInputFile),
    regionCode: 'hk',
    source: HKGOV_HAD_SOURCE,
    sourceSchemaVersion: HKGOV_HAD_SOURCE_SCHEMA_VERSION,
    sourceVersion,
    theme: 'divisions',
    resourceType: 'divisionArea',
  }
}

/** Reads and validates the publisher's native File Geodatabase package. */
export async function readHkgovHadDistrictArchive(archiveBytes: Uint8Array) {
  const layers = await readFileGeodatabaseArchive(archiveBytes)
  const dcdLayers = Object.entries(layers).filter(
    ([name]) => name.toUpperCase() === 'DCD',
  )
  if (dcdLayers.length !== 1) {
    throw new Error('HAD district archive must contain exactly one DCD layer.')
  }
  const [, layer] = requireDefined(dcdLayers[0])
  if (layer?.type !== 'FeatureCollection' || !Array.isArray(layer.features)) {
    throw new Error('HAD district archive DCD layer must be a FeatureCollection.')
  }
  if (layer.features.length !== 18) {
    throw new Error(
      `HAD district archive DCD layer must contain 18 features; found ${layer.features.length}.`,
    )
  }
  for (const [index, feature] of layer.features.entries()) {
    if (!isRecord(feature.properties)) {
      throw new Error(`HAD district archive feature ${index + 1} has no properties.`)
    }
    for (const field of ['AREA_CODE', 'AREA_ID', 'AREA_TYPE'] as const) {
      if (typeof feature.properties[field] !== 'string' || !feature.properties[field]) {
        throw new Error(`HAD district archive feature ${index + 1} requires ${field}.`)
      }
    }
    requireDistrictGeometry(feature.geometry, index)
  }
  const nativeLayers = readNativeFileGeodatabaseArchive(archiveBytes)
  const nativeLayer = Object.entries(nativeLayers).find(
    ([name]) => name.toUpperCase() === 'DCD',
  )?.[1] as { features?: HkgovHadFeature[] } | undefined
  if (
    !Array.isArray(nativeLayer?.features) ||
    nativeLayer.features.length !== layer.features.length
  )
    throw new Error(
      'HAD native and projected collections must contain the same records.',
    )
  const nativeById = new Map(
    nativeLayer.features.map(feature => [
      (feature.properties as HkgovHadProperties).AREA_ID,
      feature,
    ]),
  )
  if (nativeById.size !== nativeLayer.features.length)
    throw new Error('Duplicate HAD native area identity.')
  return {
    ...layer,
    features: layer.features.map((feature, index) => {
      const native = nativeById.get((feature.properties as HkgovHadProperties).AREA_ID)
      if (!native) throw new Error('HAD projected record has no native geometry.')
      return {
        ...feature,
        sourceGeometry: requireDistrictGeometry(native.geometry, index, true),
      }
    }),
  } as HkgovHadFeatureCollection & { features: HkgovHadFeature[] }
}

function normaliseHkgovHadDistrictFeature(
  value: unknown,
  index: number,
  sourceArchive: { key: string; sha256: string } | undefined,
): PreparedHkgovHadDistrictRow {
  if (!isRecord(value) || value.type !== 'Feature') {
    throw new Error(`HAD district feature ${index + 1} is not a GeoJSON Feature.`)
  }
  const feature = value as HkgovHadFeature
  const geometry = requireDistrictGeometry(feature.geometry, index)
  const properties = isRecord(feature.properties)
    ? (feature.properties as HkgovHadProperties)
    : null
  if (!properties) {
    throw new Error(`HAD district feature ${index + 1} has no properties.`)
  }

  const areaId = requireString(properties.AREA_ID, 'AREA_ID', index)
  const areaCode = requireString(properties.AREA_CODE, 'AREA_CODE', index)

  return {
    area_code: areaCode,
    area_id: areaId,
    area_type: requireString(properties.AREA_TYPE, 'AREA_TYPE', index),
    country: 'HK',
    csdi_admin_area_id: optionalInteger(properties.CSDI_ADMIN_AREA_ID),
    geometry,
    id: `HAD:${areaId}`,
    object_id: optionalInteger(properties.OBJECTID),
    region: 'HK',
    source_geometry: requireDistrictGeometry(
      feature.sourceGeometry ?? geometry,
      index,
      feature.sourceGeometry != null,
    ),
    source_properties: properties as Record<string, unknown>,
    sources: [
      {
        areaCode,
        areaId,
        dataset: HKGOV_HAD_SOURCE,
        ...(sourceArchive
          ? {
              sourceArchiveKey: sourceArchive.key,
              sourceArchiveSha256: sourceArchive.sha256,
            }
          : {}),
      },
    ],
    theme: 'divisions',
    resourceType: 'divisionArea',
  }
}

function requireDistrictGeometry(
  value: unknown,
  index: number,
  native = false,
): GeoJsonGeometry {
  if (!isRecord(value) || (value.type !== 'Polygon' && value.type !== 'MultiPolygon')) {
    throw new Error(
      `HAD district feature ${index + 1} must have a Polygon or MultiPolygon geometry.`,
    )
  }
  const geometry = value as GeoJsonGeometry
  const positions = collectPositions(geometry)
  if (
    positions.length === 0 ||
    positions.some(position =>
      native ? !position.every(Number.isFinite) : !isWgs84Position(position),
    )
  ) {
    throw new Error(
      `HAD district feature ${index + 1} does not contain valid ${native ? 'native' : 'WGS84 longitude/latitude'} coordinates.`,
    )
  }
  return geometry
}

function collectPositions(geometry: GeoJsonGeometry): GeoJsonPosition[] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat()
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2)
  }
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
    throw new Error(`HAD district feature ${index + 1} requires ${field}.`)
  }
  return value.trim()
}

function optionalInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringColumn(name: string, data: string[], nullable = true) {
  return { data, name, nullable, type: 'STRING' as const }
}

function int32Column(name: string, data: Array<number | null>, nullable = true) {
  return { data, name, nullable, type: 'INT32' as const }
}

function jsonColumn<T>(name: string, data: T[], nullable = true) {
  return { data, name, nullable, type: 'JSON' as const }
}
