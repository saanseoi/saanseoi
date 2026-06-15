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
