import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree.js'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import LineSegment from 'jsts/org/locationtech/jts/geom/LineSegment.js'
import LineStringSnapper from 'jsts/org/locationtech/jts/operation/overlay/snap/LineStringSnapper.js'
import type { Polygon, MultiPolygon, Position } from 'geojson'

type Area = Polygon | MultiPolygon
const rings = (area: Area) =>
  area.type === 'Polygon' ? area.coordinates : area.coordinates.flat()

/** Exact matches must win over nearby vertices on detailed coastal rings. */
export function snapBoundaryVertices(
  target: Area,
  reference: Area,
  tolerance: number,
  originalReference: Area = reference,
): Area {
  const tree = new STRtree()
  const points = [
    ...new Map(
      rings(reference)
        .flat()
        .map(p => [p.join(','), new Coordinate(p[0], p[1])]),
    ).values(),
  ]
  for (const p of points) tree.insert(new Envelope(p), p)
  const segments = boundarySegmentIndex(reference)
  const onReference = (p: Coordinate) =>
    segments([p.x, p.y], 1e-10).some(
      ({ a, b }) =>
        new LineSegment(
          new Coordinate(a[0], a[1]),
          new Coordinate(b[0], b[1]),
        ).distance(p) <= 1e-10,
    )
  const originalTree = new STRtree()
  for (const p of rings(originalReference).flat()) {
    const coordinate = new Coordinate(p[0], p[1])
    originalTree.insert(new Envelope(coordinate), coordinate)
  }
  class NearestSnapper extends LineStringSnapper {
    findSnapForVertex(p: Coordinate) {
      const window = new Envelope(p)
      window.expandBy(tolerance)
      // Prefer real reference corners; projected nodes supply straight-edge contacts.
      for (const index of [originalTree, tree]) {
        let nearest: Coordinate | null = null,
          distance = tolerance
        for (const candidate of index.query(window).toArray() as Coordinate[]) {
          const d = p.distance(candidate)
          if (d === 0) return null
          if (d < distance) {
            nearest = candidate
            distance = d
          }
        }
        if (nearest) return nearest
      }
      return null
    }
    findSegmentIndexToSnap(p: Coordinate, coords: any) {
      let best = -1,
        distance = tolerance
      for (let i = 0; i < coords.size() - 1; i++) {
        const a = coords.get(i),
          b = coords.get(i + 1)
        if (a.equals2D(p) || b.equals2D(p)) return -1
        const segment = new LineSegment(a, b),
          d = segment.distance(p)
        if (d >= distance) continue
        if (
          onReference(a) &&
          onReference(b) &&
          onReference(new Coordinate((a.x + b.x) / 2, (a.y + b.y) / 2))
        )
          continue
        distance = d
        best = i
      }
      return best
    }
    snapSegments(coords: any, candidates: Coordinate[]) {
      const existing = new Set(
        coords.toCoordinateArray().map((p: Coordinate) => `${p.x},${p.y}`),
      )
      return super.snapSegments(
        coords,
        candidates.filter(p => !existing.has(`${p.x},${p.y}`)),
      )
    }
  }
  const snapRing = (ring: Position[]) => {
    const coordinates = ring.map(p => new Coordinate(p[0], p[1]))
    const bounds = new Envelope()
    for (const p of coordinates) bounds.expandToInclude(p)
    bounds.expandBy(tolerance)
    return new NearestSnapper(coordinates, tolerance)
      .snapTo(tree.query(bounds).toArray())
      .map((p: Coordinate) => [p.x, p.y])
  }
  return target.type === 'Polygon'
    ? { type: 'Polygon', coordinates: target.coordinates.map(snapRing) }
    : {
        type: 'MultiPolygon',
        coordinates: target.coordinates.map(p => p.map(snapRing)),
      }
}

export function boundarySegmentIndex(reference: Area) {
  const tree = new STRtree()
  for (const ring of rings(reference))
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!,
        b = ring[i]!
      tree.insert(new Envelope(a[0], b[0], a[1], b[1]), { a, b })
    }
  return (p: Position, tolerance: number) => {
    const bounds = new Envelope(p[0], p[0], p[1], p[1])
    bounds.expandBy(tolerance)
    return tree.query(bounds).toArray() as { a: Position; b: Position }[]
  }
}
