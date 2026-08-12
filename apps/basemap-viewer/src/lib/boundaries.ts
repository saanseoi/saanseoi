type Position = [number, number]
type Polygon = Position[][]

export type RegionBoundary = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry:
    | { type: 'Polygon'; coordinates: Polygon }
    | { type: 'MultiPolygon'; coordinates: Polygon[] }
}

type Mask = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, never>
    geometry: { type: 'Polygon'; coordinates: Polygon }
  }>
}

const WORLD_RING: Position[] = [
  [-180, -85.051129],
  [180, -85.051129],
  [180, 85.051129],
  [-180, 85.051129],
  [-180, -85.051129],
]

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
    )
  )
}

function isRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition)
}

function isPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length > 0 && value.every(isRing)
}

export function parseRegionBoundary(value: unknown): RegionBoundary | null {
  if (typeof value !== 'object' || value === null) return null
  const feature = value as Record<string, unknown>
  if (feature.type !== 'Feature' || typeof feature.geometry !== 'object') return null
  const geometry = feature.geometry as Record<string, unknown>
  if (geometry.type === 'Polygon' && isPolygon(geometry.coordinates)) {
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: geometry.coordinates },
    }
  }
  if (
    geometry.type === 'MultiPolygon' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(isPolygon)
  ) {
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: geometry.coordinates },
    }
  }
  return null
}

function signedArea(ring: Position[]): number {
  return ring.slice(1).reduce((area, point, index) => {
    const previous = ring[index]
    if (!previous) return area
    return area + previous[0] * point[1] - point[0] * previous[1]
  }, 0)
}

function clockwise(ring: Position[]): Position[] {
  return signedArea(ring) < 0 ? ring : [...ring].reverse()
}

function counterClockwise(ring: Position[]): Position[] {
  return signedArea(ring) > 0 ? ring : [...ring].reverse()
}

function polygons(boundary: RegionBoundary): Polygon[] {
  return boundary.geometry.type === 'Polygon'
    ? [boundary.geometry.coordinates]
    : boundary.geometry.coordinates
}

/** Returns the smallest longitude/latitude box that contains the boundary. */
export function boundaryBounds(
  boundary: RegionBoundary,
): [number, number, number, number] {
  const positions = polygons(boundary).flat(2)
  return [
    Math.min(...positions.map(([longitude]) => longitude)),
    Math.min(...positions.map(([, latitude]) => latitude)),
    Math.max(...positions.map(([longitude]) => longitude)),
    Math.max(...positions.map(([, latitude]) => latitude)),
  ]
}

function outerRing(polygon: Polygon): Position[] {
  const ring = polygon[0]
  if (!ring) throw new Error('Region boundary polygon has no outer ring.')
  return ring
}

/** An opaque mask for map content outside the exact release boundary. */
export function outsideBoundaryMask(boundary: RegionBoundary): Mask {
  const regionPolygons = polygons(boundary)
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            WORLD_RING,
            ...regionPolygons.map(polygon => clockwise(outerRing(polygon))),
          ],
        },
      },
      ...regionPolygons.flatMap(polygon =>
        polygon.slice(1).map(ring => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [counterClockwise(ring)] },
        })),
      ),
    ],
  }
}
