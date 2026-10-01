import type { Position } from 'geojson'
import type { RoadFeatureCollection } from './geometryTools'
type StreetNode = { position: [number, number]; edges: Map<string, number> }
type StreetSegment = {
  aId: string
  bId: string
  a: [number, number]
  b: [number, number]
}
export type StreetGraph = {
  nodes: Map<string, StreetNode>
  segments: StreetSegment[]
  cells: Map<string, StreetSegment[]>
}
export type StreetSnap = { segment: StreetSegment; position: [number, number] }
export const STREET_SELECTION_TOLERANCE_METRES = 30
const STREET_INDEX_CELL_DEGREES = 0.005
function streetCell(x: number, y: number) {
  return `${Math.floor(x / STREET_INDEX_CELL_DEGREES)}:${Math.floor(y / STREET_INDEX_CELL_DEGREES)}`
}
function streetNodeKey(position: Position) {
  return `${position[0]!.toFixed(7)},${position[1]!.toFixed(7)}`
}
export function streetDistance(a: Position, b: Position) {
  const latitude = (((a[1]! + b[1]!) / 2) * Math.PI) / 180
  const metresPerDegreeX = 111_320 * Math.cos(latitude)
  const metresPerDegreeY = 110_574
  return Math.hypot(
    (b[0]! - a[0]!) * metresPerDegreeX,
    (b[1]! - a[1]!) * metresPerDegreeY,
  )
}
function addStreetEdge(
  nodes: Map<string, StreetNode>,
  aId: string,
  bId: string,
  weight: number,
) {
  if (aId === bId) return
  const a = nodes.get(aId)!
  const b = nodes.get(bId)!
  a.edges.set(bId, Math.min(a.edges.get(bId) ?? Number.POSITIVE_INFINITY, weight))
  b.edges.set(aId, Math.min(b.edges.get(aId) ?? Number.POSITIVE_INFINITY, weight))
}
export function buildStreetGraph(roads: RoadFeatureCollection): StreetGraph {
  const nodes = new Map<string, StreetNode>()
  const segments: StreetSegment[] = []
  const cells = new Map<string, StreetSegment[]>()
  const getNode = (position: Position) => {
    const point: [number, number] = [position[0]!, position[1]!]
    const id = streetNodeKey(point)
    if (!nodes.has(id)) nodes.set(id, { position: point, edges: new Map() })
    return id
  }
  const addLine = (coordinates: Position[]) => {
    for (let index = 1; index < coordinates.length; index += 1) {
      const a = coordinates[index - 1]!
      const b = coordinates[index]!
      if (
        typeof a[0] !== 'number' ||
        typeof a[1] !== 'number' ||
        typeof b[0] !== 'number' ||
        typeof b[1] !== 'number'
      )
        continue
      const aId = getNode(a)
      const bId = getNode(b)
      const segment: StreetSegment = {
        aId,
        bId,
        a: nodes.get(aId)!.position,
        b: nodes.get(bId)!.position,
      }
      segments.push(segment)
      addStreetEdge(nodes, aId, bId, streetDistance(segment.a, segment.b))
      const minX = Math.floor(
        Math.min(segment.a[0], segment.b[0]) / STREET_INDEX_CELL_DEGREES,
      )
      const maxX = Math.floor(
        Math.max(segment.a[0], segment.b[0]) / STREET_INDEX_CELL_DEGREES,
      )
      const minY = Math.floor(
        Math.min(segment.a[1], segment.b[1]) / STREET_INDEX_CELL_DEGREES,
      )
      const maxY = Math.floor(
        Math.max(segment.a[1], segment.b[1]) / STREET_INDEX_CELL_DEGREES,
      )
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const key = streetCell(
            x * STREET_INDEX_CELL_DEGREES,
            y * STREET_INDEX_CELL_DEGREES,
          )
          const bucket = cells.get(key)
          if (bucket) bucket.push(segment)
          else cells.set(key, [segment])
        }
      }
    }
  }
  for (const feature of roads.features) {
    if (feature.geometry.type === 'LineString') addLine(feature.geometry.coordinates)
    else if (feature.geometry.type === 'MultiLineString')
      feature.geometry.coordinates.forEach(addLine)
  }
  return { nodes, segments, cells }
}
function projectToStreet(position: Position, segment: StreetSegment): StreetSnap {
  const latitude = (position[1]! * Math.PI) / 180
  const metresPerDegreeX = 111_320 * Math.cos(latitude)
  const metresPerDegreeY = 110_574
  const ax = (segment.a[0] - position[0]!) * metresPerDegreeX
  const ay = (segment.a[1] - position[1]!) * metresPerDegreeY
  const bx = (segment.b[0] - position[0]!) * metresPerDegreeX
  const by = (segment.b[1] - position[1]!) * metresPerDegreeY
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  return {
    segment,
    position: [
      segment.a[0] + (segment.b[0] - segment.a[0]) * t,
      segment.a[1] + (segment.b[1] - segment.a[1]) * t,
    ],
  }
}
function nearestStreetSegment(
  position: Position,
  graph: StreetGraph,
): StreetSnap | null {
  const cellX = Math.floor(position[0]! / STREET_INDEX_CELL_DEGREES)
  const cellY = Math.floor(position[1]! / STREET_INDEX_CELL_DEGREES)
  const candidates = new Set<StreetSegment>()
  for (let x = cellX - 1; x <= cellX + 1; x += 1) {
    for (let y = cellY - 1; y <= cellY + 1; y += 1) {
      for (const segment of graph.cells.get(
        streetCell(x * STREET_INDEX_CELL_DEGREES, y * STREET_INDEX_CELL_DEGREES),
      ) ?? [])
        candidates.add(segment)
    }
  }
  const source = candidates.size ? candidates : new Set(graph.segments)
  let nearest: { snap: StreetSnap; distance: number } | null = null
  for (const segment of source) {
    const snap = projectToStreet(position, segment)
    const distance = streetDistance(position, snap.position)
    if (!nearest || distance < nearest.distance) nearest = { snap, distance }
  }
  return nearest?.snap ?? null
}
export function nearestStreetSelection(position: Position, graph: StreetGraph) {
  const snap = nearestStreetSegment(position, graph)
  return snap &&
    streetDistance(position, snap.position) <= STREET_SELECTION_TOLERANCE_METRES
    ? snap
    : null
}
function addTemporaryStreetEdge(
  edges: Map<string, Map<string, number>>,
  a: string,
  b: string,
  weight: number,
) {
  const add = (from: string, to: string) => {
    const neighbours = edges.get(from)
    if (neighbours)
      neighbours.set(
        to,
        Math.min(neighbours.get(to) ?? Number.POSITIVE_INFINITY, weight),
      )
    else edges.set(from, new Map([[to, weight]]))
  }
  add(a, b)
  add(b, a)
}
export function shortestStreetRoute(
  graph: StreetGraph,
  start: Position,
  end: Position,
): Position[] | null {
  const startSnap = nearestStreetSegment(start, graph)
  const endSnap = nearestStreetSegment(end, graph)
  if (!startSnap || !endSnap) return null
  const startId = '__route_start__'
  const endId = '__route_end__'
  const temporary = new Map<string, Map<string, number>>()
  const connect = (routeId: string, snap: StreetSnap) => {
    addTemporaryStreetEdge(
      temporary,
      routeId,
      snap.segment.aId,
      streetDistance(snap.position, snap.segment.a),
    )
    addTemporaryStreetEdge(
      temporary,
      routeId,
      snap.segment.bId,
      streetDistance(snap.position, snap.segment.b),
    )
  }
  connect(startId, startSnap)
  connect(endId, endSnap)
  if (startSnap.segment === endSnap.segment)
    addTemporaryStreetEdge(
      temporary,
      startId,
      endId,
      streetDistance(startSnap.position, endSnap.position),
    )
  const distances = new Map([[startId, 0]])
  const previous = new Map<string, string>()
  const queue: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }]
  const pushQueue = (entry: { id: string; distance: number }) => {
    queue.push(entry)
    let index = queue.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (queue[parent]!.distance <= queue[index]!.distance) break
      ;[queue[parent], queue[index]] = [queue[index]!, queue[parent]!]
      index = parent
    }
  }
  const popQueue = () => {
    const first = queue[0]!
    const last = queue.pop()!
    if (queue.length && last !== first) {
      queue[0] = last
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < queue.length && queue[left]!.distance < queue[smallest]!.distance)
          smallest = left
        if (right < queue.length && queue[right]!.distance < queue[smallest]!.distance)
          smallest = right
        if (smallest === index) break
        ;[queue[index], queue[smallest]] = [queue[smallest]!, queue[index]!]
        index = smallest
      }
    }
    return first
  }
  const neighbours = (id: string) => {
    const output = new Map<string, number>(graph.nodes.get(id)?.edges ?? [])
    for (const [neighbour, weight] of temporary.get(id) ?? [])
      output.set(
        neighbour,
        Math.min(output.get(neighbour) ?? Number.POSITIVE_INFINITY, weight),
      )
    return output
  }
  while (queue.length) {
    const current = popQueue()
    if (current.distance !== distances.get(current.id)) continue
    if (current.id === endId) break
    for (const [next, weight] of neighbours(current.id)) {
      const distance = current.distance + weight
      if (distance >= (distances.get(next) ?? Number.POSITIVE_INFINITY)) continue
      distances.set(next, distance)
      previous.set(next, current.id)
      pushQueue({ id: next, distance })
    }
  }
  if (!distances.has(endId)) return null
  const ids = [endId]
  while (ids[0] !== startId) ids.unshift(previous.get(ids[0]!)!)
  const positions = ids.map(id =>
    id === startId
      ? startSnap.position
      : id === endId
        ? endSnap.position
        : graph.nodes.get(id)!.position,
  )
  return positions.filter(
    (position, index) =>
      index === 0 || streetDistance(position, positions[index - 1]!) > 0.01,
  )
}
