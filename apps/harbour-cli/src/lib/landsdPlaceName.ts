import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parquetWriteFile } from 'hyparquet-writer'

import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'

const LANDSD_PLACE_NAME_SOURCE = 'hkgov-landsd'
const LANDSD_PLACE_NAME_SOURCE_SCHEMA_VERSION = '1.0'

export type LandsdPlaceNameFeatureCollection = {
  features: LandsdPlaceNameFeature[]
  type: 'FeatureCollection'
}

export type LandsdPlaceNameFeature = {
  geometry: GeoJsonGeometry
  id?: string | number
  properties: Record<string, unknown>
  type: 'Feature'
}

export type PreparedLandsdPlaceNameUpload = {
  cleanup(): Promise<void>
  filePath: string
  originalFileName: string
  regionCode: 'hk'
  source: typeof LANDSD_PLACE_NAME_SOURCE
  sourceSchemaVersion: typeof LANDSD_PLACE_NAME_SOURCE_SCHEMA_VERSION
  sourceVersion: string
  theme: 'divisions'
  type: 'division'
}

/**
 * Keeps the LandsD settlement projection separate from the complete gazetteer.
 * The retained feature is otherwise unchanged so a later Places projection can
 * use the original Hydrographic and Topographic records without loss.
 */
export function prepareLandsdSettlementFeatureCollection(
  input: unknown,
): LandsdPlaceNameFeatureCollection {
  if (
    !isRecord(input) ||
    input.type !== 'FeatureCollection' ||
    !Array.isArray(input.features)
  ) {
    throw new Error('LandsD Place Name input must be a GeoJSON FeatureCollection.')
  }

  const features = input.features.flatMap((value, index) => {
    const feature = requireFeature(value, index)
    const properties = feature.properties

    if (properties.PLACE_CLASS !== 'Settlement') return []

    const geoNameId = requireGeoNameId(properties.GEO_NAME_ID, index)
    requirePointGeometry(feature.geometry, index)

    return [
      {
        ...feature,
        id: geoNameId,
        properties: { ...properties },
      },
    ]
  })

  return { features, type: 'FeatureCollection' }
}

export function serialiseLandsdSettlementFeatureCollection(input: unknown) {
  return `${JSON.stringify(prepareLandsdSettlementFeatureCollection(input))}\n`
}

/** Converts the filtered point GeoJSON into the canonical division upload shape. */
export async function prepareLandsdPlaceNameDivisionUpload(
  inputFile: string,
  outputDir: string,
  sourceVersion: string,
): Promise<PreparedLandsdPlaceNameUpload> {
  const resolvedInputFile = resolve(inputFile)
  const featureCollection = prepareLandsdSettlementFeatureCollection(
    JSON.parse(await readFile(resolvedInputFile, 'utf8')),
  )
  const rows = featureCollection.features.map((feature, index) =>
    normaliseLandsdSettlement(feature, index),
  )

  const filePath = join(
    resolve(outputDir),
    `hkgov-landsd-hk-${sourceVersion}-division.parquet`,
  )
  parquetWriteFile({
    filename: filePath,
    rowGroupSize: 1000,
    statistics: false,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => row.id),
        false,
      ),
      stringColumn(
        'theme',
        rows.map(() => 'divisions'),
        false,
      ),
      stringColumn(
        'type',
        rows.map(() => 'division'),
        false,
      ),
      stringColumn(
        'country',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'region',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'source',
        rows.map(() => LANDSD_PLACE_NAME_SOURCE),
        false,
      ),
      stringColumn(
        'subtype',
        rows.map(() => 'locality'),
        false,
      ),
      stringColumn(
        'class',
        rows.map(row => row.placeType),
        false,
      ),
      stringColumn(
        'geo_name_id',
        rows.map(row => row.geoNameId),
        false,
      ),
      stringColumn(
        'place_class',
        rows.map(() => 'Settlement'),
        false,
      ),
      stringColumn(
        'place_type',
        rows.map(row => row.placeType),
        false,
      ),
      stringColumn(
        'district',
        rows.map(row => row.district),
        false,
      ),
      geometryColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      jsonColumn(
        'names',
        rows.map(row => row.names),
        false,
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => row.identifiers),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => row.sourceProperties),
        false,
      ),
      jsonColumn(
        'source_feature',
        rows.map(row => row.sourceFeature),
        false,
      ),
      stringColumn(
        'source_crs',
        rows.map(() => 'EPSG:4326'),
        false,
      ),
      stringColumn(
        'source_schema_version',
        rows.map(() => LANDSD_PLACE_NAME_SOURCE_SCHEMA_VERSION),
        false,
      ),
      stringColumn(
        'source_version',
        rows.map(() => sourceVersion),
        false,
      ),
    ],
  })

  return {
    cleanup: async () => undefined,
    filePath,
    originalFileName: basename(resolvedInputFile),
    regionCode: 'hk',
    source: LANDSD_PLACE_NAME_SOURCE,
    sourceSchemaVersion: LANDSD_PLACE_NAME_SOURCE_SCHEMA_VERSION,
    sourceVersion,
    theme: 'divisions',
    type: 'division',
  }
}

function normaliseLandsdSettlement(feature: LandsdPlaceNameFeature, index: number) {
  const geoNameId = requireGeoNameId(feature.properties.GEO_NAME_ID, index)
  const geometry = requirePointGeometry(feature.geometry, index)
  const placeType = optionalString(feature.properties.PLACE_TYPE) ?? 'settlement'
  const district = optionalString(feature.properties.DISTRICT) ?? ''

  return {
    district,
    geoNameId,
    geometry,
    id: `LANDSD:${geoNameId}`,
    identifiers: { hkgovLandsd: { geoNameId } },
    names: sourceNames(feature.properties),
    placeType,
    sourceFeature: feature,
    sourceProperties: feature.properties,
  }
}

function sourceNames(properties: Record<string, unknown>) {
  const english = firstString(
    properties,
    'NAME_EN',
    'NAME_ENG',
    'ENG_NAME',
    'ENGLISH_NAME',
    'PLACE_NAME_EN',
    'GEO_NAME_EN',
    'GEO_NAME_ENG',
  )
  const chinese = firstString(
    properties,
    'NAME_TC',
    'NAME_CHI',
    'CHI_NAME',
    'CHINESE_NAME',
    'PLACE_NAME_TC',
    'GEO_NAME_TC',
    'GEO_NAME_CHI',
  )

  return {
    common: {
      ...(english ? { en: english } : {}),
      ...(chinese ? { 'zh-hant': chinese } : {}),
    },
  }
}

function firstString(properties: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = optionalString(properties[key])
    if (value) return value
  }
  return undefined
}

function requireFeature(value: unknown, index: number): LandsdPlaceNameFeature {
  if (!isRecord(value) || value.type !== 'Feature' || !isRecord(value.properties)) {
    throw new Error(`LandsD Place Name feature ${index + 1} is not a GeoJSON Feature.`)
  }

  return value as LandsdPlaceNameFeature
}

function requirePointGeometry(value: unknown, index: number) {
  if (
    !isRecord(value) ||
    value.type !== 'Point' ||
    !Array.isArray(value.coordinates) ||
    value.coordinates.length < 2 ||
    typeof value.coordinates[0] !== 'number' ||
    typeof value.coordinates[1] !== 'number' ||
    !Number.isFinite(value.coordinates[0]) ||
    !Number.isFinite(value.coordinates[1]) ||
    Math.abs(value.coordinates[0]) > 180 ||
    Math.abs(value.coordinates[1]) > 90
  ) {
    throw new Error(
      `LandsD Place Name Settlement feature ${index + 1} must have WGS84 Point geometry.`,
    )
  }

  return value as GeoJsonGeometry & { type: 'Point' }
}

function requireGeoNameId(value: unknown, index: number) {
  const geoNameId = optionalString(value)
  if (!geoNameId) {
    throw new Error(
      `LandsD Place Name Settlement feature ${index + 1} requires GEO_NAME_ID.`,
    )
  }
  return geoNameId
}

function optionalString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringColumn(name: string, data: string[], nullable = true) {
  return { data, name, nullable, type: 'STRING' as const }
}

function jsonColumn<T>(name: string, data: T[], nullable = true) {
  return { data, name, nullable, type: 'JSON' as const }
}

function geometryColumn(name: string, data: GeoJsonGeometry[], nullable = true) {
  return { data, name, nullable, type: 'GEOMETRY' as const }
}
