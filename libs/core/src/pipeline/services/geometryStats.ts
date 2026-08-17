import type { GeoJsonGeometry, GeoJsonPosition } from '../geojson'

/** WGS84 semi-major axis, in metres. */
const WGS84_A = 6_378_137
/** WGS84 flattening. */
const WGS84_F = 1 / 298.257_223_563
/**
 * The WGS84 authalic radius. Areas are evaluated on the ellipsoid's
 * equal-area sphere; lengths use Vincenty's inverse solution on WGS84.
 */
const WGS84_AUTHALIC_RADIUS = 6_371_007.180_918_475
const DEGREES_TO_RADIANS = Math.PI / 180

export type GeometryStatisticRecord = {
  geometry: GeoJsonGeometry
  id: string
  divisionId?: string | null
  leftDivisionId?: string | null
  rightDivisionId?: string | null
}

export type DistrictGeometryMetrics = {
  area?: number
  boundaryLength: number
  boundarySegmentCount: number
  featureCount: number
  polygonCount?: number
}

export type DistrictGeometryStatistics = Map<string, DistrictGeometryMetrics>

export type DistrictGeometrySelection = {
  excludedRecordIds: string[]
  records: GeometryStatisticRecord[]
}

/**
 * Selects the records which have a defined district meaning. This is used for
 * global or multi-level sources such as Overture: source records outside the
 * district hierarchy are intentionally excluded, while a boundary adjoining a
 * district is still attributed to that district even when its other side is
 * not district-assigned.
 *
 * Geometry itself is never filtered or repaired here. Every selected record
 * is still measured strictly by {@link calculateDistrictGeometryStatistics}.
 */
export function selectDistrictRelevantGeometryRecords(
  resourceType: 'divisionArea' | 'divisionBoundary',
  records: GeometryStatisticRecord[],
  districtByDivisionId: Map<string, string>,
): DistrictGeometrySelection {
  const excludedRecordIds: string[] = []
  const selected: GeometryStatisticRecord[] = []

  for (const record of records) {
    if (resourceType === 'divisionArea') {
      if (!record.divisionId || !districtByDivisionId.has(record.divisionId)) {
        excludedRecordIds.push(record.id)
        continue
      }
      selected.push(record)
      continue
    }

    const leftDivisionId =
      record.leftDivisionId && districtByDivisionId.has(record.leftDivisionId)
        ? record.leftDivisionId
        : null
    const rightDivisionId =
      record.rightDivisionId && districtByDivisionId.has(record.rightDivisionId)
        ? record.rightDivisionId
        : null
    if (!leftDivisionId && !rightDivisionId) {
      excludedRecordIds.push(record.id)
      continue
    }
    selected.push({ ...record, leftDivisionId, rightDivisionId })
  }

  return { excludedRecordIds, records: selected }
}

/**
 * Aggregates exact EPSG:4326 canonical geometry by its already-versioned
 * district assignment. Boundary records are deliberately attributed to both
 * adjacent districts.
 */
export function calculateDistrictGeometryStatistics(
  resourceType: 'divisionArea' | 'divisionBoundary',
  records: GeometryStatisticRecord[],
  districtByDivisionId: Map<string, string>,
): DistrictGeometryStatistics {
  const result: DistrictGeometryStatistics = new Map()

  for (const record of records) {
    const districts = new Set(
      divisionIdsForRecord(resourceType, record).map(divisionId => {
        const districtId = districtByDivisionId.get(divisionId)
        if (!districtId) {
          throw new Error(
            `Geometry record ${record.id} references division ${divisionId}, which has no district assignment in the release division snapshot.`,
          )
        }
        return districtId
      }),
    )
    if (districts.size === 0) {
      throw new Error(`Geometry record ${record.id} has no district assignment.`)
    }

    const measurement = calculateGeometryMeasurement(
      resourceType,
      record.geometry,
      record.id,
    )
    for (const districtId of districts) {
      const current = result.get(districtId) ?? {
        boundaryLength: 0,
        boundarySegmentCount: 0,
        featureCount: 0,
        ...(resourceType === 'divisionArea' ? { area: 0, polygonCount: 0 } : {}),
      }
      current.featureCount += 1
      current.boundaryLength += measurement.boundaryLength
      current.boundarySegmentCount += measurement.boundarySegmentCount
      if (resourceType === 'divisionArea') {
        current.area = (current.area ?? 0) + (measurement.area ?? 0)
        current.polygonCount =
          (current.polygonCount ?? 0) + (measurement.polygonCount ?? 0)
      }
      result.set(districtId, current)
    }
  }

  return result
}

export function calculateGeometryMeasurement(
  resourceType: 'divisionArea' | 'divisionBoundary',
  geometry: GeoJsonGeometry,
  recordId = '<unknown>',
) {
  if (resourceType === 'divisionArea') {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      throw new Error(
        `Geometry record ${recordId} must be a Polygon or MultiPolygon, received ${geometry.type}.`,
      )
    }
    const polygons: GeoJsonPosition[][][] =
      geometry.type === 'Polygon'
        ? [geometry.coordinates as GeoJsonPosition[][]]
        : (geometry.coordinates as GeoJsonPosition[][][])
    if (polygons.length === 0)
      throw new Error(`Geometry record ${recordId} has an empty polygon geometry.`)
    let area = 0
    let boundaryLength = 0
    let boundarySegmentCount = 0
    for (const polygon of polygons) {
      if (polygon.length === 0)
        throw new Error(`Geometry record ${recordId} has a polygon without rings.`)
      polygon.forEach((ring, index) => {
        assertValidRing(ring, recordId)
        const ringArea = Math.abs(ringAreaSquareMetres(ring))
        area += index === 0 ? ringArea : -ringArea
        boundaryLength += ringLengthMetres(ring)
        boundarySegmentCount += ringSegmentCount(ring)
      })
    }
    if (area < 0)
      throw new Error(
        `Geometry record ${recordId} has holes larger than its exterior ring.`,
      )
    return {
      area: area / 1_000_000,
      boundaryLength: boundaryLength / 1_000,
      boundarySegmentCount,
      polygonCount: polygons.length,
    }
  }

  if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') {
    throw new Error(
      `Geometry record ${recordId} must be a LineString or MultiLineString, received ${geometry.type}.`,
    )
  }
  const lines: GeoJsonPosition[][] =
    geometry.type === 'LineString'
      ? [geometry.coordinates as GeoJsonPosition[]]
      : (geometry.coordinates as GeoJsonPosition[][])
  if (lines.length === 0)
    throw new Error(`Geometry record ${recordId} has an empty line geometry.`)
  let boundaryLength = 0
  let boundarySegmentCount = 0
  for (const line of lines) {
    assertValidLine(line, recordId)
    boundaryLength += lineLengthMetres(line)
    boundarySegmentCount += lineSegmentCount(line)
  }
  return { boundaryLength: boundaryLength / 1_000, boundarySegmentCount }
}

function divisionIdsForRecord(
  resourceType: 'divisionArea' | 'divisionBoundary',
  record: GeometryStatisticRecord,
) {
  const ids =
    resourceType === 'divisionArea'
      ? [record.divisionId]
      : [record.leftDivisionId, record.rightDivisionId]
  return [
    ...new Set(
      ids.filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]
}

function assertValidPosition(position: GeoJsonPosition, recordId: string) {
  const [longitude, latitude] = position
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`Geometry record ${recordId} contains a non-finite coordinate.`)
  }
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(
      `Geometry record ${recordId} contains a coordinate outside EPSG:4326 bounds.`,
    )
  }
}

function assertValidLine(line: GeoJsonPosition[], recordId: string) {
  if (line.length < 2)
    throw new Error(
      `Geometry record ${recordId} has a line with fewer than two positions.`,
    )
  line.forEach(position => {
    assertValidPosition(position, recordId)
  })
}

function assertValidRing(ring: GeoJsonPosition[], recordId: string) {
  if (ring.length < 3)
    throw new Error(
      `Geometry record ${recordId} has a ring with fewer than three positions.`,
    )
  ring.forEach(position => {
    assertValidPosition(position, recordId)
  })
  if (uniquePositions(ring).length < 3) {
    throw new Error(
      `Geometry record ${recordId} has a ring with fewer than three distinct positions.`,
    )
  }
}

function uniquePositions(positions: GeoJsonPosition[]) {
  return [
    ...new Set(positions.map(([longitude, latitude]) => `${longitude},${latitude}`)),
  ]
}

function ringLengthMetres(ring: GeoJsonPosition[]) {
  const positions = openRing(ring)
  let total = 0
  for (const [current, next] of positionPairs(positions, true)) {
    total += vincentyDistanceMetres(current, next)
  }
  return total
}

function lineLengthMetres(line: GeoJsonPosition[]) {
  let total = 0
  for (const [previous, current] of positionPairs(line, false)) {
    total += vincentyDistanceMetres(previous, current)
  }
  return total
}

/**
 * Counts non-zero edges rather than positions. For rings, a repeated closing
 * coordinate is removed before the closing edge is counted once.
 */
function ringSegmentCount(ring: GeoJsonPosition[]) {
  const positions = openRing(ring)
  return positionPairs(positions, true).filter(
    ([current, next]) => !samePosition(current, next),
  ).length
}

function lineSegmentCount(line: GeoJsonPosition[]) {
  return positionPairs(line, false).filter(
    ([previous, current]) => !samePosition(previous, current),
  ).length
}

function samePosition(a: GeoJsonPosition, b: GeoJsonPosition) {
  return a[0] === b[0] && a[1] === b[1]
}

function openRing(ring: GeoJsonPosition[]) {
  const [first, ...remaining] = ring
  const last = remaining.at(-1)
  if (!first || !last) return ring
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
}

function positionPairs(
  positions: GeoJsonPosition[],
  closesRing: boolean,
): [GeoJsonPosition, GeoJsonPosition][] {
  const [first, ...remaining] = positions
  if (!first) return []

  const pairs: [GeoJsonPosition, GeoJsonPosition][] = []
  let previous = first
  for (const current of remaining) {
    pairs.push([previous, current])
    previous = current
  }
  if (closesRing && remaining.length > 0) pairs.push([previous, first])
  return pairs
}

/** Chamberlain-Duquette on the WGS84 authalic sphere, in square metres. */
function ringAreaSquareMetres(ring: GeoJsonPosition[]) {
  const positions = openRing(ring)
  let sum = 0
  for (const [current, next] of positionPairs(positions, true)) {
    sum +=
      normaliseLongitude(next[0] - current[0]) *
      DEGREES_TO_RADIANS *
      (2 +
        Math.sin(current[1] * DEGREES_TO_RADIANS) +
        Math.sin(next[1] * DEGREES_TO_RADIANS))
  }
  return (sum * WGS84_AUTHALIC_RADIUS ** 2) / 2
}

function normaliseLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180
}

/** Vincenty's inverse solution on the WGS84 ellipsoid, in metres. */
function vincentyDistanceMetres(a: GeoJsonPosition, b: GeoJsonPosition) {
  if (a[0] === b[0] && a[1] === b[1]) return 0
  const semiMinor = WGS84_A * (1 - WGS84_F)
  const reducedLatitudeA = Math.atan(
    (1 - WGS84_F) * Math.tan(a[1] * DEGREES_TO_RADIANS),
  )
  const reducedLatitudeB = Math.atan(
    (1 - WGS84_F) * Math.tan(b[1] * DEGREES_TO_RADIANS),
  )
  const sinU1 = Math.sin(reducedLatitudeA)
  const cosU1 = Math.cos(reducedLatitudeA)
  const sinU2 = Math.sin(reducedLatitudeB)
  const cosU2 = Math.cos(reducedLatitudeB)
  const longitude = normaliseLongitude(b[0] - a[0]) * DEGREES_TO_RADIANS
  let lambda = longitude
  let previous: number
  let sinSigma = 0
  let cosSigma = 0
  let sigma = 0
  let sinAlpha = 0
  let cosSquaredAlpha = 0
  let cosTwoSigmaM = 0
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const sinLambda = Math.sin(lambda)
    const cosLambda = Math.cos(lambda)
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    if (sinSigma === 0) return 0
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSquaredAlpha = 1 - sinAlpha ** 2
    cosTwoSigmaM =
      cosSquaredAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSquaredAlpha
    const correction =
      (WGS84_F / 16) * cosSquaredAlpha * (4 + WGS84_F * (4 - 3 * cosSquaredAlpha))
    previous = lambda
    lambda =
      longitude +
      (1 - correction) *
        WGS84_F *
        sinAlpha *
        (sigma +
          correction *
            sinSigma *
            (cosTwoSigmaM + correction * cosSigma * (-1 + 2 * cosTwoSigmaM ** 2)))
    if (Math.abs(lambda - previous) < 1e-12) break
    if (iteration === 199) {
      throw new Error(
        'Vincenty inverse calculation did not converge for an antipodal geometry segment.',
      )
    }
  }
  const uSquared = (cosSquaredAlpha * (WGS84_A ** 2 - semiMinor ** 2)) / semiMinor ** 2
  const coefficientA =
    1 +
    (uSquared / 16_384) * (4096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)))
  const coefficientB =
    (uSquared / 1024) * (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)))
  const deltaSigma =
    coefficientB *
    sinSigma *
    (cosTwoSigmaM +
      (coefficientB / 4) *
        (cosSigma * (-1 + 2 * cosTwoSigmaM ** 2) -
          (coefficientB / 6) *
            cosTwoSigmaM *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cosTwoSigmaM ** 2)))
  return semiMinor * coefficientA * (sigma - deltaSigma)
}
