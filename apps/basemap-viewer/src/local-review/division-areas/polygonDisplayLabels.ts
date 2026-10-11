import { polygonLabelPoint } from '@repo/core/pipeline/services/divisions/polygonLabelPoint'
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

/** Converts each displayed area into exactly one label anchor. */
export function polygonDisplayLabelData<Properties extends GeoJsonProperties>(
  data: FeatureCollection<Polygon | MultiPolygon, Properties>,
): FeatureCollection<Point, Properties> {
  return {
    type: 'FeatureCollection',
    features: data.features.map(
      (feature): Feature<Point, Properties> => ({
        type: 'Feature',
        id: feature.id,
        properties: feature.properties,
        geometry: {
          type: 'Point',
          coordinates: largestPolygonLabelPoint(feature.geometry),
        },
      }),
    ),
  }
}
