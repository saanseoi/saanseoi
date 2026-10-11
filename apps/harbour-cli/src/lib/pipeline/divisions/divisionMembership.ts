import { createHash } from 'node:crypto'
import type { DivisionHierarchies } from '@repo/db'

export const divisionFields = {
  country: 'countryId',
  area: 'areaId',
  district: 'districtId',
  town: 'townId',
  rural_area: 'ruralAreaId',
  macrohood: 'macrohoodId',
  neighbourhood: 'neighbourhoodId',
  village: 'villageId',
  microhood: 'microhoodId',
  hamlet: 'hamletId',
  major_island: 'landformId',
  minor_island: 'landformId',
  islet: 'landformId',
} as const
export type DivisionField = (typeof divisionFields)[keyof typeof divisionFields]
export type DivisionReferences = Partial<Record<DivisionField, string | null>>
export type MembershipDivision = {
  id: string
  class: string
  hierarchies?: DivisionHierarchies | string | null
  locale?: string
  name?: string | null
}
export type MembershipArea = { divisionId: string; geometry: unknown }
type Polygon = number[][][]
type Geometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: Polygon[] }
type Evidence = {
  divisionId: string
  method: 'geometry' | 'text' | 'address' | 'ancestry'
}
const fieldFor = (kind: string) => divisionFields[kind as keyof typeof divisionFields]
const normalise = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

// Return boundary separately: shared edges must not arbitrarily choose a neighbour.
function ringContains(ring: number[][], x: number, y: number): 0 | 1 | 2 {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]!,
      [bx, by] = ring[i]!
    if (ax === undefined || ay === undefined || bx === undefined || by === undefined)
      continue
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (
      Math.abs(cross) <= 1e-12 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return 2
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside
  }
  return inside ? 1 : 0
}
function contains(polygon: Polygon, x: number, y: number) {
  if (!polygon[0]) return false
  const outer = ringContains(polygon[0], x, y)
  if (!outer) return false
  for (const hole of polygon.slice(1)) {
    const hit = ringContains(hole, x, y)
    if (hit === 1) return false
    if (hit === 2) return true
  }
  return true
}

/** Immutable spatial and bilingual name index shared by ALS and Places preparation. */
export function createDivisionMembership(
  divisions: MembershipDivision[],
  areas: MembershipArea[],
) {
  const byId = new Map(divisions.map(row => [row.id, row]))
  const paths = new Map(
    [...byId].map(([id, row]) => {
      const hierarchy =
        typeof row.hierarchies === 'string'
          ? (JSON.parse(row.hierarchies) as DivisionHierarchies)
          : row.hierarchies
      return [id, hierarchy?.full ?? []] as const
    }),
  )
  const ancestors = (id: string) => paths.get(id) ?? []
  const geometries = new Set<string>()
  const cells = new Map<
    string,
    Array<{ id: string; polygon: Polygon; bounds: number[] }>
  >()
  for (const area of areas) {
    if (
      !byId.has(area.divisionId) ||
      !fieldFor(byId.get(area.divisionId)!.class) ||
      byId.get(area.divisionId)!.class === 'country'
    )
      continue
    const geometry = (
      typeof area.geometry === 'string' ? JSON.parse(area.geometry) : area.geometry
    ) as Geometry | null
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) continue
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    for (const polygon of polygons) {
      if (!polygon[0]?.length) continue
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
      for (const [x, y] of polygon[0]) {
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new Error(`Invalid division polygon ${area.divisionId}`)
        minX = Math.min(minX, x!)
        minY = Math.min(minY, y!)
        maxX = Math.max(maxX, x!)
        maxY = Math.max(maxY, y!)
      }
      const item = { id: area.divisionId, polygon, bounds: [minX, minY, maxX, maxY] }
      geometries.add(area.divisionId)
      // Grid limits expensive ring tests to nearby polygons without changing coordinates.
      for (let x = Math.floor(minX * 20); x <= Math.floor(maxX * 20); x++)
        for (let y = Math.floor(minY * 20); y <= Math.floor(maxY * 20); y++) {
          const key = `${x},${y}`
          const bucket = cells.get(key) ?? []
          bucket.push(item)
          cells.set(key, bucket)
        }
    }
  }
  const names = new Map<string, Set<string>>()
  for (const row of divisions) {
    if (!row.name || !['town', 'rural_area', 'village', 'hamlet'].includes(row.class))
      continue
    const districts = new Set(
      ancestors(row.id).flatMap(path =>
        path.filter(entry => entry.class === 'district').map(entry => entry.id),
      ),
    )
    if (districts.size !== 1) continue
    const key = JSON.stringify([row.locale, normalise(row.name), [...districts][0]])
    const ids = names.get(key) ?? new Set()
    ids.add(row.id)
    names.set(key, ids)
  }
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ divisions, areas }))
    .digest('hex')
  return {
    fingerprint,
    resolve(input: {
      lng?: number | null
      lat?: number | null
      districtId?: string | null
      names?: { locale: string; name: unknown }[]
      fallback?: DivisionReferences
      fallbackMethod?: 'text' | 'address'
    }) {
      const hasPoint =
        Number.isFinite(input.lng) &&
        Number.isFinite(input.lat) &&
        Math.abs(input.lng!) <= 180 &&
        Math.abs(input.lat!) <= 90
      const candidates = new Map<DivisionField, Map<string, Evidence['method']>>()
      const add = (id: string, method: Evidence['method']) => {
        const row = byId.get(id),
          field = row && fieldFor(row.class)
        if (!field) return
        const ids = candidates.get(field) ?? new Map()
        ids.set(id, method)
        candidates.set(field, ids)
      }
      if (hasPoint) {
        const x = input.lng!,
          y = input.lat!
        for (const item of cells.get(`${Math.floor(x * 20)},${Math.floor(y * 20)}`) ??
          []) {
          const [a, b, c, d] = item.bounds as [number, number, number, number]
          if (x >= a && x <= c && y >= b && y <= d && contains(item.polygon, x, y))
            add(item.id, 'geometry')
        }
      }
      const islands = candidates.get('landformId')
      if (islands && islands.size > 1) {
        for (const id of [...islands.keys()])
          if (
            [...islands.keys()].some(
              other =>
                other !== id &&
                ancestors(other).length > 0 &&
                ancestors(other).every(path => path.some(entry => entry.id === id)),
            )
          )
            islands.delete(id)
      }
      const unique = (field: DivisionField) => {
        const ids = candidates.get(field)
        return ids?.size === 1 ? [...ids.keys()][0]! : null
      }
      // Ancestry must agree across every canonical path. Never select the first path.
      const addAncestors = () => {
        const additions: string[] = []
        for (const ids of candidates.values()) {
          if (ids.size !== 1) continue
          const id = [...ids.keys()][0]!
          const full = ancestors(id)
          for (const entry of full[0] ?? []) {
            if (
              entry.id === id ||
              !full.every(path => path.some(other => other.id === entry.id))
            )
              continue
            if (byId.has(entry.id)) additions.push(entry.id)
          }
        }
        const existing = new Set(candidates.keys())
        for (const id of additions) {
          const field = fieldFor(byId.get(id)!.class)
          if (field && !existing.has(field) && (!hasPoint || !geometries.has(id)))
            add(id, 'ancestry')
        }
      }
      addAncestors()
      const district =
        unique('districtId') ??
        (candidates.has('districtId')
          ? null
          : (input.districtId ?? input.fallback?.districtId))
      const consistent = (id: string) => {
        const full = ancestors(id)
        if (!full.length)
          return ['country', 'area', 'district'].includes(byId.get(id)!.class)
        return (
          full.length > 0 &&
          full.every(path => {
            if (
              district &&
              !['country', 'area', 'district'].includes(byId.get(id)!.class) &&
              !path.some(entry => entry.id === district)
            )
              return false
            return path.every(entry => {
              const field = fieldFor(entry.class),
                selected = field && unique(field)
              if (
                field &&
                hasPoint &&
                geometries.has(entry.id) &&
                !candidates.get(field)?.has(entry.id)
              )
                return false
              if (field && candidates.has(field) && !selected) return false
              return !selected || selected === entry.id
            })
          })
        )
      }
      if (district) {
        const text = new Map<DivisionField, Set<string>>()
        for (const entry of input.names ?? []) {
          if (typeof entry.name !== 'string' || !entry.name.trim()) continue
          for (const id of names.get(
            JSON.stringify([entry.locale, normalise(entry.name), district]),
          ) ?? []) {
            const field = fieldFor(byId.get(id)!.class)!
            const ids = text.get(field) ?? new Set()
            ids.add(id)
            text.set(field, ids)
          }
        }
        for (const field of [
          'townId',
          'ruralAreaId',
          'villageId',
          'hamletId',
        ] as const) {
          const ids = text.get(field)
          if (!ids) continue
          if (candidates.has(field)) continue
          // Preserve ambiguity even when one of the duplicate names has geometry elsewhere.
          if (ids.size !== 1) {
            candidates.set(field, new Map())
            continue
          }
          const id = [...ids][0]!
          if ((!hasPoint || !geometries.has(id)) && consistent(id)) add(id, 'text')
        }
      }
      for (const field of [
        'countryId',
        'areaId',
        'districtId',
        'townId',
        'ruralAreaId',
        'macrohoodId',
        'neighbourhoodId',
        'villageId',
        'microhoodId',
        'hamletId',
        'landformId',
      ] as const) {
        const id = input.fallback?.[field]
        if (
          id &&
          byId.has(id) &&
          !candidates.has(field) &&
          (!hasPoint || !geometries.has(id)) &&
          consistent(id)
        )
          add(id, input.fallbackMethod ?? 'address')
      }
      addAncestors()
      const references: DivisionReferences = {},
        evidence: Evidence[] = []
      for (const [field, ids] of candidates) {
        references[field] = unique(field)
        if (ids.size === 1) {
          const [divisionId, method] = [...ids][0]!
          evidence.push({ divisionId, method })
        }
      }
      // SAR/city/island-group ancestors have no scalar Address column, but belong
      // in the many-to-many Place index when all canonical paths establish them.
      for (const { divisionId } of [...evidence]) {
        const full = ancestors(divisionId)
        for (const entry of full[0] ?? [])
          if (
            byId.has(entry.id) &&
            !fieldFor(entry.class) &&
            full.every(path => path.some(other => other.id === entry.id)) &&
            !evidence.some(row => row.divisionId === entry.id)
          )
            evidence.push({ divisionId: entry.id, method: 'ancestry' })
      }
      evidence.sort((a, b) => a.divisionId.localeCompare(b.divisionId))
      return { references, divisionIds: evidence.map(row => row.divisionId), evidence }
    },
  }
}
export type DivisionMembership = ReturnType<typeof createDivisionMembership>
