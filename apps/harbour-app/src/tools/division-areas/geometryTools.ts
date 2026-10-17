import { alignBoundary, BoundaryAlignmentError } from './boundaryAlignment'
import { matchRoadChain } from './roadChainMatch'
import { adoptCurrentGeometryBaseline } from './geometryBaseline'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import ArrayList from 'jsts/java/util/ArrayList.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js'
import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree.js'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import Orientation from 'jsts/org/locationtech/jts/algorithm/Orientation.js'
import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js'
import type {
  FeatureCollection,
  LineString,
  MultiLineString,
  Polygon,
  MultiPolygon,
  Position,
} from 'geojson'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
type PolygonalGeometry = Polygon | MultiPolygon
type LandFeatureCollection = FeatureCollection<
  PolygonalGeometry,
  Record<string, unknown>
>
export type RoadFeatureCollection = FeatureCollection<
  LineString | MultiLineString,
  Record<string, unknown>
>
export type CleanupLevel = 3 | 4 | 5 | 6
export const TOWN_GEOMETRY_CLEANUP_VERSION = 'shared-topology-unsimplified-v1'
export const LEVEL_4_GEOMETRY_CLEANUP_VERSION = TOWN_GEOMETRY_CLEANUP_VERSION
export const TOWN_GEOMETRY_CLEANUP_SNAP_METRES = 5
export const TOWN_GEOMETRY_CLEANUP_COASTLINE_DETAIL_METRES = 0
export const TOWN_GEOMETRY_CLEANUP_ROAD_SNAP_METRES = 5
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function errorCoordinates(error: unknown): Position[] {
  if (error instanceof BoundaryAlignmentError && error.coordinate)
    return [error.coordinate]
  const coordinates: Position[] = [],
    seen = new Set<string>()
  const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?'
  const add = (x: string, y: string) => {
    const p = [Number(x), Number(y)],
      k = p.join(',')
    if (p.every(Number.isFinite) && !seen.has(k)) {
      seen.add(k)
      coordinates.push(p)
    }
  }
  const message = errorText(error)
  for (const match of message.matchAll(/LINESTRING\s*\(([^)]*)\)/gi)) {
    for (const pair of match[1]!.split(',')) {
      const values = pair.trim().match(new RegExp(`^(${numeric})\\s+(${numeric})`))
      if (values) add(values[1]!, values[2]!)
    }
  }
  if (!coordinates.length)
    for (const match of message.matchAll(
      new RegExp(`\\(\\s*(${numeric})\\s*,\\s*(${numeric})(?:\\s*,[^)]*)?\\)`, 'g'),
    ))
      add(match[1]!, match[2]!)
  return coordinates
}

export class GeometryCleanupError extends Error {
  readonly level: CleanupLevel
  readonly divisionId: string
  readonly coordinates: Position[]
  readonly contextLabel: string | null
  readonly category: string
  divisionName: string | null = null
  coordinateRole: 'failure' | 'source boundary' = 'failure'

  constructor(
    level: CleanupLevel,
    divisionId: string,
    cause: unknown,
    contextLabel: string | null = null,
  ) {
    super(errorText(cause), { cause })
    this.name = 'GeometryCleanupError'
    this.level = level
    this.divisionId = divisionId
    this.coordinates = errorCoordinates(cause)
    this.contextLabel = contextLabel
    this.category = contextLabel ?? 'shared boundary'
  }
}

// Geometry operations use full double precision. No rounding or repair buffers.
type Shape = ReturnType<GeoJSONReader['read']>
const reader = new GeoJSONReader(new GeometryFactory())
const writer = new GeoJSONWriter()
const equal = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
const key = (p: Position) => `${p[0]},${p[1]}`
function rings(g: PolygonalGeometry): Position[][] {
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(1)
}
function normalise(g: PolygonalGeometry): PolygonalGeometry {
  const ring = (input: Position[]) => {
    const output = input
      .filter((p, i) => !i || !equal(p, input[i - 1]!))
      .map(p => [...p])
    if (output.length && !equal(output[0]!, output.at(-1)!))
      output.push([...output[0]!])
    if (
      output.length < 4 ||
      output.some(p => p.length !== 2 || !p.every(Number.isFinite))
    )
      throw Error(
        `Invalid ring coordinates LINESTRING (${output
          .filter(p => p.every(Number.isFinite))
          .map(p => p.join(' '))
          .join(', ')})`,
      )
    return output
  }
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map(ring) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map(p => p.map(ring)) }
}
function union(items: Shape[]): Shape {
  if (!items.length) return new GeometryFactory().createPolygon()
  const list = new ArrayList([])
  items.forEach(g => {
    list.add(g)
  })
  return UnaryUnionOp.union(list)
}
const overlay = (a: Shape, b: Shape, op: number) => OverlayOp.overlayOp(a, b, op)
function polygonal(g: Shape): PolygonalGeometry {
  const parts: Polygon[] = []
  const visit = (part: Shape) => {
    if (part.isEmpty()) return
    if (part.getGeometryType() === 'Polygon') parts.push(writer.write(part) as Polygon)
    else if (['MultiPolygon', 'GeometryCollection'].includes(part.getGeometryType()))
      for (let i = 0; i < part.getNumGeometries(); i++) visit(part.getGeometryN(i))
  }
  visit(g)
  if (!parts.length) throw Error('No land polygon remains')
  return parts.length === 1
    ? parts[0]!
    : { type: 'MultiPolygon', coordinates: parts.map(p => p.coordinates) }
}
function valid(g: Shape) {
  const check = new IsValidOp(g)
  if (!check.isValid()) {
    const error = check.getValidationError(),
      p = error.getCoordinate()
    throw Error(`${error.getMessage()} (${p.x},${p.y})`)
  }
}
function fail(
  level: CleanupLevel,
  id: string,
  category: string,
  error: unknown,
  positions: Position[],
  coordinateRole: 'failure' | 'source boundary' = 'failure',
): never {
  const result = new GeometryCleanupError(level, id, error, category)
  result.coordinateRole = coordinateRole
  if (!result.coordinates.length) result.coordinates.push(...positions)
  throw result
}
export function mergePolygonPart(
  existing: PolygonalGeometry,
  part: Polygon,
): PolygonalGeometry {
  return polygonal(
    union([reader.read(normalise(existing)), reader.read(normalise(part))]),
  )
}

/** An explicit intended area is required to distinguish missing coverage from intentional holes. */
export function cleanEstimatedAreaGeometriesForLevel(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  land: LandFeatureCollection,
  level: CleanupLevel | null,
  roads?: RoadFeatureCollection,
  intendedArea?: PolygonalGeometry,
  selectedIds?: ReadonlySet<string>,
  snapCoast = false,
): {
  estimatedAreas: SaanseoiEstimatedAreas
  levelCount: number
  changedCount: number
  snappedCount: number
  addedNodeCount: number
} {
  const ids = new Set(
    inventory.divisions
      .filter(
        d =>
          (level === null || d.level === level) &&
          (!selectedIds || selectedIds.has(d.id)),
      )
      .map(d => d.id),
  )
  const features = estimatedAreas.features
    .filter(f => ids.has(f.properties.divisionId))
    .map(f => {
      if (!f.properties.geometrySimplification)
        return f.properties.geometryCleanup &&
          f.properties.geometryCleanup !== TOWN_GEOMETRY_CLEANUP_VERSION
          ? adoptCurrentGeometryBaseline(f)
          : f
      const source = f.properties.geometryUnsimplifiedSource as
        | PolygonalGeometry
        | undefined
      if (
        !source ||
        f.properties.geometrySimplificationResult !== JSON.stringify(f.geometry)
      )
        return adoptCurrentGeometryBaseline(f)
      const {
        geometrySimplification,
        geometrySimplificationResult,
        geometryUnsimplifiedSource,
        ...properties
      } = f.properties
      return { ...f, properties, geometry: source }
    })
    .sort((a, b) => a.properties.divisionId.localeCompare(b.properties.divisionId))
  if (!features.length)
    return {
      estimatedAreas,
      levelCount: 0,
      changedCount: 0,
      snappedCount: 0,
      addedNodeCount: 0,
    }
  const diagnosticLevel = level ?? 3
  let active = features[0]!
  let category = 'coastline clip'
  try {
    category = 'invalid ring'
    const inputs = features.map(f => {
      active = f
      const g = reader.read(normalise(f.geometry))
      valid(g)
      return g
    })
    if (level === null) {
      for (let i = 0; i < inputs.length; i++)
        for (let j = 0; j < i; j++)
          if (
            RelateOp.covers(inputs[i], inputs[j]) ||
            RelateOp.covers(inputs[j], inputs[i])
          )
            throw Error(
              'One selected division contains another. Use Align to an outline for containment; shared-boundary cleanup needs neighbouring divisions.',
            )
    }
    category = 'coastline clip'
    if (!land.features.length) throw Error('Coastline land data is empty')
    // Crop beyond the 5 m snap radius: artificial crop edges cannot attract a
    // target vertex. Retain the land interior (including holes), not just edges.
    const bounds = union(inputs).getEnvelopeInternal()
    bounds.expandBy(10 / 111320)
    const window = reader.read({
      type: 'Polygon',
      coordinates: [
        [
          [bounds.getMinX(), bounds.getMinY()],
          [bounds.getMaxX(), bounds.getMinY()],
          [bounds.getMaxX(), bounds.getMaxY()],
          [bounds.getMinX(), bounds.getMaxY()],
          [bounds.getMinX(), bounds.getMinY()],
        ],
      ],
    })
    const pieces: Shape[] = []
    for (const feature of land.features) {
      const shape = reader.read(normalise(feature.geometry))
      if (snapCoast && !bounds.intersects(shape.getEnvelopeInternal())) continue
      valid(shape)
      const piece = snapCoast ? overlay(shape, window, OverlayOp.INTERSECTION) : shape
      if (!piece.isEmpty() && piece.getArea() > 0) pieces.push(piece)
    }
    if (!pieces.length)
      throw Error('No coastline land intersects the selected division.')
    const landShape = union(pieces)
    valid(landShape)
    category = 'shared boundary'
    // A coast intersection may contain polygons plus isolated touching lines or
    // points. Coverage represents area, so normalise it before predicates/overlay.
    let intended = reader.read(
      polygonal(
        overlay(
          intendedArea ? reader.read(normalise(intendedArea)) : union(inputs),
          landShape,
          OverlayOp.INTERSECTION,
        ),
      ),
    )
    valid(intended)
    if (snapCoast && features.length === 1) {
      category = 'coastline snap'
      intended = reader.read(
        alignBoundary(polygonal(landShape), polygonal(intended), 'inside').geometry,
      )
      valid(intended)
    }
    let geometries: PolygonalGeometry[]
    if (features.length === 1 && !intendedArea) {
      // A single division only needs a land intersection. Do not route it through
      // shared-face ownership or neighbour topology repair.
      category = 'coastline clip'
      geometries = [polygonal(intended)]
    } else {
      // Node the complete source and land linework together before building faces.
      const graph = union([
        ...inputs.map(g => g.getBoundary()),
        landShape.getBoundary(),
        // Derived clip edges contain independently computed intersections. Re-noding
        // them alongside their source edges can create microscopic invalid rings.
        ...(intendedArea ? [reader.read(normalise(intendedArea)).getBoundary()] : []),
      ])
      const polygonizer = new Polygonizer()
      polygonizer.add(graph)
      const faces = polygonizer.getPolygons()
      const invalidRings = polygonizer.getInvalidRingLines()
      if (!invalidRings.isEmpty()) {
        const positions: Position[] = []
        for (const it = invalidRings.iterator(); it.hasNext(); )
          positions.push(...shapeCoordinates(it.next()))
        fail(
          diagnosticLevel,
          active.properties.divisionId,
          'shared boundary',
          'Invalid ring in noded boundary graph',
          positions,
        )
      }
      const owned: Shape[][] = features.map(() => [])
      for (const it = faces.iterator(); it.hasNext(); ) {
        const face = it.next()
        const point = face
          .getFactory()
          .createPoint(InteriorPointArea.getInteriorPoint(face))
        if (!RelateOp.covers(intended, point)) continue
        const owner = inputs.findIndex(g => RelateOp.covers(g, point))
        if (owner < 0)
          fail(
            diagnosticLevel,
            active.properties.divisionId,
            'shared boundary',
            'Unassigned intended coverage; supply an ownership decision for this gap',
            face.getCoordinates().map((p: { x: number; y: number }) => [p.x, p.y]),
          )
        owned[owner]!.push(face)
      }
      geometries = owned.map((parts, i) => {
        active = features[i]!
        if (!parts.length)
          fail(
            diagnosticLevel,
            active.properties.divisionId,
            RelateOp.intersects(inputs[i], landShape)
              ? 'shared boundary'
              : 'coastline clip',
            'No land face can be assigned to this division',
            rings(active.geometry).flat(),
            'source boundary',
          )
        return polygonal(union(parts))
      })
      // Reinsert every noded graph coordinate on output edges; polygon union may
      // otherwise omit collinear nodes used by the neighbouring face.
      const nodes: Position[] = graph
        .getCoordinates()
        .map((p: { x: number; y: number }) => [p.x, p.y])
      geometries = restoreNodes(geometries, nodes)
    }
    const before = structuredClone(geometries)
    category = 'street snap'
    if (roads && features.length > 1)
      geometries = snapSharedChains(geometries, roads, landShape)
    const validateCoverage = (values: PolygonalGeometry[]) => {
      const shapes = values.map((g, i) => {
        active = features[i]!
        const shape = reader.read(g)
        try {
          valid(shape)
        } catch (error) {
          fail(diagnosticLevel, active.properties.divisionId, 'invalid ring', error, [])
        }
        return shape
      })
      for (let i = 0; i < shapes.length; i++) {
        active = features[i]!
        const water = overlay(shapes[i], landShape, OverlayOp.DIFFERENCE)
        if (!water.isEmpty())
          fail(
            diagnosticLevel,
            active.properties.divisionId,
            'coastline clip',
            'Polygon extends into water',
            shapeCoordinates(water),
          )
        for (let j = 0; j < i; j++) {
          const overlap = overlay(shapes[i], shapes[j], OverlayOp.INTERSECTION)
          if (overlap.getArea() > 0)
            fail(
              diagnosticLevel,
              active.properties.divisionId,
              'shared boundary',
              `Interior overlap with ${features[j]!.properties.divisionId}`,
              shapeCoordinates(overlap),
            )
        }
      }
      const coverage = union(shapes)
      const difference = overlay(coverage, intended, OverlayOp.SYMDIFFERENCE)
      if (
        !difference.isEmpty() &&
        !isBoundaryRoundoff(difference, coverage, intended)
      ) {
        // Coverage is a group check; identify the closest source boundary instead
        // of blaming the final division visited by the validation loop.
        const closest = inputs
          .map((shape, index) => ({
            index,
            distance: DistanceOp.distance(shape.getBoundary(), difference),
          }))
          .sort((a, b) => a.distance - b.distance)[0]!
        fail(
          diagnosticLevel,
          features[closest.index]!.properties.divisionId,
          'shared boundary',
          'Coverage differs from intended land area',
          shapeCoordinates(difference),
        )
      }
      assertShared(values)
    }
    category = 'street snap'
    try {
      validateCoverage(geometries)
    } catch {
      geometries = before
    }
    category = 'shared boundary'
    validateCoverage(geometries)
    const cleaned = new Map(
      features.map((f, i) => [f.properties.divisionId, geometries[i]!]),
    )
    const next = {
      ...estimatedAreas,
      features: estimatedAreas.features.map(original => {
        const f =
          features.find(
            f => f.properties.divisionId === original.properties.divisionId,
          ) ?? original
        return cleaned.has(f.properties.divisionId)
          ? {
              ...f,
              geometry: cleaned.get(f.properties.divisionId)!,
              properties: {
                ...f.properties,
                ...(!f.properties.geometryCleanup &&
                !f.properties.geometryOriginalDrawing &&
                !f.properties.geometryWorkingBaseline
                  ? { geometryOriginalDrawing: structuredClone(f.geometry) }
                  : {}),
                geometryCleanupResult: JSON.stringify(
                  cleaned.get(f.properties.divisionId)!,
                ),
                geometryCleanup: TOWN_GEOMETRY_CLEANUP_VERSION,
                ...(level === null ? {} : { geometryCleanupLevel: level }),
                geometryCleanupRoadSnapMetres: roads && features.length > 1 ? 5 : 0,
                geometryCleanupCoastlineDetailMetres: 0,
              },
            }
          : f
      }),
    }
    return {
      estimatedAreas: next,
      snappedCount: geometries.filter(
        (g, i) => JSON.stringify(g) !== JSON.stringify(before[i]),
      ).length,
      addedNodeCount: geometries.reduce(
        (total, g, i) =>
          total + Math.max(0, rings(g).flat().length - rings(before[i]!).flat().length),
        0,
      ),
      levelCount: features.length,
      changedCount: estimatedAreas.features.filter(
        f =>
          ids.has(f.properties.divisionId) &&
          JSON.stringify(f) !==
            JSON.stringify(
              next.features.find(
                n => n.properties.divisionId === f.properties.divisionId,
              ),
            ),
      ).length,
    }
  } catch (error) {
    const diagnostic =
      error instanceof GeometryCleanupError
        ? error
        : new GeometryCleanupError(
            diagnosticLevel,
            active.properties.divisionId,
            error,
            category,
          )
    const division = inventory.divisions.find(d => d.id === diagnostic.divisionId)
    diagnostic.divisionName = division?.names.en ?? diagnostic.divisionId
    throw diagnostic
  }
}
function shapeCoordinates(shape: Shape): Position[] {
  return shape.getCoordinates().map((p: { x: number; y: number }) => [p.x, p.y])
}
function restoreNodes(values: PolygonalGeometry[], nodes: Position[]) {
  const tree = new STRtree()
  for (const p of new Map(nodes.map(p => [key(p), p])).values())
    tree.insert(new Envelope(p[0], p[0], p[1], p[1]), p)
  for (const g of values)
    for (const ring of rings(g)) {
      const output: Position[] = []
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!,
          b = ring[i]!,
          dx = b[0]! - a[0]!,
          dy = b[1]! - a[1]!
        const nearby = tree
          .query(
            new Envelope(
              Math.min(a[0]!, b[0]!),
              Math.max(a[0]!, b[0]!),
              Math.min(a[1]!, b[1]!),
              Math.max(a[1]!, b[1]!),
            ),
          )
          .toArray() as Position[]
        const candidates = nearby
          .map(p => ({
            p,
            t:
              Math.abs(dx) > Math.abs(dy) ? (p[0]! - a[0]!) / dx : (p[1]! - a[1]!) / dy,
          }))
          .filter(
            ({ p, t }) =>
              t > 0 &&
              t < 1 &&
              Orientation.index(
                new Coordinate(a[0], a[1]),
                new Coordinate(b[0], b[1]),
                new Coordinate(p[0], p[1]),
              ) === 0,
          )
          .sort((a, b) => a.t - b.t)
        output.push(a, ...candidates.map(c => c.p))
      }
      output.push(output[0]!)
      ring.splice(0, ring.length, ...output)
    }
  return values
}
function assertShared(values: PolygonalGeometry[]) {
  const edges = new Map<string, string[]>()
  for (const g of values)
    for (const ring of rings(g)) {
      const seen = new Set<string>()
      for (let i = 1; i < ring.length; i++) {
        const a = key(ring[i - 1]!),
          b = key(ring[i]!),
          edge = [a, b].sort().join('|')
        if (a === b || seen.has(edge))
          throw Error(`Duplicate or zero-length edge (${ring[i]!.join(',')})`)
        seen.add(edge)
        const uses = edges.get(edge) ?? []
        uses.push(`${a}|${b}`)
        edges.set(edge, uses)
        if (uses.length > 2 || (uses.length === 2 && uses[0] === uses[1]))
          throw Error(`Invalid shared edge (${ring[i]!.join(',')})`)
      }
    }
  // A vertex in another edge's interior means the shared coordinate sequences differ.
  const copy = restoreNodes(
    structuredClone(values),
    values.flatMap(g => rings(g).flat()),
  )
  if (JSON.stringify(copy) !== JSON.stringify(values))
    throw Error('Shared boundary has unmatched nodes')
}
function snapSharedChains(
  values: PolygonalGeometry[],
  roads: RoadFeatureCollection,
  land: Shape,
) {
  // Continuous centreline chain matching. Junctions and exterior nodes
  // stay fixed; all occurrences of an internal graph node move together.
  const adjacent = new Map<string, Set<string>>()
  const positions = new Map<string, Position>()
  const uses = new Map<string, number>()
  for (const g of values)
    for (const ring of rings(g))
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!,
          b = ring[i]!,
          ak = key(a),
          bk = key(b),
          ek = [ak, bk].sort().join('|')
        positions.set(ak, a)
        positions.set(bk, b)
        uses.set(ek, (uses.get(ek) ?? 0) + 1)
        for (const [x, y] of [
          [ak, bk],
          [bk, ak],
        ]) {
          const set = adjacent.get(x!) ?? new Set<string>()
          set.add(y!)
          adjacent.set(x!, set)
        }
      }
  const fixed = new Set<string>()
  for (const [a, neighbours] of adjacent)
    if (
      neighbours.size !== 2 ||
      [...neighbours].some(b => uses.get([a, b].sort().join('|')) !== 2)
    )
      fixed.add(a)
  const lines = roads.features.flatMap(f =>
    f.geometry.type === 'LineString'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates,
  )
  const visited = new Set<string>(),
    replacements = new Map<string, Position[]>()
  for (const start of fixed)
    for (const neighbour of adjacent.get(start) ?? []) {
      const chain = [start, neighbour]
      let previous = start,
        current = neighbour
      while (!fixed.has(current) && !visited.has(current)) {
        visited.add(current)
        const next = [...adjacent.get(current)!].find(n => n !== previous)!
        chain.push(next)
        previous = current
        current = next
      }
      if (
        chain.length < 2 ||
        !fixed.has(current) ||
        chain.some(
          (p, i) => i > 0 && uses.get([chain[i - 1]!, p].sort().join('|')) !== 2,
        )
      )
        continue
      const points = chain.map(k => positions.get(k)!)
      for (const line of lines) {
        const edges = matchRoadChain(points, line)
        if (!edges) continue
        const projected = edges.flatMap((edge, i) => (i ? edge.slice(1) : edge))
        if (
          !RelateOp.covers(
            land,
            reader.read({ type: 'LineString', coordinates: projected }),
          )
        )
          continue
        if (
          points.some((p, i) => {
            const next = i ? edges[i - 1]!.at(-1)! : edges[0]![0]!
            return (
              !equal(p, next) &&
              RelateOp.covers(
                land.getBoundary(),
                reader.read({ type: 'Point', coordinates: p }),
              )
            )
          })
        )
          continue
        edges.forEach((edge, i) => {
          replacements.set(`${chain[i]}|${chain[i + 1]}`, edge)
          replacements.set(`${chain[i + 1]}|${chain[i]}`, [...edge].reverse())
        })
        break
      }
    }
  for (const g of values)
    for (const ring of rings(g)) {
      const next: Position[] = []
      for (let i = 1; i < ring.length; i++) {
        const edge = replacements.get(`${key(ring[i - 1]!)}|${key(ring[i]!)}`) ?? [
          ring[i - 1]!,
          ring[i]!,
        ]
        next.push(...edge.slice(0, -1))
      }
      next.push([...next[0]!])
      ring.splice(0, ring.length, ...next)
    }
  return values
}
export function cleanTownEstimatedAreaGeometries(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  land: LandFeatureCollection,
) {
  const result = cleanEstimatedAreaGeometriesForLevel(
    estimatedAreas,
    inventory,
    land,
    3,
  )
  return {
    estimatedAreas: result.estimatedAreas,
    townCount: result.levelCount,
    changedCount: result.changedCount,
  }
}

export { suggestBuiltExtent } from './buildingExtentTools'

/** Validation for the separate later simplification operation. */
export function validateSharedCoverage(
  values: PolygonalGeometry[],
  source: PolygonalGeometry[],
) {
  const shapes = values.map(g => {
    const shape = reader.read(g)
    valid(shape)
    return shape
  })
  for (let i = 0; i < shapes.length; i++)
    for (let j = 0; j < i; j++)
      if (overlay(shapes[i], shapes[j], OverlayOp.INTERSECTION).getArea() > 0)
        throw Error('Simplification creates an interior overlap')
  const result = union(shapes),
    original = union(source.map(g => reader.read(g)))
  const difference = overlay(result, original, OverlayOp.SYMDIFFERENCE)
  if (!difference.isEmpty() && !isBoundaryRoundoff(difference, result, original))
    throw Error('Simplification changes the covered area')
  assertShared(values)
}

/** Comparison only: never round, buffer or modify a saved coordinate.
 * Eight coordinate-scale floating-point epsilons bound intersection residue.
 * Area alone is insufficient: every residue edge must lie on BOTH outlines.
 */
function isBoundaryRoundoff(difference: Shape, left: Shape, right: Shape): boolean {
  const points = shapeCoordinates(difference)
  if (!points.length) return true
  const scale = points.reduce(
    (scale, p) => Math.max(scale, Math.abs(p[0]!), Math.abs(p[1]!)),
    1,
  )
  const tolerance = 8 * Number.EPSILON * scale
  if (difference.getArea() > tolerance * difference.getLength()) return false
  const outlines = [left.getBoundary(), right.getBoundary()]
  const nearBoth = (p: Position) =>
    outlines.every(
      outline =>
        DistanceOp.distance(outline, reader.read({ type: 'Point', coordinates: p })) <=
        tolerance,
    )
  // Check each component separately so no invented edge joins separate rings.
  const visit = (shape: Shape): boolean => {
    if (shape.getGeometryType() === 'Polygon')
      return (
        visit(shape.getExteriorRing()) &&
        Array.from({ length: shape.getNumInteriorRing() }, (_, i) =>
          shape.getInteriorRingN(i),
        ).every(visit)
      )
    if (
      ['MultiPolygon', 'GeometryCollection', 'MultiLineString'].includes(
        shape.getGeometryType(),
      )
    )
      return Array.from({ length: shape.getNumGeometries() }, (_, i) =>
        shape.getGeometryN(i),
      ).every(visit)
    const coordinates = shapeCoordinates(shape)
    return coordinates.every(
      (p, i) =>
        nearBoth(p) &&
        (!i ||
          nearBoth([
            (coordinates[i - 1]![0]! + p[0]!) / 2,
            (coordinates[i - 1]![1]! + p[1]!) / 2,
          ])),
    )
  }
  return visit(difference)
}
