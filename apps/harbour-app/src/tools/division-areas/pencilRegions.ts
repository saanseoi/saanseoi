import { replacePencilBoundary } from './pencilBoundaryReplacement'
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js'
import SnapIfNeededOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapIfNeededOverlayOp.js'
import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree.js'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope.js'
import type { Position, Polygon, MultiPolygon, MultiLineString } from 'geojson'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import ArrayList from 'jsts/java/util/ArrayList.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

export type AreaGeometry = Polygon | MultiPolygon
export type PencilBoundary = { id: string; name: string; geometry: AreaGeometry }
const reader = new GeoJSONReader(new GeometryFactory()),
  writer = new GeoJSONWriter()
type Shape = ReturnType<typeof reader.read>
const union = (shapes: Shape[]) => {
  const list = new ArrayList([])
  for (const shape of shapes) list.add(shape)
  return UnaryUnionOp.union(list)
}
const rings = (g: AreaGeometry) =>
  g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
const coordinates = (shape: Shape): Position[] =>
  shape.getCoordinates().map((p: { x: number; y: number }) => [p.x, p.y])
function valid(shape: Shape) {
  const check = new IsValidOp(shape)
  if (!check.isValid())
    throw Error(`Invalid region: ${check.getValidationError().getMessage()}`)
}
/** Keep the engine's intersection coordinate identical on every incident edge. */
export function insertBoundaryNodes(
  geometry: AreaGeometry,
  nodes: Position[],
): AreaGeometry {
  const result = structuredClone(geometry)
  const existingNodes = new Set(
    rings(geometry)
      .flat()
      .map(p => p.join(',')),
  )
  const unique = [
    ...new Map(
      nodes.filter(p => !existingNodes.has(p.join(','))).map(p => [p.join(','), p]),
    ).values(),
  ]
  const tree = new STRtree()
  for (const p of unique) tree.insert(new Envelope(p[0], p[0], p[1], p[1]), p)
  let changed = false
  for (const ring of rings(result)) {
    const next: Position[] = []
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!,
        b = ring[i]!,
        dx = b[0]! - a[0]!,
        dy = b[1]! - a[1]!
      const length = dx * dx + dy * dy
      const nearby = tree
        .query(
          new Envelope(
            Math.min(a[0]!, b[0]!) - 1e-10,
            Math.max(a[0]!, b[0]!) + 1e-10,
            Math.min(a[1]!, b[1]!) - 1e-10,
            Math.max(a[1]!, b[1]!) + 1e-10,
          ),
        )
        .toArray() as Position[]
      const onEdge = nearby
        .map(p => ({ p, t: ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / length }))
        .filter(
          ({ p, t }) =>
            Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!) > 1e-10 &&
            Math.hypot(p[0]! - b[0]!, p[1]! - b[1]!) > 1e-10 &&
            t > 1e-12 &&
            t < 1 - 1e-12 &&
            Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy) < 1e-10,
        )
        .sort((a, b) => a.t - b.t)
      if (onEdge.length) changed = true
      next.push(a, ...onEdge.map(v => v.p))
    }
    next.push([...next[0]!])
    ring.splice(0, ring.length, ...next)
  }
  if (changed) valid(reader.read(result))
  return result
}
export function calculatePencilRegions(
  strokes: Position[][],
  boundaries: PencilBoundary[],
) {
  const usable = strokes.filter(s => s.length > 1)
  if (!usable.length) throw Error('Draw a line before reviewing regions.')
  const drawn = union(
    usable.map(coordinates => reader.read({ type: 'LineString', coordinates })),
  )
  const nearby = boundaries
    .map(b => reader.read(b.geometry))
    .filter(g => g.getEnvelopeInternal().intersects(drawn.getEnvelopeInternal()))
  const lines = union([drawn, ...nearby.map(g => g.getBoundary())])
  const nodes = coordinates(lines)
  const polygonizer = new Polygonizer()
  polygonizer.add(lines)
  const strokeEdges = new STRtree()
  for (const stroke of usable)
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1]!,
        b = stroke[i]!
      strokeEdges.insert(
        new Envelope(
          Math.min(a[0]!, b[0]!) - 1e-10,
          Math.max(a[0]!, b[0]!) + 1e-10,
          Math.min(a[1]!, b[1]!) - 1e-10,
          Math.max(a[1]!, b[1]!) + 1e-10,
        ),
        [a, b],
      )
    }
  const touchesStroke = (face: Polygon) =>
    rings(face).some(ring =>
      ring.slice(1).some((b, i) => {
        const a = ring[i]!,
          p = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2]
        const edges = strokeEdges
          .query(new Envelope(p[0], p[0], p[1], p[1]))
          .toArray() as Position[][]
        return edges.some(([from, to]) => {
          const dx = to![0]! - from![0]!,
            dy = to![1]! - from![1]!,
            length = dx * dx + dy * dy
          const t = ((p[0]! - from![0]!) * dx + (p[1]! - from![1]!) * dy) / length
          return (
            t >= 0 &&
            t <= 1 &&
            Math.hypot(p[0]! - from![0]! - t * dx, p[1]! - from![1]! - t * dy) < 1e-10
          )
        })
      }),
    )
  const iterator = polygonizer.getPolygons().iterator()
  const regions: Polygon[] = []
  while (iterator.hasNext()) {
    const face = iterator.next()
    valid(face)
    // Do not offer unrelated pre-existing polygons elsewhere on the map.
    const geometry = writer.write(face) as Polygon
    if (!touchesStroke(geometry)) continue
    // Polygonizer already retains the noded edge coordinates. Re-overlaying these
    // against the original strokes introduces floating-point slivers.
    regions.push(geometry)
  }
  const noded = writer.write(lines) as
    | MultiLineString
    | { type: 'LineString'; coordinates: Position[] }
  const neighbours = new Map<string, Set<string>>()
  for (const line of noded.type === 'LineString'
    ? [noded.coordinates]
    : noded.coordinates)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!.join(','),
        b = line[i]!.join(',')
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const set = neighbours.get(from!) ?? new Set<string>()
        set.add(to!)
        neighbours.set(from!, set)
      }
    }
  const intersections = [
    ...new Map(
      nodes
        .filter(p => (neighbours.get(p.join(','))?.size ?? 0) > 2)
        .map(p => [p.join(','), p]),
    ).values(),
  ]
  return {
    regions,
    intersections,
    nodes: [...new Map(nodes.map(p => [p.join(','), p])).values()],
    lines: noded,
  }
}
export function commitPencilRegions(
  regions: Polygon[],
  boundaries: PencilBoundary[],
  selectedId: string,
) {
  if (!regions.length) throw Error('Choose at least one region to save.')
  const shape = union(regions.map(g => reader.read(g)))
  valid(shape)
  const nearby = boundaries.filter(
    b =>
      b.id !== selectedId &&
      reader
        .read(b.geometry)
        .getEnvelopeInternal()
        .intersects(shape.getEnvelopeInternal()),
  )
  const overlaps: Array<{ id: string; name: string }> = []
  for (const boundary of nearby) {
    const overlap = SnapIfNeededOverlayOp.overlayOp(
      shape,
      reader.read(boundary.geometry),
      OverlayOp.INTERSECTION,
    )
    if (overlap.getArea() > 1e-16)
      overlaps.push({ id: boundary.id, name: boundary.name })
  }
  const outline = shape.getBoundary()
  const network = union([
    outline,
    ...nearby.map(b => reader.read(b.geometry).getBoundary()),
  ])
  const nodes = coordinates(network).filter(
    p =>
      outline.getEnvelopeInternal().contains(p[0], p[1]) &&
      DistanceOp.distance(outline, reader.read({ type: 'Point', coordinates: p })) <
        1e-10,
  )
  const geometry = insertBoundaryNodes(writer.write(shape) as AreaGeometry, nodes)
  const nearbyIds = new Set(nearby.map(b => b.id))
  const updated = boundaries
    .filter(b => b.id !== selectedId)
    .map(b =>
      nearbyIds.has(b.id)
        ? { ...b, geometry: insertBoundaryNodes(b.geometry, nodes) }
        : b,
    )
  return { geometry, boundaries: updated, overlaps }
}

/** Add the outside lobe bounded by a stroke and two contacts with the current outline. */
export function expandPencilStroke(original: AreaGeometry, stroke: Position[]) {
  if (stroke.length < 2) return { intersections: [] as Position[], geometry: null }
  const source = reader.read(original)
  valid(source)
  const line = reader.read({ type: 'LineString', coordinates: stroke })
  const outline = source.getBoundary()
  const contacts = SnapIfNeededOverlayOp.overlayOp(
    outline,
    line,
    OverlayOp.INTERSECTION,
  )
  // Road-snapped strokes may share existing edges. Their coordinates are valid
  // contacts too; replacement and area validation decide whether they close a lobe.
  const intersections = [
    ...new Map(coordinates(contacts).map(p => [p.join(','), p])).values(),
  ]
  if (intersections.length < 2) return { intersections, geometry: null }
  const { regions } = calculatePencilRegions(
    [stroke],
    [{ id: 'original', name: 'Original drawing', geometry: original }],
  )
  const adjacent = regions.filter(region =>
    rings(region).some(ring =>
      ring.slice(1).some((b, i) => {
        const a = ring[i]!,
          midpoint = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2]
        return (
          DistanceOp.distance(
            outline,
            reader.read({ type: 'Point', coordinates: midpoint }),
          ) < 1e-10
        )
      }),
    ),
  )
  const replacement = replacePencilBoundary(original, stroke, intersections)
  const expanded = replacement
    ? reader.read(replacement)
    : union([source, ...adjacent.map(g => reader.read(g))])
  valid(expanded)
  if (expanded.getArea() <= source.getArea() + 1e-16)
    return { intersections, geometry: null }
  // The union already contains the intersections from the noded linework.
  // Keep those exact coordinates instead of inserting independently rounded contacts.
  const outputNodes = coordinates(expanded)
  const sharedIntersections = intersections.map(
    p => outputNodes.find(q => Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!) < 1e-9) ?? p,
  )
  return {
    intersections: sharedIntersections,
    geometry: writer.write(expanded) as AreaGeometry,
  }
}

/** Reuse topology for unchanged geometry; only pairs touching an edit need overlays. */
export function createSameLevelOverlapWarnings() {
  let shapes = new Map<string, { signature: string; shape: any; revision: number }>()
  let pairs = new Map<string, boolean>()
  let revision = 0
  return (boundaries: Array<PencilBoundary & { level: number | null }>) => {
    const next = new Map<string, { signature: string; shape: any; revision: number }>()
    for (const boundary of boundaries) {
      const signature = JSON.stringify(boundary.geometry)
      const old = shapes.get(boundary.id)
      next.set(
        boundary.id,
        old?.signature === signature
          ? old
          : {
              signature,
              shape: reader.read(boundary.geometry),
              revision: ++revision,
            },
      )
    }
    const warnings = new Map<string, string[]>()
    const nextPairs = new Map<string, boolean>()
    for (let i = 0; i < boundaries.length; i++)
      for (let j = 0; j < i; j++) {
        const a = boundaries[i]!,
          b = boundaries[j]!
        if (a.level === null || a.level !== b.level) continue
        const left = next.get(a.id)!,
          right = next.get(b.id)!
        if (
          !left.shape
            .getEnvelopeInternal()
            .intersects(right.shape.getEnvelopeInternal())
        )
          continue
        const key = [left.revision, right.revision].sort((a, b) => a - b).join(':')
        const overlap =
          pairs.get(key) ??
          SnapIfNeededOverlayOp.overlayOp(
            left.shape,
            right.shape,
            OverlayOp.INTERSECTION,
          ).getArea() > 1e-16
        nextPairs.set(key, overlap)
        if (!overlap) continue
        warnings.set(a.id, [...(warnings.get(a.id) ?? []), b.name])
        warnings.set(b.id, [...(warnings.get(b.id) ?? []), a.name])
      }
    shapes = next
    pairs = nextPairs
    return warnings
  }
}

export const sameLevelOverlapWarnings = createSameLevelOverlapWarnings()
