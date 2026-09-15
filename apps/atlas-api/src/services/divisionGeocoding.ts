import type { Polygon, MultiPolygon } from 'geojson'
import { createHash } from 'node:crypto'
import { containmentGeometryKey } from '@repo/core/pipeline/services/divisions/containmentGeometry.ts'
import type { DivisionRecord, DivisionAreaRecord } from '../db/divisions'
import {
  geographicDivisionClassification,
  type DivisionHierarchies,
  type DivisionHierarchyEntry,
} from '@repo/db'
import {
  containsReviewPoint,
  reviewAreaBounds,
} from '@repo/core/pipeline/services/divisions/geographicReview.ts'

export type Coordinate = [number, number]
export function pointGeometry(value: unknown): Coordinate | null {
  const geometry = value as { type?: string; coordinates?: unknown }
  const p = geometry?.coordinates
  return geometry?.type === 'Point' &&
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
    ? [p[0], p[1]]
    : null
}

export function nameScore(query: string, names: Array<string | null | undefined>) {
  const normalise = (text: string) => text.toLowerCase().trim()
  const q = normalise(query)
  return Math.max(
    0,
    ...names
      .filter((s): s is string => Boolean(s))
      .map(value => {
        const name = normalise(value)
        return name === q ? 1 : name.startsWith(q) ? 0.8 : name.includes(q) ? 0.6 : 0
      }),
  )
}

export function distanceMetres(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

function normaliseHierarchies(value: unknown): DivisionHierarchies {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<Record<keyof DivisionHierarchies, unknown>>)
      : {}
  const paths = (key: keyof DivisionHierarchies): DivisionHierarchyEntry[][] =>
    Array.isArray(source[key]) ? (source[key] as DivisionHierarchyEntry[][]) : []

  return {
    administrative: paths('administrative'),
    locality: paths('locality'),
    landform: paths('landform'),
    full: paths('full'),
  }
}

/** One request owns this index; no mutable release-dependent process cache. */
export function createDivisionResolver(
  records: DivisionRecord[],
  areas: DivisionAreaRecord[],
  options: { containsPoint?: typeof containsReviewPoint } = {},
) {
  const byId = new Map(records.map(record => [record.division.id, record]))
  const hierarchiesById = new Map(
    records.map(record => [
      record.division.id,
      normaliseHierarchies(record.division.hierarchies),
    ]),
  )
  const referencedClasses = new Map<string, Set<string>>()
  for (const record of records)
    for (const paths of Object.values(hierarchiesById.get(record.division.id)!))
      for (const path of paths)
        for (const entry of path) {
          const classes = referencedClasses.get(entry.id) ?? new Set<string>()
          classes.add(entry.class)
          referencedClasses.set(entry.id, classes)
        }
  const classification = (id: string) => {
    const record = byId.get(id)
    if (record) return record.division
    const classes = referencedClasses.get(id)
    const klass = classes?.size === 1 ? [...classes][0]! : null
    return {
      class: klass,
      category: klass
        ? (geographicDivisionClassification(klass)?.category ?? null)
        : null,
      level: klass ? (geographicDivisionClassification(klass)?.level ?? null) : null,
    }
  }
  const index = areas.flatMap(area => {
    const geometry = area.geometry as Polygon | MultiPolygon
    return ['saanseoi', 'overture', 'stub'].includes(area.variant) &&
      byId.has(area.divisionId) &&
      (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon')
      ? [{ id: area.divisionId, geometry, bbox: reviewAreaBounds(geometry) }]
      : []
  })
  const covered = new Set(index.map(area => area.id))
  const areasById = new Map<string, typeof index>()
  for (const area of index)
    areasById.set(area.id, [...(areasById.get(area.id) ?? []), area])
  const containedChildren = new Map<
    string,
    Array<{
      id: string
      evidence: NonNullable<DivisionHierarchyEntry['containment_geometry']>
    }>
  >()
  for (const [id, hierarchy] of hierarchiesById) {
    if (!covered.has(id)) continue
    const seen = new Set<string>()
    for (const entry of Object.values(hierarchy).flat(2)) {
      if (
        entry.full_containment !== true ||
        !entry.containment_geometry ||
        entry.id === id ||
        seen.has(entry.id) ||
        !covered.has(id) ||
        !covered.has(entry.id)
      )
        continue
      seen.add(entry.id)
      containedChildren.set(entry.id, [
        ...(containedChildren.get(entry.id) ?? []),
        { id, evidence: entry.containment_geometry },
      ])
    }
  }
  // Validate evidence once per request-owned index, against the actual loaded areas.
  const fingerprints = new Map<string, string>()
  const fingerprint = (id: string) => {
    let hash = fingerprints.get(id)
    if (!hash) {
      hash = `sha256:${createHash('sha256')
        .update(containmentGeometryKey(areasById.get(id)!.map(area => area.geometry)))
        .digest('hex')}`
      fingerprints.set(id, hash)
    }
    return hash
  }
  const containsPoint = options.containsPoint ?? containsReviewPoint
  function resolve(point: Coordinate | null, withGeometry = false, namedId?: string) {
    const checked = new Map<string, boolean>()
    const visiting = new Set<string>()
    function contains(id: string): boolean {
      if (!point || visiting.has(id)) return false
      const previous = checked.get(id)
      if (previous !== undefined) return previous
      const candidates = (areasById.get(id) ?? []).filter(
        ({ bbox }) =>
          point[0] >= bbox[0] &&
          point[0] <= bbox[2] &&
          point[1] >= bbox[1] &&
          point[1] <= bbox[3],
      )
      visiting.add(id)
      const inherited =
        candidates.length > 0 &&
        (containedChildren.get(id) ?? []).some(
          child =>
            contains(child.id) &&
            fingerprint(child.id) === child.evidence.division &&
            fingerprint(id) === child.evidence.ancestor,
        )
      const result =
        inherited || candidates.some(area => containsPoint(point, area.geometry))
      visiting.delete(id)
      checked.set(id, result)
      return result
    }
    const containingIds = new Set([...covered].filter(contains))
    const matched = namedId ? new Set([namedId]) : containingIds
    const excluded = (id: string) =>
      point !== null && id !== namedId && covered.has(id) && !containingIds.has(id)
    const unresolved = new Set<string>()
    const missing = new Set<string>()
    const paths = new Map<string, string[]>()

    // Each stored full branch stays intact. Recover suppressed ancestors only
    // through that branch's own records, never by zipping category projections.
    function expand(id: string, visiting = new Set<string>()): string[][] {
      if (visiting.has(id)) {
        unresolved.add(id)
        return []
      }
      const record = byId.get(id)
      if (!record) {
        missing.add(id)
        return [[id]]
      }
      if (!covered.has(id)) missing.add(id)
      if (excluded(id)) return []
      const next = new Set([...visiting, id])
      const hierarchy = hierarchiesById.get(id)!
      const branches = hierarchy.full.length
        ? hierarchy.full.map(path => path.map(entry => entry.id))
        : [[]]
      // A containing division may cross its stored administrative parent.
      // Keep its coordinate-supported ancestors even when that parent is outside.
      const viable =
        point && containingIds.has(id)
          ? branches.map(path => path.filter(parent => !excluded(parent)))
          : branches.filter(path => path.every(parent => !excluded(parent)))
      const result: string[][] = []
      for (const branch of viable) {
        let selected = [...branch, id]
        // A unique category projection is evidence; ambiguous projections must
        // be supported by IDs already present on this particular branch.
        for (const category of ['administrative', 'locality', 'landform'] as const) {
          const alternatives = (hierarchy[category] ?? [])
            .map(path => path.map(entry => entry.id))
            .filter(path => path.every(parent => !excluded(parent)))
          const evidenced = selected.filter(parent =>
            alternatives.some(path => path.includes(parent)),
          )
          const supported = evidenced.length
            ? alternatives.filter(path =>
                evidenced.every(parent => path.includes(parent)),
              )
            : []
          const candidates = alternatives.length === 1 ? alternatives : supported
          if (candidates.length > 1 || (alternatives.length > 1 && !supported.length)) {
            unresolved.add(id)
            continue
          }
          const projection = candidates[0]
          if (!projection) continue
          // Insertion requires an evidenced common descendant; isolated
          // landform projections remain a separate membership path.
          const anchor = projection.find(parent => selected.includes(parent))
          if (!anchor && category === 'landform') continue
          if (!anchor && projection.length && branch.length && viable.length !== 1) {
            unresolved.add(id)
            continue
          }
          const common = projection
            .filter(parent => selected.includes(parent))
            .map(parent => selected.indexOf(parent))
          if (
            common.some(
              (position, index) => index > 0 && position <= common[index - 1]!,
            )
          ) {
            unresolved.add(id)
            continue
          }
          for (const [position, parent] of projection.entries()) {
            if (selected.includes(parent)) continue
            const following = projection
              .slice(position + 1)
              .find(entry => selected.includes(entry))
            const preceding = projection
              .slice(0, position)
              .findLast(entry => selected.includes(entry))
            const insertion = following
              ? selected.indexOf(following)
              : preceding
                ? selected.indexOf(preceding) + 1
                : selected.length - 1
            selected.splice(insertion, 0, parent)
          }
        }
        for (const parent of [...selected].slice(0, -1)) {
          const ancestorPaths = expand(parent, next)
          const compatible = ancestorPaths.filter(path =>
            path.every(
              ancestor =>
                !excluded(ancestor) &&
                !selected.some(
                  existing =>
                    existing !== ancestor &&
                    !path.includes(existing) &&
                    byId.get(existing)?.division.class ===
                      byId.get(ancestor)?.division.class,
                ),
            ),
          )
          if (compatible.length !== 1) {
            unresolved.add(parent)
            continue
          }
          for (const ancestor of compatible[0]!.slice(0, -1))
            if (!selected.includes(ancestor))
              selected.splice(selected.indexOf(parent), 0, ancestor)
        }
        selected = [...new Set(selected)]
        result.push(selected)
      }
      return [...new Map(result.map(path => [JSON.stringify(path), path])).values()]
    }
    for (const id of [...matched].sort()) {
      const branches = expand(id)
      if (!branches.length) unresolved.add(id)
      for (const path of branches) paths.set(JSON.stringify(path), path)
      const landforms = (hierarchiesById.get(id)!.landform ?? []).filter(path =>
        path.every(entry => !excluded(entry.id)),
      )
      if (landforms.length > 1) unresolved.add(id)
      for (const landformPath of landforms) {
        const last = landformPath.at(-1)
        if (!last) continue
        for (const ancestors of expand(last.id)) {
          const path = [
            ...new Set([...landformPath.map(entry => entry.id), ...ancestors]),
          ]
          paths.set(JSON.stringify(path), path)
        }
      }
    }
    const allPaths = [...paths.values()].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    )
    function maximalPaths(landforms: boolean) {
      const projected = [
        ...new Map(
          allPaths
            .map(path =>
              path.filter(
                id => (classification(id).category === 'landform') === landforms,
              ),
            )
            .filter(path => path.length)
            .map(path => [JSON.stringify(path), path]),
        ).values(),
      ]
      return projected.filter(
        path =>
          !projected.some(other => {
            if (other.length <= path.length) return false
            let position = -1
            return path.every(id => {
              position = other.indexOf(id, position + 1)
              return position !== -1
            })
          }),
      )
    }
    // Reverse lookups combine compatible containment evidence across partial
    // category paths. This describes membership at this point, not a global
    // assertion that one entire division polygon contains another.
    const administrative = maximalPaths(false)
    /** Merge coordinate-supported paths while preserving their ancestor ordering. */
    function mergeContainingPaths(a: string[], b: string[]): string[] | null {
      const ids = [...new Set([...a, ...b])]
      if (
        ids.some(id => (!a.includes(id) || !b.includes(id)) && !containingIds.has(id))
      )
        return null
      const slots = new Set<string>()
      for (const id of ids) {
        const { category, level } = classification(id)
        if (category === null || level === null) return null
        const slot = `${category}:${level}`
        if (slots.has(slot)) return null
        slots.add(slot)
      }
      // Existing path edges constrain the merge. Distinct levels order members
      // within a category; equal levels in different categories are independent.
      const predecessors = new Map(ids.map(id => [id, new Set<string>()]))
      for (const path of [a, b])
        for (let i = 1; i < path.length; i++)
          predecessors.get(path[i]!)!.add(path[i - 1]!)
      for (const id of ids)
        for (const other of ids)
          if (
            classification(id).category === classification(other).category &&
            classification(id).level! > classification(other).level!
          )
            predecessors.get(id)!.add(other)
      const categoryOrder = ['administrative', 'locality', 'hood']
      const merged: string[] = []
      while (merged.length < ids.length) {
        const available = ids.filter(
          id =>
            !merged.includes(id) &&
            [...predecessors.get(id)!].every(parent => merged.includes(parent)),
        )
        available.sort(
          (x, y) =>
            categoryOrder.indexOf(classification(x).category!) -
              categoryOrder.indexOf(classification(y).category!) ||
            classification(x).level! - classification(y).level! ||
            x.localeCompare(y),
        )
        if (!available.length) return null
        merged.push(available[0]!)
      }
      return merged
    }
    if (point) {
      for (let left = 0; left < administrative.length; left++) {
        for (let right = left + 1; right < administrative.length; right++) {
          const merged = mergeContainingPaths(
            administrative[left]!,
            administrative[right]!,
          )
          if (!merged) continue
          administrative[left] = merged
          administrative.splice(right, 1)
          right = left
        }
      }
    }
    const landform = maximalPaths(true)
    const membership = [...new Set([...matched, ...allPaths.flat()])].sort()
    const resource = (id: string) => {
      const record = byId.get(id)
      return {
        id,
        category: classification(id).category,
        class: classification(id).class,
        level: classification(id).level,
        names: record?.i18n ?? {},
        evidence:
          id === namedId ? 'name' : containingIds.has(id) ? 'containment' : 'hierarchy',
        ...(withGeometry
          ? { geometry: index.find(area => area.id === id)?.geometry ?? null }
          : {}),
      }
    }
    const ambiguous =
      administrative.length > 1 || landform.length > 1 || unresolved.size > 0
    return {
      status: ambiguous
        ? 'ambiguous'
        : missing.size || (!matched.size && covered.size < byId.size)
          ? 'incomplete'
          : matched.size
            ? 'resolved'
            : 'not_found',
      matchedDivisionIds: [...matched].sort(),
      memberships: membership.map(resource),
      path: administrative.length === 1 && !unresolved.size ? administrative[0]! : null,
      selectedAncestryIds: ambiguous ? null : membership,
      alternatives: administrative,
      landform: {
        memberships: membership
          .filter(id => classification(id).category === 'landform')
          .map(resource),
        paths: landform,
      },
      coverage: {
        geometry: areas.some(area => area.variant === 'saanseoi')
          ? 'saanseoi'
          : areas.some(area => area.variant === 'overture')
            ? 'overture'
            : 'stub',
        covered: covered.size,
        total: byId.size,
        missingAncestorIds: [...missing].sort(),
      },
      ambiguity: {
        unresolvedDivisionIds: [...unresolved].sort(),
        overlappingPaths: administrative.length > 1 || landform.length > 1,
      },
    }
  }
  return {
    resolve,
    resolveNamed: (id: string, point: Coordinate | null, withGeometry = false) =>
      resolve(point, withGeometry, id),
  }
}
