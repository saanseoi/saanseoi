import type { MultiPolygon, Polygon, Position } from 'geojson'
import type {
  ReviewArea,
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import { adoptCurrentGeometryBaseline } from './geometryBaseline'

export const ACCIDENTAL_DETACHED_PART_MAX_SQUARE_METRES = 10_000
export const ACCIDENTAL_DETACHED_PART_MAX_MAIN_RATIO = 0.01

type PolygonCoordinates = MultiPolygon['coordinates'][number]

function ringAreaSquareMetres(ring: Position[]) {
  if (ring.length < 4) return 0
  const earthRadiusMetres = 6_371_008.8
  const radians = Math.PI / 180
  const referenceLatitude =
    (ring.reduce((sum, point) => sum + point[1]!, 0) / ring.length) * radians
  let twiceArea = 0
  for (let index = 0; index < ring.length - 1; index++) {
    const current = ring[index]!
    const next = ring[index + 1]!
    const currentX =
      current[0]! * radians * earthRadiusMetres * Math.cos(referenceLatitude)
    const currentY = current[1]! * radians * earthRadiusMetres
    const nextX = next[0]! * radians * earthRadiusMetres * Math.cos(referenceLatitude)
    const nextY = next[1]! * radians * earthRadiusMetres
    twiceArea += currentX * nextY - nextX * currentY
  }
  return Math.abs(twiceArea) / 2
}

function polygonAreaSquareMetres(polygon: PolygonCoordinates) {
  const outer = ringAreaSquareMetres(polygon[0] ?? [])
  const holes = polygon
    .slice(1)
    .reduce((sum, ring) => sum + ringAreaSquareMetres(ring), 0)
  return Math.max(0, outer - holes)
}

function cleanedGeometry(
  geometry: MultiPolygon,
  removeEveryDetachedPart: boolean,
): {
  geometry: Polygon | MultiPolygon
  removedPartCount: number
  removedAreaSquareMetres: number
} {
  const ranked = geometry.coordinates
    .map((coordinates, index) => ({
      coordinates,
      index,
      area: polygonAreaSquareMetres(coordinates),
    }))
    .sort((left, right) => right.area - left.area)
  const main = ranked[0]!
  const removed = new Set(
    ranked
      .slice(1)
      .filter(
        part =>
          removeEveryDetachedPart ||
          (part.area < ACCIDENTAL_DETACHED_PART_MAX_SQUARE_METRES &&
            part.area / main.area < ACCIDENTAL_DETACHED_PART_MAX_MAIN_RATIO),
      )
      .map(part => part.index),
  )
  const retained = geometry.coordinates.filter((_, index) => !removed.has(index))
  return {
    geometry:
      retained.length === 1
        ? { type: 'Polygon', coordinates: structuredClone(retained[0]!) }
        : { type: 'MultiPolygon', coordinates: structuredClone(retained) },
    removedPartCount: removed.size,
    removedAreaSquareMetres: ranked
      .filter(part => removed.has(part.index))
      .reduce((sum, part) => sum + part.area, 0),
  }
}

export type DetachedPartCleanupChange = {
  divisionId: string
  name: string
  removedPartCount: number
  removedAreaSquareMetres: number
}

/**
 * Removes tiny detached coastline fragments from reviewed locality drawings.
 * Administrative coverage keeps every component. A named island keeps only its
 * largest connected land polygon because detached polygons are separate islands.
 */
export function removeAccidentalDetachedParts(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
): { estimatedAreas: SaanseoiEstimatedAreas; changes: DetachedPartCleanupChange[] } {
  const divisions = new Map(
    inventory.divisions.map(division => [division.id, division]),
  )
  const changes: DetachedPartCleanupChange[] = []
  return {
    estimatedAreas: {
      ...estimatedAreas,
      features: estimatedAreas.features.map(feature => {
        if (
          feature.geometry.type !== 'MultiPolygon' ||
          feature.geometry.coordinates.length < 2
        )
          return feature
        const division = divisions.get(feature.properties.divisionId)
        if (!division || division.category === 'administrative') return feature
        const result = cleanedGeometry(
          feature.geometry,
          division.category === 'landform',
        )
        if (!result.removedPartCount) return feature
        const baseline = adoptCurrentGeometryBaseline({
          ...feature,
          geometry: result.geometry,
        } as ReviewArea)
        const { geometryOriginalDrawing: _discardedOriginal, ...properties } =
          baseline.properties
        changes.push({
          divisionId: division.id,
          name:
            (typeof feature.properties.name === 'string'
              ? feature.properties.name
              : division.names.en) ?? division.id,
          removedPartCount: result.removedPartCount,
          removedAreaSquareMetres: result.removedAreaSquareMetres,
        })
        return { ...baseline, properties }
      }),
    },
    changes,
  }
}
