import type { MultiPolygon, Polygon, Position } from 'geojson'
import type {
  ReviewInventory,
  SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import {
  TOWN_GEOMETRY_CLEANUP_VERSION,
  validateSharedCoverage,
  type CleanupLevel,
} from './geometryTools'

const key = (p: Position) => `${p[0]},${p[1]}`
const rings = (g: Polygon | MultiPolygon) =>
  g.type === 'Polygon' ? g.coordinates : g.coordinates.flat(1)

/** Separate, explicit operation. Cleanup never imports or calls this module. */
export function simplifyCleanedGeometries(
  estimatedAreas: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  level: CleanupLevel,
  toleranceMetres: number,
  selectedIds?: ReadonlySet<string>,
): SaanseoiEstimatedAreas {
  if (!Number.isFinite(toleranceMetres) || toleranceMetres <= 0 || toleranceMetres > 5)
    throw Error('Choose a simplification tolerance greater than 0 and at most 5 metres')
  const ids = new Set(
    inventory.divisions
      .filter(d => d.level === level && (!selectedIds || selectedIds.has(d.id)))
      .map(d => d.id),
  )
  const features = estimatedAreas.features.filter(f => ids.has(f.properties.divisionId))
  if (!features.length)
    throw Error(
      `Select drawn L${level} divisions for simplification using the cleanup selection.`,
    )
  const needsCleanup = features.filter(
    f =>
      f.properties.geometryCleanup !== TOWN_GEOMETRY_CLEANUP_VERSION ||
      f.properties.geometrySimplification ||
      f.properties.geometryCleanupResult !== JSON.stringify(f.geometry),
  )
  if (needsCleanup.length) {
    const names = needsCleanup.map(f => {
      const division = inventory.divisions.find(d => d.id === f.properties.divisionId)
      return division?.names.en ?? f.properties.divisionId
    })
    throw Error(
      `Run topology cleanup for these selected L${level} divisions before simplification: ${names.join(', ')}`,
    )
  }
  const geometries = features.map(f => structuredClone(f.geometry))
  const neighbours = new Map<string, Set<string>>(),
    uses = new Map<string, number>(),
    positions = new Map<string, Position>()
  for (const g of geometries)
    for (const ring of rings(g))
      for (let i = 1; i < ring.length; i++) {
        const a = key(ring[i - 1]!),
          b = key(ring[i]!),
          edge = [a, b].sort().join('|')
        positions.set(a, ring[i - 1]!)
        positions.set(b, ring[i]!)
        uses.set(edge, (uses.get(edge) ?? 0) + 1)
        for (const [x, y] of [
          [a, b],
          [b, a],
        ]) {
          const set = neighbours.get(x!) ?? new Set<string>()
          set.add(y!)
          neighbours.set(x!, set)
        }
      }
  const fixed = new Set(
    [...neighbours]
      .filter(
        ([a, ns]) =>
          ns.size !== 2 || [...ns].some(b => uses.get([a, b].sort().join('|')) !== 2),
      )
      .map(([a]) => a),
  )
  // Preserve junctions used by drawings outside this operation.
  for (const feature of estimatedAreas.features.filter(
    f => !ids.has(f.properties.divisionId),
  ))
    for (const ring of rings(feature.geometry))
      for (const point of ring) if (positions.has(key(point))) fixed.add(key(point))
  const visited = new Set<string>(),
    removed = new Set<string>()
  for (const start of fixed)
    for (const neighbour of neighbours.get(start) ?? []) {
      if (visited.has(neighbour) || fixed.has(neighbour)) continue
      const chain = [start, neighbour]
      let previous = start,
        current = neighbour
      while (!fixed.has(current) && !visited.has(current)) {
        visited.add(current)
        const next = [...neighbours.get(current)!].find(n => n !== previous)!
        chain.push(next)
        previous = current
        current = next
      }
      if (!fixed.has(current)) continue
      const points = chain.map(k => positions.get(k)!)
      const keep = new Set([0, points.length - 1]),
        pending = [[0, points.length - 1]]
      while (pending.length) {
        const [start, end] = pending.pop()!,
          a = points[start!]!,
          b = points[end!]!,
          sx = 111320 * Math.cos((a[1]! * Math.PI) / 180),
          sy = 110574,
          dx = (b[0]! - a[0]!) * sx,
          dy = (b[1]! - a[1]!) * sy
        let furthest = -1,
          maximum = toleranceMetres
        for (let i = start! + 1; i < end!; i++) {
          const p = points[i]!,
            px = (p[0]! - a[0]!) * sx,
            py = (p[1]! - a[1]!) * sy,
            t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
          const distance = Math.hypot(px - t * dx, py - t * dy)
          if (distance > maximum) {
            furthest = i
            maximum = distance
          }
        }
        if (furthest >= 0) {
          keep.add(furthest)
          pending.push([start!, furthest], [furthest, end!])
        }
      }
      chain.forEach((node, i) => {
        if (!keep.has(i)) removed.add(node)
      })
    }
  for (const g of geometries)
    for (const ring of rings(g)) {
      const open = ring.slice(0, -1).filter(p => !removed.has(key(p)))
      if (open.length < 3) throw Error('Simplification would collapse a ring')
      ring.splice(0, ring.length, ...open, [...open[0]!])
    }
  validateSharedCoverage(
    geometries,
    features.map(f => f.geometry),
  )
  const updated = new Map(
    features.map((f, i) => [
      f.properties.divisionId,
      {
        ...f,
        geometry: geometries[i]!,
        properties: {
          ...f.properties,
          geometrySimplification: {
            toleranceMetres,
            method: 'shared-internal-chains-v1',
          },
          geometryUnsimplifiedSource: structuredClone(f.geometry),
          geometrySimplificationResult: JSON.stringify(geometries[i]!),
        },
      },
    ]),
  )
  return {
    ...estimatedAreas,
    features: estimatedAreas.features.map(
      f => updated.get(f.properties.divisionId) ?? f,
    ),
  }
}
