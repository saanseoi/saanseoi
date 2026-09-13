import type { DivisionHierarchies, DivisionHierarchyEntry } from '@repo/db'
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from 'geojson'

export type ReviewDivision = {
  id: string
  category: string | null
  class: string
  level: number | null
  names: Record<string, string | null>
  point: Position | null
  hierarchies: DivisionHierarchies
}
export type ReviewInventory = {
  schemaVersion: number
  region: string
  domain: string
  cohort: string
  releaseSet: string
  divisions: ReviewDivision[]
}
export type ReviewArea = Feature<
  Polygon | MultiPolygon,
  { divisionId: string; variant: string; [key: string]: unknown }
>
export type StubAreas = FeatureCollection<
  Polygon | MultiPolygon,
  ReviewArea['properties']
> & {
  schemaVersion: number
  region: string
  domain: string
  cohort: string
  variant: 'stub'
}
export type HierarchyDecision = {
  divisionId: string
  expectedClass: string
  status: 'geometry' | 'provisional' | 'unresolved'
  point: Position | null
  parentIds: string[]
  competingParentIds: string[]
  evidence: Array<{ divisionId: string; variant: string }>
  hierarchies: DivisionHierarchies
}
export type HierarchyPatch = {
  schemaVersion: 1
  kind: 'geographic-hierarchy-patch'
  region: string
  domain: string
  cohort: string
  releaseSet: string
  entries: HierarchyDecision[]
}

export function divisionReviewName(division: ReviewDivision) {
  return (
    [...new Set([division.names['zh-hant'], division.names.en].filter(Boolean))].join(
      ' ',
    ) || division.id
  )
}

/** Boundary points are included, including a hole boundary; hole interiors are excluded. */
function ringContains(point: Position, ring: Position[]): -1 | 0 | 1 {
  let inside = false
  const [x, y] = point as [number, number]
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]! as [number, number]
    const [bx, by] = ring[i]! as [number, number]
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return 0
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside
  }
  return inside ? 1 : -1
}
export function containsReviewPoint(point: Position, geometry: Polygon | MultiPolygon) {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(rings => {
    if (!rings[0] || ringContains(point, rings[0]) < 0) return false
    return !rings.slice(1).some(ring => ringContains(point, ring) > 0)
  })
}

export function reviewAreaBounds(
  geometry: Polygon | MultiPolygon,
): [number, number, number, number] {
  const rings =
    geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
  const bounds: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ]
  for (const ring of rings)
    for (const point of ring) {
      bounds[0] = Math.min(bounds[0], point[0]!)
      bounds[1] = Math.min(bounds[1], point[1]!)
      bounds[2] = Math.max(bounds[2], point[0]!)
      bounds[3] = Math.max(bounds[3], point[1]!)
    }
  return bounds
}
function areaSize(geometry: Polygon | MultiPolygon) {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.reduce(
    (sum, rings) =>
      sum +
      rings.reduce((total, ring, index) => {
        let twiceArea = 0
        for (let i = 1; i < ring.length; i++)
          twiceArea += ring[i - 1]![0]! * ring[i]![1]! - ring[i]![0]! * ring[i - 1]![1]!
        return total + ((index ? -1 : 1) * Math.abs(twiceArea)) / 2
      }, 0),
    0,
  )
}

export function validateStubAreas(
  value: unknown,
  inventory: ReviewInventory,
): asserts value is StubAreas {
  const data = value as StubAreas
  if (
    data?.type !== 'FeatureCollection' ||
    data.schemaVersion !== 1 ||
    data.variant !== 'stub' ||
    data.domain !== 'geographic' ||
    data.region !== inventory.region ||
    data.cohort !== inventory.cohort ||
    !Array.isArray(data.features)
  )
    throw new Error('Stub fixture does not match this geographic cohort.')
  const divisions = new Map(inventory.divisions.map(d => [d.id, d]))
  const ids = new Set<string>()
  for (const feature of data.features) {
    const id = feature?.properties?.divisionId
    const division = divisions.get(id)
    if (!division || ids.has(id) || feature.properties.variant !== 'stub')
      throw new Error('Every stub needs one unique, known division identity.')
    if (division.level === 6)
      throw new Error('Level 6 uses point membership; draw its parent instead.')
    ids.add(id)
    if (
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
    )
      throw new Error('Stub geometry must be a Polygon or MultiPolygon.')
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
    if (!polygons.length) throw new Error('Empty polygon.')
    for (const rings of polygons) {
      if (!Array.isArray(rings) || !rings.length) throw new Error('Empty polygon.')
      for (const ring of rings) {
        if (
          !Array.isArray(ring) ||
          ring.length < 4 ||
          ring.some(
            p =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              !p.every(Number.isFinite) ||
              Math.abs(p[0]!) > 180 ||
              Math.abs(p[1]!) > 90,
          )
        )
          throw new Error('Invalid polygon coordinates.')
        if (ring[0]![0] !== ring.at(-1)![0] || ring[0]![1] !== ring.at(-1)![1])
          throw new Error('Polygon rings must be closed.')
        if (new Set(ring.slice(0, -1).map(p => p.join(','))).size !== ring.length - 1)
          throw new Error('Polygon vertices must be distinct.')
        for (let i = 0; i < ring.length - 1; i++)
          for (let j = i + 2; j < ring.length - 1; j++) {
            if (i === 0 && j === ring.length - 2) continue
            if (segmentsIntersect(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!))
              throw new Error('Polygon ring intersects itself.')
          }
      }
    }
    if (areaSize(feature.geometry) <= 0)
      throw new Error('Polygon area must be positive.')
  }
}
function segmentsIntersect(a: Position, b: Position, c: Position, d: Position) {
  const orient = (p: Position, q: Position, r: Position) =>
    (q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!)
  return (
    orient(a, b, c) * orient(a, b, d) <= 0 &&
    orient(c, d, a) * orient(c, d, b) <= 0 &&
    Math.max(Math.min(a[0]!, b[0]!), Math.min(c[0]!, d[0]!)) <=
      Math.min(Math.max(a[0]!, b[0]!), Math.max(c[0]!, d[0]!)) &&
    Math.max(Math.min(a[1]!, b[1]!), Math.min(c[1]!, d[1]!)) <=
      Math.min(Math.max(a[1]!, b[1]!), Math.max(c[1]!, d[1]!))
  )
}

function eligibleParent(child: ReviewDivision, parent: ReviewDivision) {
  if (child.id === parent.id || parent.class === 'country') return false
  if (child.class === 'country' || child.class === 'sar') return false
  if (parent.category === 'administrative')
    return (
      child.category !== 'administrative' ||
      (parent.level !== null && child.level !== null && parent.level < child.level)
    )
  if (parent.category === 'landform')
    return (
      child.category !== 'administrative' &&
      (child.category !== 'landform' ||
        (parent.class === 'island_group' && child.class !== 'island_group'))
    )
  return (
    child.category !== 'administrative' &&
    child.category !== 'landform' &&
    parent.level !== null &&
    child.level !== null &&
    parent.level < child.level
  )
}

/** Per-point inference. Smaller containing area wins a same-tier overlap; ID breaks ties. */
export function deriveHierarchyPatch(
  inventory: ReviewInventory,
  reference: ReviewArea[],
  stubs: StubAreas,
  retainProvisional: boolean,
): HierarchyPatch {
  validateStubAreas(stubs, inventory)
  const divisions = new Map(inventory.divisions.map(d => [d.id, d]))
  const stubIds = new Set(stubs.features.map(f => f.properties.divisionId))
  const priority = (variant: string) =>
    variant === 'stub'
      ? 0
      : variant === 'hkgov-had'
        ? 1
        : variant === 'overture'
          ? 2
          : 3
  const byDivision = new Map<string, ReviewArea>()
  for (const feature of [...reference, ...stubs.features]) {
    if (!divisions.has(feature.properties.divisionId)) continue
    if (
      stubIds.has(feature.properties.divisionId) &&
      feature.properties.variant !== 'stub'
    )
      continue
    const old = byDivision.get(feature.properties.divisionId)
    if (!old || priority(feature.properties.variant) < priority(old.properties.variant))
      byDivision.set(feature.properties.divisionId, feature)
  }
  const candidates = [...byDivision.values()].map(feature => ({
    feature,
    division: divisions.get(feature.properties.divisionId)!,
    bounds: reviewAreaBounds(feature.geometry),
    size: areaSize(feature.geometry),
  }))
  const entries = inventory.divisions.map(child => {
    const found = child.point
      ? candidates
          .filter(candidate => {
            const [x, y] = child.point!
            const [w, s, e, n] = candidate.bounds
            return (
              eligibleParent(child, candidate.division) &&
              x! >= w &&
              x! <= e &&
              y! >= s &&
              y! <= n &&
              containsReviewPoint(child.point!, candidate.feature.geometry)
            )
          })
          .sort(
            (a, b) =>
              a.size - b.size || a.division.id.localeCompare(b.division.id, 'en'),
          )
      : []
    const groups = new Map<string, typeof found>()
    for (const candidate of found) {
      const d = candidate.division
      const tier =
        d.category === 'landform'
          ? d.class === 'island_group'
            ? 'landform-group'
            : 'landform-island'
          : d.category === 'administrative'
            ? d.class
            : `locality-${d.level}`
      groups.set(tier, [...(groups.get(tier) ?? []), candidate])
    }
    const selected = [...groups.values()].map(group => group[0]!)
    const hierarchy = retainProvisional
      ? structuredClone(child.hierarchies)
      : { administrative: [], locality: [], landform: [], full: [] }
    const entry = (d: ReviewDivision): DivisionHierarchyEntry => ({
      id: d.id,
      class: d.class,
      name: divisionReviewName(d),
    })
    const sort = (a: ReviewDivision, b: ReviewDivision) =>
      (a.level ?? -1) - (b.level ?? -1) || a.id.localeCompare(b.id, 'en')
    const administrative = selected
      .map(c => c.division)
      .filter(d => d.category === 'administrative')
      .sort(sort)
      .map(entry)
    const landforms = selected
      .map(c => c.division)
      .filter(d => d.category === 'landform')
      .sort(
        (a, b) =>
          Number(b.class === 'island_group') - Number(a.class === 'island_group'),
      )
      .map(entry)
    const localities = selected
      .map(c => c.division)
      .filter(d => d.category === 'locality' || d.category === 'hood')
      .sort(sort)
      .map(entry)
    if (administrative.length) hierarchy.administrative = [administrative]
    if (landforms.length) hierarchy.landform = [landforms]
    if (localities.length) hierarchy.locality = [localities]
    // Preserve correlated fallback paths; inferred paths are a single deterministic chain.
    if (selected.length) {
      const adminPaths = hierarchy.administrative.length
        ? hierarchy.administrative
        : [[]]
      const landformPath = hierarchy.landform.length === 1 ? hierarchy.landform[0]! : []
      const localityPath = hierarchy.locality.length === 1 ? hierarchy.locality[0]! : []
      hierarchy.full = adminPaths
        .map(path => [
          ...path,
          ...landformPath,
          ...localityPath.filter(d => d.class !== 'city'),
        ])
        .filter(path => path.length)
    }
    const complete =
      Boolean(child.point) &&
      (child.class === 'country' ||
        child.class === 'sar' ||
        selected.some(c => c.division.class === 'district')) &&
      (child.category === 'administrative' ||
        child.category === 'landform' ||
        child.level === 1 ||
        child.level === 3 ||
        selected.some(
          c => c.division.category === 'locality' || c.division.category === 'hood',
        ))
    return {
      divisionId: child.id,
      expectedClass: child.class,
      status: complete ? 'geometry' : retainProvisional ? 'provisional' : 'unresolved',
      point: child.point,
      parentIds: selected.map(c => c.division.id),
      competingParentIds: [...groups.values()].flatMap(group =>
        group.slice(1).map(c => c.division.id),
      ),
      evidence: selected.map(c => ({
        divisionId: c.division.id,
        variant: c.feature.properties.variant,
      })),
      hierarchies: hierarchy,
    } as HierarchyDecision
  })
  return {
    schemaVersion: 1,
    kind: 'geographic-hierarchy-patch',
    region: inventory.region,
    domain: inventory.domain,
    cohort: inventory.cohort,
    releaseSet: inventory.releaseSet,
    entries,
  }
}
