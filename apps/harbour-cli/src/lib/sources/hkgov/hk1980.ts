import proj4 from 'proj4'
import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'

const HONG_KONG_1980_GRID =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs +type=crs'

proj4.defs('EPSG:2326', HONG_KONG_1980_GRID)

export function projectHk80Geometry(geometry: GeoJsonGeometry): GeoJsonGeometry {
  return mapGeometryPositions(geometry, ([easting, northing]) => {
    const [longitude, latitude] = proj4('EPSG:2326', 'EPSG:4326', [easting, northing])
    // Match the precision exposed by the CSDI EPSG:4326 WFS view. This avoids
    // introducing sub-millimetre projection noise at shared district edges.
    return [roundCoordinate(longitude), roundCoordinate(latitude)]
  })
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(8))
}

function mapGeometryPositions(
  geometry: GeoJsonGeometry,
  transform: (position: GeoJsonPosition) => GeoJsonPosition,
): GeoJsonGeometry {
  if (geometry.type === 'GeometryCollection') {
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries.map(child =>
        mapGeometryPositions(child, transform),
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
