import type { Position, Polygon } from 'geojson'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import IsSimpleOp from 'jsts/org/locationtech/jts/operation/IsSimpleOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

const reader = new GeoJSONReader(new GeometryFactory())
const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
export function validatePencilPath(points: Position[], closed = false) {
  if (
    points.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
  )
    throw Error('Invalid drawing coordinate.')
  if (points.some((p, i) => i > 0 && same(p, points[i - 1]!)))
    throw Error('The line would retrace a node.')
  if (closed) {
    if (points.length < 4 || !same(points[0]!, points.at(-1)!))
      throw Error('Draw at least three corners before closing.')
    const check = new IsValidOp(reader.read({ type: 'Polygon', coordinates: [points] }))
    if (!check.isValid())
      throw Error(
        `Cannot close this shape: ${check.getValidationError().getMessage()}. Undo or choose another route.`,
      )
  }
}

export function extendPencilPath(
  points: Position[],
  target: Position,
  straight: boolean,
  snap: (p: Position) => Position | null,
  route: (a: Position, b: Position) => Position[] | null,
  closing = false,
): Position[] {
  let addition: Position[]
  if (straight) addition = [target]
  else {
    const end = snap(target)
    if (!end) throw Error('No road within 30 m. Hold Ctrl to draw a straight line.')
    if (!points.length) addition = [end]
    else {
      const start = snap(points.at(-1)!)
      if (!start)
        throw Error(
          'The last point is away from roads. Hold Ctrl to draw back to a road.',
        )
      const path = route(start, end)
      if (!path?.length)
        throw Error(
          'No connected road route. Choose a closer road point or hold Ctrl for a straight line.',
        )
      addition = path
    }
    if (closing) addition = [...addition, target]
  }
  const next = points.map(p => [...p])
  for (const p of addition)
    if (!next.length || !same(next.at(-1)!, p)) next.push([...p])
  if (next.length === points.length)
    throw Error('Choose another point to extend the line.')
  validatePencilPath(next)
  return next
}
export function pencilPolygon(points: Position[]): Polygon {
  validatePencilPath(points, true)
  return { type: 'Polygon', coordinates: [structuredClone(points)] }
}

export function drawingIntersection(
  points: Position[],
  closed = true,
): Position | null {
  if (points.length < 3) return null
  const coordinates =
    closed && !same(points[0]!, points.at(-1)!) ? [...points, points[0]!] : points
  const check = new IsSimpleOp(reader.read({ type: 'LineString', coordinates }))
  if (check.isSimple()) return null
  const p = check.getNonSimpleLocation()
  return p ? [p.x, p.y] : null
}
