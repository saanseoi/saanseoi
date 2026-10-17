import type { Polygon, MultiPolygon, Position } from 'geojson'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import { boundarySegmentIndex, snapBoundaryVertices } from './indexedBoundarySnap'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import SnapIfNeededOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapIfNeededOverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js'
import { insertBoundaryNodes } from './pencilRegions'

type Area = Polygon | MultiPolygon
export class BoundaryAlignmentError extends Error {
  constructor(
    message: string,
    readonly coordinate?: Position,
  ) {
    super(message)
    this.name = 'BoundaryAlignmentError'
  }
}
const reader = new GeoJSONReader(new GeometryFactory()),
  writer = new GeoJSONWriter()
const rings = (area: Area) =>
  area.type === 'Polygon' ? area.coordinates : area.coordinates.flat()
function valid(shape: ReturnType<typeof reader.read>, stage: string) {
  const geometryType = shape.getGeometryType()
  if (shape.isEmpty()) throw Error(`${stage} produced an empty geometry.`)
  if (!['Polygon', 'MultiPolygon'].includes(geometryType))
    throw Error(`${stage} produced ${geometryType}, not a polygon.`)
  const validation = new IsValidOp(shape)
  if (!validation.isValid()) {
    const error = validation.getValidationError()
    const point = error?.getCoordinate()
    const location = point ? ` at ${point.x.toFixed(7)}, ${point.y.toFixed(7)}` : ''
    throw new BoundaryAlignmentError(
      `${stage} is invalid: ${error?.getMessage() ?? 'topology validation failed'}${location}.`,
      point ? [point.x, point.y] : undefined,
    )
  }
}
/** Explicit reference and relationship: level numbers alone do not establish ownership. */
export function alignBoundary(
  reference: Area,
  target: Area,
  relation: 'inside' | 'neighbour',
  metres = 5,
) {
  if (!(metres > 0 && metres <= 5))
    throw Error('Alignment distance must be greater than 0 and at most 5 metres.')
  const original = reader.read(target),
    fixed = reader.read(reference)
  valid(original, 'Selected target polygon')
  valid(fixed, 'Selected reference polygon')
  // Conservative angular tolerance: neither axis can move more than the metre limit.
  const tolerance = metres / 111320
  const projected: Position[] = []
  const nearbySegments = boundarySegmentIndex(reference)
  for (const p of rings(target).flat()) {
    let best: Position | null = null,
      distance = tolerance
    for (const { a, b } of nearbySegments(p, tolerance)) {
      const dx = b[0]! - a[0]!,
        dy = b[1]! - a[1]!,
        length = dx * dx + dy * dy
      if (!length) continue
      const t = Math.max(
        0,
        Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / length),
      )
      const q = [a[0]! + t * dx, a[1]! + t * dy]
      const d = Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)
      if (d <= distance) {
        best = q
        distance = d
      }
    }
    if (best) projected.push(best)
  }
  const nodedReference = insertBoundaryNodes(reference, projected)
  const anchor = reader.read(nodedReference)
  let snapped = reader.read(
    snapBoundaryVertices(target, nodedReference, tolerance, reference),
  )
  // Dense bays and narrow channels may not admit the full 5 m snap radius.
  // Reduce displacement rather than repairing topology by deleting polygon parts.
  for (let attempt = 1; !IsValidOp.isValid(snapped) && attempt <= 6; attempt++)
    snapped = reader.read(
      snapBoundaryVertices(target, nodedReference, tolerance / 5 ** attempt, reference),
    )
  valid(snapped, 'Snapping the target to the reference')
  const overlay = (op: number) => SnapIfNeededOverlayOp.overlayOp(snapped, anchor, op)
  // Perfect inclusion or a non-overlapping neighbour, chosen explicitly by the user.
  let result = overlay(
    relation === 'inside' ? OverlayOp.INTERSECTION : OverlayOp.DIFFERENCE,
  )
  // Boundary-only contacts can accompany the polygonal intersection. They
  // contribute no area and must not turn a valid coastline result into an error.
  if (result.getGeometryType() === 'GeometryCollection') {
    const polygons: Polygon['coordinates'][] = []
    const collect = (shape: ReturnType<typeof reader.read>) => {
      if (shape.getGeometryType() === 'Polygon')
        polygons.push((writer.write(shape) as Polygon).coordinates)
      else if (['GeometryCollection', 'MultiPolygon'].includes(shape.getGeometryType()))
        for (let i = 0; i < shape.getNumGeometries(); i++)
          collect(shape.getGeometryN(i))
    }
    collect(result)
    result = reader.read({ type: 'MultiPolygon', coordinates: polygons })
  }
  valid(
    result,
    relation === 'inside'
      ? 'Clipping the target inside the reference'
      : 'Removing the reference from the target',
  )
  if (
    relation === 'neighbour' &&
    SnapIfNeededOverlayOp.overlayOp(
      result.getBoundary(),
      anchor.getBoundary(),
      OverlayOp.INTERSECTION,
    ).getLength() === 0
  )
    throw Error('No shared edge within 5 m of the reference. No drawings changed.')
  const changed = SnapIfNeededOverlayOp.overlayOp(
    original,
    result,
    OverlayOp.SYMDIFFERENCE,
  )
  const outline = anchor.getBoundary()
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
  const originalNodes = new Set(original.getCoordinates().map(key))
  const fixedNodes = new Set(
    result
      .getCoordinates()
      .filter((p: { x: number; y: number }) => originalNodes.has(key(p)))
      .map(key),
  )
  if (
    changed
      .getCoordinates()
      .some(
        (p: { x: number; y: number }) =>
          !fixedNodes.has(key(p)) &&
          DistanceOp.distance(
            outline,
            reader.read({ type: 'Point', coordinates: [p.x, p.y] }),
          ) >
            tolerance * 1.000001,
      )
  )
    throw Error(
      'This relationship would change land more than 5 m from the reference boundary. Choose the correct reference or edit the outline first. No drawings changed.',
    )
  const geometry = writer.write(result) as Area
  const nodes = rings(geometry).flat()
  return { reference: insertBoundaryNodes(nodedReference, nodes), geometry }
}
