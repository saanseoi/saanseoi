import { belongsInFullHierarchy } from '@repo/core/pipeline/services/divisions/divisionHierarchies.ts'
import { buildDisplayName, type DisplayNameLocales } from '@repo/core/displayName'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'

type Row = Record<string, any>
const parse = (value: any) => (typeof value === 'string' ? JSON.parse(value) : value)
const unique = (paths: Row[][]) => [
  ...new Map(
    paths.filter(p => p.length).map(p => [JSON.stringify(p.map(e => e.id)), p]),
  ).values(),
]

/** Resolve every spatially supported branch; a branch must share one part of the child. */
export function resolveCuratedHierarchies(
  divisions: Row[],
  areas: Row[],
  names: Row[],
  groupMembership: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const byId = new Map(divisions.map(row => [row.id, row]))
  const parts = new Map<string, any[]>()
  for (const area of areas)
    parts.set(area.divisionId, [
      ...(parts.get(area.divisionId) ?? []),
      parse(area.geometry),
    ])
  const shapes = new Map<string, any>()
  for (const [id, geometries] of parts)
    shapes.set(
      id,
      UnaryUnionOp.union(reader.read({ type: 'GeometryCollection', geometries })),
    )
  const labels = new Map<string, DisplayNameLocales>()
  for (const name of names) {
    if (name.locale !== 'en' && name.locale !== 'zh-hant') continue
    const localised = labels.get(name.divisionId) ?? {}
    localised[name.locale as keyof DisplayNameLocales] = name.name
    labels.set(name.divisionId, localised)
  }
  const entry = (row: Row) => ({
    id: row.id,
    class: row.class,
    name: buildDisplayName(labels.get(row.id) ?? {}),
  })
  const sar = divisions.find(row => row.class === 'sar')
  const tier = (row: Row): number =>
    row.class === 'sar'
      ? 0
      : row.class === 'area'
        ? 1
        : row.class === 'district'
          ? 2
          : row.class === 'island_group'
            ? 3
            : row.category === 'landform'
              ? 4
              : 10 + row.level
  const overlaps = (a: any, b: any) =>
    a.getEnvelopeInternal().intersects(b.getEnvelopeInternal())
  const polygonal = (geometry: any) => {
    const polygons: any[] = []
    const collect = (part: any) => {
      if (part.getGeometryType() === 'Polygon') polygons.push(part)
      else if (part.getDimension() === 2)
        for (let i = 0; i < part.getNumGeometries(); i++) collect(part.getGeometryN(i))
    }
    collect(geometry)
    return geometry.getFactory().createMultiPolygon(polygons)
  }
  function clip(a: any, b: any, point: boolean) {
    if (!overlaps(a, b)) return null
    if (point) return RelateOp.covers(b, a) ? a : null
    const intersection = polygonal(OverlayOp.intersection(a, b))
    // Boundary contact alone is not geographic ancestry.
    return intersection.getArea() > 1e-14 ? intersection : null
  }
  for (const child of divisions) {
    if (child.class === 'country' || child.class === 'sar') continue
    const shape = shapes.get(child.id)
    const pointGeometry = parse(child.geometry)
    const subject =
      shape ?? (pointGeometry?.type === 'Point' ? reader.read(pointGeometry) : null)
    if (!subject) continue
    const isPoint = !shape
    const hongKongIsland =
      child.category === 'landform' && labels.get(child.id)?.en === 'Hong Kong Island'
    const eligible = divisions
      .filter(parent => {
        if (
          parent.id === child.id ||
          !shapes.has(parent.id) ||
          parent.class === 'country'
        )
          return false
        if (parent.category === 'administrative') {
          if (hongKongIsland && parent.class === 'district') return false
          return child.category !== 'administrative' || parent.level < child.level
        }
        if (child.category === 'administrative') return false
        if (parent.category === 'landform') {
          if (child.class === 'island_group') return false
          if (
            child.category === 'landform' &&
            parent.class === 'island_group' &&
            groupMembership.has(parent.id)
          )
            return groupMembership.get(parent.id)!.has(child.id)
          return child.category !== 'landform' || parent.class === 'island_group'
        }
        return child.category !== 'landform' && parent.level < child.level
      })
      .filter(parent => overlaps(subject, shapes.get(parent.id)))
    const groups = new Map<number, Row[]>()
    for (const parent of eligible)
      groups.set(tier(parent), [...(groups.get(tier(parent)) ?? []), parent])
    let branches: Array<{ path: Row[]; geometry: any }> = [
      { path: [], geometry: subject },
    ]
    for (const [, parents] of [...groups].sort(([a], [b]) => a - b)) {
      branches = branches.flatMap(branch => {
        const matches = parents.flatMap(parent => {
          const geometry = clip(branch.geometry, shapes.get(parent.id), isPoint)
          return geometry ? [{ path: [...branch.path, entry(parent)], geometry }] : []
        })
        if (!matches.length) return [branch]
        if (isPoint) return matches
        // Matching parents may cover only part of this branch. Carry the remainder
        // into subsequent tiers with its existing ancestry, keeping paths spatially
        // correlated rather than treating an intersection as complete coverage.
        let remainder = branch.geometry
        for (const parent of parents) {
          const parentShape = shapes.get(parent.id)
          if (!overlaps(remainder, parentShape)) continue
          remainder = OverlayOp.difference(remainder, parentShape)
          if (remainder.isEmpty()) break
        }
        if (remainder.getArea() > 1e-14)
          matches.push({ path: branch.path, geometry: remainder })
        return matches
      })
    }
    let full = unique(branches.map(branch => branch.path))
    // Preserve explicit ancestors lacking geometry: absence of polygons is not disproof.
    const previous = parse(child.hierarchies) ?? {}
    const unsupported = unique(
      (previous.full ?? []).map((path: Row[]) =>
        path.filter(e => byId.has(e.id) && !shapes.has(e.id)),
      ),
    )
    if (unsupported.length)
      full = unique(
        (full.length ? full : [[]]).flatMap(path =>
          unsupported.map(extra => [
            ...path,
            ...extra.filter(e => !path.some(p => p.id === e.id)),
          ]),
        ),
      )
    if (sar && !full.length && child.category === 'landform')
      throw Error(`Unresolved administrative hierarchy for landform ${child.id}`)
    child.hierarchies = {
      full,
      administrative: unique(
        full.map(path =>
          path.filter(e => byId.get(e.id)?.category === 'administrative'),
        ),
      ),
      locality: unique(
        full.map(path =>
          path.filter(e => ['locality', 'hood'].includes(byId.get(e.id)?.category)),
        ),
      ),
      landform: unique(
        full.map(path => path.filter(e => byId.get(e.id)?.category === 'landform')),
      ),
    }
  }
  // Explicit ancestors and children without geometry use the same canonical labels.
  for (const division of divisions) {
    const hierarchy = parse(division.hierarchies)
    if (!hierarchy) continue
    for (const paths of Object.values(hierarchy) as Row[][][])
      for (const path of paths)
        for (const ancestor of path)
          ancestor.name = buildDisplayName(labels.get(ancestor.id) ?? {})
    hierarchy.full = unique(
      (hierarchy.full ?? []).map((path: Row[]) =>
        path.filter(entry =>
          belongsInFullHierarchy({ id: entry.id, class: entry.class }),
        ),
      ),
    )
    division.hierarchies = hierarchy
  }
}
