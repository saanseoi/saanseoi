import type { Position, Polygon, MultiPolygon } from 'geojson'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import SnapIfNeededOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapIfNeededOverlayOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js'

const reader = new GeoJSONReader(new GeometryFactory()),
  writer = new GeoJSONWriter()
function locate(line: Position[], p: Position) {
  let best = { at: 0, distance: Infinity }
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!,
      b = line[i]!,
      dx = b[0]! - a[0]!,
      dy = b[1]! - a[1]!
    const t = Math.max(
      0,
      Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / (dx * dx + dy * dy)),
    )
    const distance = Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy)
    if (distance < best.distance) best = { at: i - 1 + t, distance }
  }
  return best
}
function section(
  line: Position[],
  a: Position,
  b: Position,
  start: number,
  end: number,
) {
  return [a, ...line.filter((_, i) => i > start && i < end), b]
}
// Rebuild crossing rings from their noded edges, preserving the drawn road route.
// Each face is a simple candidate: point-attached loops are not added as islands.
function simpleFaces(coordinates: Position[]) {
  const shape = reader.read({ type: 'Polygon', coordinates: [coordinates] })
  if (new IsValidOp(shape).isValid()) return [shape]
  const line = reader.read({ type: 'LineString', coordinates })
  const polygonizer = new Polygonizer()
  polygonizer.add(UnaryUnionOp.union(line))
  const faces: Array<ReturnType<typeof reader.read>> = []
  const iterator = polygonizer.getPolygons().iterator()
  while (iterator.hasNext()) {
    const face = iterator.next()
    if (!face.isEmpty() && new IsValidOp(face).isValid()) faces.push(face)
  }
  return faces
}
/** Replace the contacted shell arc; choose the valid side retaining most original area. */
export function replacePencilBoundary(
  original: Polygon | MultiPolygon,
  stroke: Position[],
  contacts: Position[],
) {
  const ordered = contacts
    .map(p => ({ p, ...locate(stroke, p) }))
    .sort((a, b) => a.at - b.at)
  const first = ordered[0]!,
    last = ordered.at(-1)!
  const path = section(stroke, first.p, last.p, first.at, last.at)
  const parts =
    original.type === 'Polygon' ? [original.coordinates] : original.coordinates
  const matching = parts
    .map((rings, index) => ({
      rings,
      index,
      a: locate(rings[0]!, first.p),
      b: locate(rings[0]!, last.p),
    }))
    .filter(p => p.a.distance < 1e-9 && p.b.distance < 1e-9)
  if (matching.length !== 1) return null
  const { rings, index, a, b } = matching[0]!
  const ring = rings[0]!
  const low = a.at < b.at ? { p: first.p, at: a.at } : { p: last.p, at: b.at }
  const high = a.at < b.at ? { p: last.p, at: b.at } : { p: first.p, at: a.at }
  const forward = section(ring, low.p, high.p, low.at, high.at)
  const backward = [
    high.p,
    ...ring.filter((_, i) => i > high.at && i < ring.length - 1),
    ...ring.filter((_, i) => i < low.at),
    low.p,
  ]
  const lowToHighPath = a.at < b.at ? path : [...path].reverse()
  const candidates = [
    [...forward, ...[...lowToHighPath].reverse().slice(1)],
    [...backward, ...lowToHighPath.slice(1)],
  ]
  const source = reader.read({ type: 'Polygon', coordinates: rings })
  const ranked: Array<{ geometry: Polygon | MultiPolygon; retained: number }> = []
  for (const coordinates of candidates) {
    // Duplicate consecutive contacts can occur at an existing ring vertex.
    const clean = coordinates.filter(
      (p, i) =>
        i === 0 || p[0] !== coordinates[i - 1]![0] || p[1] !== coordinates[i - 1]![1],
    )
    if (clean.length < 4) continue
    for (let shape of simpleFaces(clean)) {
      for (const hole of rings.slice(1))
        shape = SnapIfNeededOverlayOp.overlayOp(
          shape,
          reader.read({ type: 'Polygon', coordinates: [hole] }),
          OverlayOp.DIFFERENCE,
        )
      if (shape.isEmpty() || !new IsValidOp(shape).isValid()) continue
      const retained = SnapIfNeededOverlayOp.overlayOp(
        shape,
        source,
        OverlayOp.INTERSECTION,
      ).getArea()
      ranked.push({ geometry: writer.write(shape) as Polygon | MultiPolygon, retained })
    }
  }
  ranked.sort((a, b) => b.retained - a.retained)
  if (!ranked.length)
    throw Error(
      'The crossings could not form a valid replacement boundary. Undo the last segment and adjust the stroke.',
    )
  const chosen = ranked[0]!.geometry
  const remaining = parts.filter((_, i) => i !== index)
  const output = [
    ...remaining,
    ...(chosen.type === 'Polygon' ? [chosen.coordinates] : chosen.coordinates),
  ]
  return output.length === 1
    ? { type: 'Polygon' as const, coordinates: output[0]! }
    : { type: 'MultiPolygon' as const, coordinates: output }
}
