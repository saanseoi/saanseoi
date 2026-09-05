import proj4 from 'proj4'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'

import {
  calculateGeoJsonBbox,
  type GeoJsonGeometry,
  type GeoJsonPosition,
} from '@repo/core/pipeline/geojson'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { readFileGeodatabaseArchive } from '../fileGeodatabase.ts'

export const LANDSD_ROAD_CENTRELINE_DATASET_CODE = 'ds-hk-hkgov-landsd-road-centreline'
export const LANDSD_ROAD_CENTRELINE_LAYER = 'GEO_STREET_CENTRELINE'
export const LANDSD_ROAD_CENTRELINE_SOURCE_CRS = 'EPSG:2326' as const

const HONG_KONG_1980_GRID =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs +type=crs'

proj4.defs(LANDSD_ROAD_CENTRELINE_SOURCE_CRS, HONG_KONG_1980_GRID)

export type RoadCentrelineFeature = {
  /** Native FGDB geometry; never a convenience-parser reprojected value. */
  geometry: GeoJsonGeometry
  properties: Record<string, unknown>
}

export type RoadCentrelineStreet = {
  id: string
  districtIds: string[]
  englishName: string
  traditionalChineseName: string
}

export type RoadCentrelineCuration = {
  /** The source feature is intentionally outside the canonical Streets product. */
  exclude?: true
  streetId?: string
}

/** A selected SaanSeoi District geometry snapshot, in WGS84. */
export type RoadCentrelineDistrict = {
  geometry: GeoJsonGeometry
  id: string
}

export type NormalisedRoadCentreline = {
  sourceRecordId: string
  /** Null for publisher segments with no usable English street label. */
  streetId: string | null
  objectId: number
  streetCode: string
  streetType: string | null
  /** Exact native feature attributes, including the publisher's labels. */
  rawProperties: Record<string, unknown>
  nameEn: string | null
  nameZhHant: string | null
  sourceGeometry: GeoJsonGeometry
  geometry: GeoJsonGeometry
  bbox: [number, number, number, number]
  /** Derived matching/statistics evidence; never inserted into source storage. */
  derivedDistrictIds: string[]
}

export type RoadCentrelineMatchIssue = {
  objectId: number
  derivedDistrictIds: string[]
  englishName: string
  traditionalChineseName: string
  candidates: string[]
  kind: 'ambiguous' | 'unmatched'
}

export type RoadCentrelineReleaseStat = {
  dimension: string
  groupBy?: string
  groupValue?: string
  metric: string
  metricUnit: 'count' | 'percentage'
  value: number
}

export type RoadCentrelineSchemaProfile = {
  code: string
  fields: string[]
  streetTypeAvailable: boolean
}

export type NativeRoadCentrelineArchive = {
  features: RoadCentrelineFeature[]
  layerName: string
  sourceFeatureCount: number
}

/**
 * Reads a native Road Centreline FileGDB. The publisher renamed fields and
 * the feature class between archived releases; both observed native profiles
 * are explicitly accepted and normalised by the alias rules below.
 */
export async function readLandsdRoadCentrelineArchive(
  archiveBytes: Uint8Array,
): Promise<NativeRoadCentrelineArchive> {
  const layers = await readFileGeodatabaseArchive(archiveBytes)
  const candidates = Object.entries(layers).filter(([, value]) =>
    isFeatureCollection(value),
  )
  if (candidates.length !== 1) {
    throw new Error('Road Centreline archive must contain exactly one feature layer.')
  }
  const candidate = candidates.at(0)
  if (!candidate) {
    throw new Error('Road Centreline archive must contain exactly one feature layer.')
  }
  const [layerName, collection] = candidate
  if (layerName !== 'GEO_STREET_CENTRELINE' && layerName !== 'RoadCentreLine') {
    throw new Error(`Unexpected Road Centreline feature layer ${layerName}.`)
  }
  const features = collection.features as RoadCentrelineFeature[]
  const fields = new Set<string>()
  for (const feature of features) {
    for (const field of Object.keys(feature.properties)) {
      fields.add(field)
    }
    if (!requireNativeLineGeometry(feature.geometry)) {
      throw new Error(`Road Centreline ${layerName} has a non-line feature.`)
    }
  }
  validateRoadCentrelineLayer({
    fields: [...fields],
    layerName: LANDSD_ROAD_CENTRELINE_LAYER,
  })
  if (features.length === 0) {
    throw new Error('Road Centreline archive has no features.')
  }
  return {
    features,
    layerName,
    sourceFeatureCount: features.length,
  }
}

/**
 * Release-note generators compare profiles rather than assuming `STREETTYPE`
 * was always supplied. The 2023 Q3 archive has this flag false.
 */
export function roadCentrelineSchemaChanges(
  profile: RoadCentrelineSchemaProfile,
  previous: RoadCentrelineSchemaProfile | undefined,
) {
  return previous && !previous.streetTypeAvailable && profile.streetTypeAvailable
    ? ['`STREETTYPE` is now supplied by the publisher and retained as `streetType`.']
    : []
}

/**
 * Normalises already-native FGDB features. The archive adapter must provide
 * source EPSG:2326 coordinates here; passing FGDB's GeoJSON convenience output
 * is deliberately rejected by its contract rather than silently accepted.
 */
export function normaliseRoadCentrelineFeatures(input: {
  features: RoadCentrelineFeature[]
  releaseId: string
  streets: RoadCentrelineStreet[]
  districts?: RoadCentrelineDistrict[]
  curations?: Readonly<Record<string, RoadCentrelineCuration>>
}) {
  const records: NormalisedRoadCentreline[] = []
  const issues: RoadCentrelineMatchIssue[] = []
  const byEnglishName = new Map<string, RoadCentrelineStreet[]>()
  for (const street of input.streets) {
    const key = normaliseRoadCentrelineName(street.englishName)
    byEnglishName.set(key, [...(byEnglishName.get(key) ?? []), street])
  }

  for (const feature of input.features) {
    const fields = readRoadCentrelineFields(feature.properties)
    const curation = input.curations?.[curationKey(fields)]
    const sourceGeometry = requireLineGeometry(feature.geometry, fields.objectId)
    const geometry = projectHk80Geometry(sourceGeometry)
    const derivedDistrictIds = deriveRoadCentrelineDistrictIds(
      geometry,
      input.districts ?? [],
    )
    // The publisher emits legitimate segments without an English street label.
    // They remain first-class source evidence, but cannot create a canonical
    // street aggregate and therefore do not count as matching failures.
    if (!fields.englishName || curation?.exclude) {
      records.push({
        sourceRecordId: `${input.releaseId}:${fields.objectId}`,
        streetId: null,
        objectId: fields.objectId,
        streetCode: fields.streetCode,
        streetType: fields.streetType,
        sourceGeometry,
        geometry,
        bbox: calculateGeoJsonBbox(geometry),
        derivedDistrictIds,
        rawProperties: feature.properties,
        nameEn: fields.englishName,
        nameZhHant: fields.chineseName,
      })
      continue
    }
    const candidates = disambiguateByDerivedDistricts(
      byEnglishName.get(normaliseRoadCentrelineName(fields.englishName)) ?? [],
      derivedDistrictIds,
    )
    const streetId =
      curation?.streetId ?? (candidates.length === 1 ? candidates[0]?.id : undefined)
    if (!streetId) {
      records.push({
        sourceRecordId: `${input.releaseId}:${fields.objectId}`,
        streetId: null,
        objectId: fields.objectId,
        streetCode: fields.streetCode,
        streetType: fields.streetType,
        sourceGeometry,
        geometry,
        bbox: calculateGeoJsonBbox(geometry),
        derivedDistrictIds,
        rawProperties: feature.properties,
        nameEn: fields.englishName,
        nameZhHant: fields.chineseName,
      })
      issues.push({
        objectId: fields.objectId,
        derivedDistrictIds,
        englishName: fields.englishName,
        traditionalChineseName: fields.chineseName ?? '',
        candidates: candidates.map(candidate => candidate.id),
        kind: candidates.length > 1 ? 'ambiguous' : 'unmatched',
      })
      continue
    }
    records.push({
      sourceRecordId: `${input.releaseId}:${fields.objectId}`,
      streetId,
      objectId: fields.objectId,
      streetCode: fields.streetCode,
      streetType: fields.streetType,
      sourceGeometry,
      geometry,
      bbox: calculateGeoJsonBbox(geometry),
      derivedDistrictIds,
      rawProperties: feature.properties,
      nameEn: fields.englishName,
      nameZhHant: fields.chineseName,
    })
  }
  return { issues, records }
}

/**
 * The release audit records the deterministic automatic rule and every manual
 * exception. The individual source rows remain the complete audit
 * ledger for automatic matches.
 */
export function buildRoadCentrelineMatchingActions(input: {
  curations?: Readonly<Record<string, RoadCentrelineCuration>>
  result: ReturnType<typeof normaliseRoadCentrelineFeatures>
}): ReleaseProcessingAction[] {
  const actions: ReleaseProcessingAction[] = [
    {
      action: 'landsd_road_centreline_english_matched',
      affectedRecordCount: input.result.records.length,
      evidence: {
        criteria: [
          'normalised English name',
          'derived canonical district ID when English-name candidates are ambiguous',
        ],
        retainedFields: ['sourceGeometry'],
      },
      mode: 'automatic',
      summary:
        'Matched Road Centreline features to one LandsD street by exact normalised English name, using derived district geometry only to disambiguate collisions.',
    },
  ]
  for (const [key, curation] of Object.entries(input.curations ?? {})) {
    actions.push({
      action: curation.exclude
        ? 'landsd_road_centreline_match_excluded'
        : 'landsd_road_centreline_match_curated',
      affectedRecordCount: 1,
      evidence: { curationKey: key, decision: curation },
      mode: 'manual',
      summary: curation.exclude
        ? 'Excluded a reviewed Road Centreline feature from publication.'
        : 'Applied a reviewed Road Centreline street identity override.',
    })
  }
  return actions
}

/** Release metrics shown in the source-release Stats tab, including its district map. */
export function buildRoadCentrelineReleaseStats(
  records: NormalisedRoadCentreline[],
): RoadCentrelineReleaseStat[] {
  const byStreetType = new Map<string, number>()
  const byDistrict = new Map<string, number>()
  for (const record of records) {
    const type = record.streetType ?? 'unspecified'
    byStreetType.set(type, (byStreetType.get(type) ?? 0) + 1)
    for (const districtId of record.derivedDistrictIds) {
      byDistrict.set(districtId, (byDistrict.get(districtId) ?? 0) + 1)
    }
  }
  return [
    {
      dimension: 'records',
      groupBy: 'source',
      groupValue: 'roadCentreline',
      metric: 'count',
      metricUnit: 'count',
      value: records.length,
    },
    {
      dimension: 'street_coverage',
      metric: 'count',
      metricUnit: 'count',
      value: new Set(
        records.flatMap(record => (record.streetId ? [record.streetId] : [])),
      ).size,
    },
    ...[...byStreetType.entries()].map(([type, count]) => ({
      dimension: 'records',
      groupBy: 'streetType',
      groupValue: type,
      metric: 'count',
      metricUnit: 'count' as const,
      value: count,
    })),
    ...[...byDistrict.entries()].map(([districtId, count]) => ({
      dimension: 'records',
      groupBy: 'district',
      groupValue: districtId,
      metric: 'distribution',
      metricUnit: 'count' as const,
      value: count,
    })),
  ]
}

/** Throws a publication-blocking error while retaining a reviewable report. */
export function requireResolvedRoadCentrelines(
  result: ReturnType<typeof normaliseRoadCentrelineFeatures>,
) {
  if (result.issues.length === 0) return result.records
  const report = result.issues
    .map(
      issue =>
        `${issue.kind}: OBJECTID ${issue.objectId} (${issue.englishName} / ${issue.traditionalChineseName})`,
    )
    .join('; ')
  throw new Error(
    `Road Centreline release cannot publish until every feature is matched or curated: ${report}`,
  )
}

/** A stable per-street aggregate; individual source segments remain untouched. */
export function aggregateRoadCentrelineGeometry(records: NormalisedRoadCentreline[]) {
  const byStreet = new Map<string, NormalisedRoadCentreline[]>()
  for (const record of records) {
    if (!record.streetId) continue
    byStreet.set(record.streetId, [...(byStreet.get(record.streetId) ?? []), record])
  }
  return [...byStreet.entries()].map(([streetId, segments]) => {
    const ordered = [...segments].sort((left, right) => left.objectId - right.objectId)
    const geometries = ordered.map(segment => segment.geometry)
    const lineCoordinates = geometries.flatMap(geometry => {
      if (geometry.type === 'LineString') return [geometry.coordinates]
      if (geometry.type === 'MultiLineString') return geometry.coordinates
      return []
    })
    const geometry =
      lineCoordinates.length === geometries.length
        ? {
            type: 'MultiLineString' as const,
            coordinates: lineCoordinates,
          }
        : { type: 'GeometryCollection' as const, geometries }
    return { streetId, geometry, bbox: calculateGeoJsonBbox(geometry) }
  })
}

/** Schema/profile validation for archived and future LandsD FGDB releases. */
export function validateRoadCentrelineLayer(input: {
  fields: readonly string[]
  layerName: string
}) {
  if (input.layerName !== LANDSD_ROAD_CENTRELINE_LAYER) {
    throw new Error(
      `Road Centreline archive must contain ${LANDSD_ROAD_CENTRELINE_LAYER}; received ${input.layerName}.`,
    )
  }
  const fields = new Set(input.fields)
  const requiredAlternatives = [
    ['STREET_CENTRELINE_ID', 'STREETCENTRELINEID', 'OBJECTID'],
    ['STREET_CODE', 'STREETCODE'],
    ['STREET_NAME_EN', 'ENGLISHSTREETNAME'],
    ['STREET_NAME_TC', 'CHINESESTREETNAME'],
  ]
  for (const alternatives of requiredAlternatives) {
    if (!alternatives.some(field => fields.has(field))) {
      throw new Error(
        `Road Centreline archive is missing required field ${alternatives.join(' or ')}.`,
      )
    }
  }
}

export function normaliseRoadCentrelineName(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('en')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function readRoadCentrelineFields(properties: Record<string, unknown>) {
  const objectId = requiredInteger(
    readAlias(properties, 'STREET_CENTRELINE_ID', 'STREETCENTRELINEID', 'OBJECTID'),
    'STREET_CENTRELINE_ID or OBJECTID',
  )
  return {
    objectId,
    streetCode: requiredText(
      readAlias(properties, 'STREET_CODE', 'STREETCODE'),
      'STREET_CODE or STREETCODE',
    ),
    streetType: optionalText(readAlias(properties, 'STREET_TYPE', 'STREETTYPE')),
    englishName: optionalText(
      readAlias(properties, 'STREET_NAME_EN', 'ENGLISHSTREETNAME'),
    ),
    chineseName: optionalText(
      readAlias(properties, 'STREET_NAME_TC', 'CHINESESTREETNAME'),
    ),
  }
}

function readAlias(properties: Record<string, unknown>, ...names: string[]) {
  return names.map(name => properties[name]).find(value => value !== undefined)
}

function isFeatureCollection(value: unknown): value is {
  features: RoadCentrelineFeature[]
  type: 'FeatureCollection'
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown }).features)
  )
}

function requireNativeLineGeometry(value: unknown): value is GeoJsonGeometry {
  const type =
    value && typeof value === 'object' ? (value as { type?: unknown }).type : null
  return type === 'LineString' || type === 'MultiLineString'
}

function requiredText(value: unknown, field: string) {
  const text = optionalText(value)
  if (!text) throw new Error(`Road Centreline feature requires ${field}.`)
  return text
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requiredInteger(value: unknown, field: string) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number))
    throw new Error(`Road Centreline feature requires integer ${field}.`)
  return number
}

function curationKey(fields: {
  objectId: number
  englishName: string | null
  chineseName: string | null
}) {
  return `${fields.objectId}:${normaliseRoadCentrelineName(fields.englishName ?? '')}`
}

function disambiguateByDerivedDistricts(
  candidates: RoadCentrelineStreet[],
  derivedDistrictIds: string[],
) {
  if (candidates.length <= 1 || derivedDistrictIds.length === 0) return candidates
  const districts = new Set(derivedDistrictIds)
  return candidates.filter(candidate =>
    candidate.districtIds.some(district => districts.has(district)),
  )
}

/**
 * Intersects a projected centreline with the selected SaanSeoi district
 * snapshot. A mere point touch does not assign a segment to a district.
 */
export function deriveRoadCentrelineDistrictIds(
  geometry: GeoJsonGeometry,
  districts: RoadCentrelineDistrict[],
) {
  if (districts.length === 0) return []
  const reader = new GeoJSONReader(new GeometryFactory())
  const segment = reader.read(geometry)
  return districts
    .filter(district => {
      const intersection = OverlayOp.intersection(
        segment,
        reader.read(district.geometry),
      )
      return intersection.getLength() > 0
    })
    .map(district => district.id)
    .sort()
}

function requireLineGeometry(geometry: GeoJsonGeometry, objectId: number) {
  if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') {
    throw new Error(`Road Centreline OBJECTID ${objectId} must be a line geometry.`)
  }
  return geometry
}

function projectHk80Geometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([easting, northing]) => {
    const [longitude, latitude] = proj4(
      LANDSD_ROAD_CENTRELINE_SOURCE_CRS,
      'EPSG:4326',
      [easting, northing],
    )
    return [Number(longitude.toFixed(8)), Number(latitude.toFixed(8))]
  })
}

function mapGeometryPositions(
  geometry: GeoJsonGeometry,
  transform: (position: GeoJsonPosition) => GeoJsonPosition,
): GeoJsonGeometry {
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map(item =>
        mapGeometryPositions(item, transform),
      ),
    }
  }
  const mapValue = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value
    if (typeof value[0] === 'number') return transform(value as GeoJsonPosition)
    return value.map(mapValue)
  }
  return { ...geometry, coordinates: mapValue(geometry.coordinates) } as GeoJsonGeometry
}
