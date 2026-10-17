import type { Polygon, MultiPolygon } from 'geojson'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import MaximumInscribedCircle from 'jsts/org/locationtech/jts/algorithm/construct/MaximumInscribedCircle.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'

/** Prefer a contained bounds centre; otherwise maximise clearance in the largest part. */
export function polygonLabelPoint(geometry: Polygon | MultiPolygon): [number, number] {
  const reader = new GeoJSONReader(new GeometryFactory())
  const shape = reader.read(geometry)
  if (shape.isEmpty() || !IsValidOp.isValid(shape))
    throw new Error('Cannot place a label in an invalid or empty polygon.')
  let largest = shape.getGeometryN(0)
  for (let index = 1; index < shape.getNumGeometries(); index++) {
    const part = shape.getGeometryN(index)
    if (part.getArea() > largest.getArea()) largest = part
  }
  const bounds = largest.getEnvelopeInternal()
  const centre: [number, number] = [
    (bounds.getMinX() + bounds.getMaxX()) / 2,
    (bounds.getMinY() + bounds.getMaxY()) / 2,
  ]
  if (RelateOp.contains(largest, reader.read({ type: 'Point', coordinates: centre })))
    return centre
  const tolerance = Math.max(
    Math.min(bounds.getWidth(), bounds.getHeight()) * 1e-4,
    1e-9,
  )
  const point = MaximumInscribedCircle.getCenter(largest, tolerance)
  if (!RelateOp.contains(largest, point))
    throw new Error('Cannot place a label inside the polygon.')
  const coordinate = point.getCoordinate()
  return [coordinate.x, coordinate.y]
}
