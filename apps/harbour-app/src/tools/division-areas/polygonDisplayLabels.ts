import { polygonLabelPoint } from '../../../../../libs/core/src/pipeline/services/divisions/polygonLabelPoint'
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from 'geojson'

function ringAreaAndCentroid(ring: Position[]) {
  let twiceArea = 0
  let x = 0
  let y = 0
  for (let index = 0; index < ring.length - 1; index++) {
    const current = ring[index]!
    const next = ring[index + 1]!
    const cross = current[0]! * next[1]! - next[0]! * current[1]!
    twiceArea += cross
    x += (current[0]! + next[0]!) * cross
    y += (current[1]! + next[1]!) * cross
  }
  const area = Math.abs(twiceArea) / 2
  if (!twiceArea) return { area: 0, centroid: ring[0] ?? [0, 0] }
  return {
    area,
    centroid: [x / (3 * twiceArea), y / (3 * twiceArea)] as Position,
  }
}

function polygonArea(rings: Position[][]) {
  const outerArea = ringAreaAndCentroid(rings[0] ?? []).area
  return Math.max(
    0,
    outerArea -
      rings.slice(1).reduce((sum, ring) => sum + ringAreaAndCentroid(ring).area, 0),
  )
}

/** Retains the largest connected polygon part of an area. */
export function largestPolygonGeometry(geometry: Polygon | MultiPolygon): Polygon {
  if (geometry.type === 'Polygon') return structuredClone(geometry)
  const coordinates = geometry.coordinates.reduce((selected, polygon) =>
    polygonArea(polygon) > polygonArea(selected) ? polygon : selected,
  )
  return { type: 'Polygon', coordinates: structuredClone(coordinates) }
}

/** Returns an interior label anchor away from edges and holes. */
export function largestPolygonLabelPoint(geometry: Polygon | MultiPolygon): Position {
  return polygonLabelPoint(geometry)
}

/** Cache by geometry content so immutable edits and Undo can reuse unchanged labels. */
export function createPolygonDisplayLabelData(
  locate: typeof largestPolygonLabelPoint = largestPolygonLabelPoint,
) {
  let cache = new Map<string, { signature: string; coordinates: Position }>()
  return <Properties extends GeoJsonProperties>(
    data: FeatureCollection<Polygon | MultiPolygon, Properties>,
  ): FeatureCollection<Point, Properties> => {
    const next = new Map<string, { signature: string; coordinates: Position }>()
    const features = data.features.map((feature, index): Feature<Point, Properties> => {
      const key = String(feature.id ?? feature.properties?.divisionId ?? index)
      const signature = JSON.stringify(feature.geometry)
      const previous = cache.get(key)
      const entry =
        previous?.signature === signature
          ? previous
          : {
              signature,
              coordinates: locate(feature.geometry),
            }
      next.set(key, entry)
      return {
        type: 'Feature',
        id: feature.id,
        properties: feature.properties,
        geometry: { type: 'Point', coordinates: [...entry.coordinates] },
      }
    })
    cache = next
    return { type: 'FeatureCollection', features }
  }
}

export const polygonDisplayLabelData = createPolygonDisplayLabelData()
