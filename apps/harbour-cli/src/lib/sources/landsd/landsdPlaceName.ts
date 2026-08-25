import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { parquetWriteFile } from 'hyparquet-writer'

import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import { readFileGeodatabaseArchive } from '../fileGeodatabase.ts'

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

export type NativeLandsdPlaceName = LandsdPlaceNameFeature & {
  placeNames: Array<{
    nameEn: string | null
    nameZhHant: string | null
    status: 'Alias' | 'Official'
  }>
}

/**
 * Reads the publisher's FileGDB relationship directly. `GEO_PLACE_NAME`
 * supplies geometry/classification and `PLACE_NAME` supplies its official and
 * alias labels; CSDI converted GeoJSON is intentionally not an input.
 */
export async function readLandsdPlaceNameArchive(
  archiveBytes: Uint8Array,
): Promise<NativeLandsdPlaceName[]> {
  const layers = await readFileGeodatabaseArchive(archiveBytes)
  const placeFeatures = layers.GEO_PLACE_NAME
  const placeNameRows = layers.PLACE_NAME
  if (!isFeatureCollection(placeFeatures)) {
    throw new Error('LandsD Place Name archive must contain GEO_PLACE_NAME.')
  }
  if (!Array.isArray(placeNameRows)) {
    throw new Error('LandsD Place Name archive must contain PLACE_NAME.')
  }
  if (placeFeatures.features.length !== 2706) {
    throw new Error(
      `LandsD GEO_PLACE_NAME must contain 2,706 features; found ${placeFeatures.features.length}.`,
    )
  }

  const namesByGeoNameId = new Map<string, NativeLandsdPlaceName['placeNames']>()
  for (const [index, value] of placeNameRows.entries()) {
    if (!isRecord(value)) {
      throw new Error(`LandsD PLACE_NAME row ${index + 1} is invalid.`)
    }
    const geoNameId = requireGeoNameId(value.GEO_NAME_ID, index)
    const status = value.NAME_STATUS
    if (status !== 'Official' && status !== 'Alias') {
      throw new Error(`LandsD PLACE_NAME row ${index + 1} has invalid NAME_STATUS.`)
    }
    namesByGeoNameId.set(geoNameId, [
      ...(namesByGeoNameId.get(geoNameId) ?? []),
      {
        nameEn: decodePublisherText(value.NAME_EN),
        nameZhHant: decodePublisherText(value.NAME_TC),
        status,
      },
    ])
  }

  return placeFeatures.features.map((value, index) => {
    const feature = requireFeature(value, index)
    const geoNameId = requireGeoNameId(feature.properties.GEO_NAME_ID, index)
    const placeClass = requireText(feature.properties.PLACE_CLASS, 'PLACE_CLASS', index)
    requireText(feature.properties.PLACE_TYPE, 'PLACE_TYPE', index)
    requirePointGeometry(feature.geometry, index)
    const placeNames = namesByGeoNameId.get(geoNameId) ?? []
    if (!placeNames.some(name => name.status === 'Official')) {
      throw new Error(
        `LandsD GEO_PLACE_NAME ${geoNameId} has no official PLACE_NAME label.`,
      )
    }
    return {
      ...feature,
      id: geoNameId,
      placeNames,
      properties: {
        ...feature.properties,
        PLACE_CLASS: placeClass,
      },
    }
  })
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
      // Every division projection is read through the common hierarchy
      // preflight, which selects this field even when a source has no parent
      // hierarchy. LandsD settlements are top-level localities.
      stringColumn(
        'parent_division_id',
        rows.map(() => ''),
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

function decodePublisherText(value: unknown) {
  const text = optionalString(value)
  if (!text) return null
  // `fgdb` decodes FileGDB UTF-8 strings as Latin-1. ASCII values are
  // unchanged; non-ASCII publisher labels are recovered losslessly here.
  return Buffer.from(text, 'latin1').toString('utf8')
}

function requireText(value: unknown, field: string, index: number) {
  const text = optionalString(value)
  if (!text)
    throw new Error(`LandsD Place Name feature ${index + 1} requires ${field}.`)
  return text
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

function isFeatureCollection(
  value: unknown,
): value is LandsdPlaceNameFeatureCollection {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  )
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
