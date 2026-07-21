export type GeoJsonPosition =
  | [longitude: number, latitude: number]
  | [longitude: number, latitude: number, elevation: number]

export type GeoJsonGeometry =
  | {
      type: 'Point'
      coordinates: GeoJsonPosition
    }
  | {
      type: 'MultiPoint' | 'LineString'
      coordinates: GeoJsonPosition[]
    }
  | {
      type: 'MultiLineString' | 'Polygon'
      coordinates: GeoJsonPosition[][]
    }
  | {
      type: 'MultiPolygon'
      coordinates: GeoJsonPosition[][][]
    }
  | {
      type: 'GeometryCollection'
      geometries: GeoJsonGeometry[]
    }

/** Returns the WGS84 `[minLng, minLat, maxLng, maxLat]` extent of a geometry. */
export function calculateGeoJsonBbox(
  geometry: GeoJsonGeometry,
): [number, number, number, number] {
  const positions: GeoJsonPosition[] = []
  collectPositions(geometry, positions)
  if (positions.length === 0) {
    throw new Error(`Cannot calculate a bbox for empty ${geometry.type} geometry.`)
  }
  let minLng = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  for (const [lng, lat] of positions) {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  }
  return [minLng, minLat, maxLng, maxLat]
}

function collectPositions(geometry: GeoJsonGeometry, positions: GeoJsonPosition[]) {
  if (geometry.type === 'Point') {
    positions.push(geometry.coordinates)
    return
  }
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    positions.push(...geometry.coordinates)
    return
  }
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
    positions.push(...geometry.coordinates.flat())
    return
  }
  if (geometry.type === 'MultiPolygon') {
    positions.push(...geometry.coordinates.flat(2))
    return
  }
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) collectPositions(child, positions)
  }
}
