import type { BoundaryPatchEvidence } from './boundaryPatchEvidence'
import type { AuditGuard } from '@repo/core/provenance'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
type Row = Record<string, any>
export function preparationChecks(evidence: {
  records: Row[]
  names: Row[]
  definitions: Row
  boundaryPatches?: BoundaryPatchEvidence[]
  islandGroups?: Array<{ divisionId: string; memberIds: string[] }>
}): AuditGuard[] {
  const result: AuditGuard[] = []
  const check = (
    id: string,
    summary: string,
    rows: unknown[],
    valid: (row: any) => boolean,
    passedReason?: string,
  ) => {
    let failed = 0
    for (const row of rows) {
      try {
        if (!valid(row)) failed++
      } catch {
        failed++
      }
    }
    result.push({
      id,
      summary,
      consequence: 'block-ingestion',
      checked: rows.length,
      failed,
      status: failed ? 'failed' : rows.length ? 'passed' : 'not-applicable',
      reason: failed
        ? `${failed} of ${rows.length} retained records fail this check.`
        : (passedReason ?? `${rows.length} records satisfy this check.`),
    })
  }
  const ids = new Set<string>()
  check(
    'prepared-division-identities',
    'Every prepared division has a unique identity.',
    evidence.records,
    row => {
      if (!row.id || ids.has(row.id)) return false
      ids.add(row.id)
      return true
    },
    'There are no duplicated records.',
  )
  const named = new Set(
    evidence.names
      .filter(row => typeof row.name === 'string' && row.name.trim())
      .map(row => row.divisionId),
  )
  check(
    'prepared-division-names',
    'Every division must have at least one name.',
    evidence.records,
    row => named.has(row.id),
    'Every division has at least one name.',
  )
  check(
    'prepared-ancestor-references',
    'Every prepared ancestor refers to an output division.',
    evidence.records.filter(row => row.hierarchies),
    row => {
      const hierarchy =
        typeof row.hierarchies === 'string'
          ? JSON.parse(row.hierarchies)
          : row.hierarchies
      return Object.values(hierarchy).every(
        paths =>
          Array.isArray(paths) &&
          paths.every(
            path =>
              Array.isArray(path) &&
              path.every(parent => parent.id !== row.id && ids.has(parent.id)),
          ),
      )
    },
    'The hierarchy ancestry can be fully resolved in this release.',
  )
  const reader = new GeoJSONReader(new GeometryFactory())
  const features: Row[] = evidence.definitions.geometry?.features ?? []
  check(
    'curated-polygon-validity',
    'Every retained active boundary drawing is a valid polygon.',
    features,
    row =>
      ['Polygon', 'MultiPolygon'].includes(row.geometry?.type) &&
      IsValidOp.isValid(reader.read(row.geometry)),
  )
  check(
    'curated-core-point-containment',
    'Every retained boundary core point lies inside its drawing.',
    features.filter(row => row.properties?.corePoint),
    row =>
      RelateOp.covers(
        reader.read(row.geometry),
        reader.read({ type: 'Point', coordinates: row.properties.corePoint }),
      ),
  )
  const validReplacements = new Set(
    (evidence.boundaryPatches ?? [])
      .filter(patch => {
        try {
          if (
            !ids.has(patch.divisionId) ||
            !['Polygon', 'MultiPolygon'].includes(patch.geometry?.type)
          )
            return false
          const polygon = reader.read(patch.geometry)
          return (
            !polygon.isEmpty() && polygon.getArea() > 0 && IsValidOp.isValid(polygon)
          )
        } catch {
          return false
        }
      })
      .map(patch => patch.id),
  )
  const identityActions = new Set(
    (evidence.definitions.exclusions?.islandActions ?? [])
      .filter(
        (row: Row) =>
          !row.reviewRequired &&
          ['exclude', 'merge', 'reclassify', 'no-geometry'].includes(row.action),
      )
      .map((row: Row) => row.id),
  )
  const rejected = (evidence.definitions.exclusions?.islandDecisions ?? []).filter(
    (row: Row) => row.decision === 'rejected' && !identityActions.has(row.id),
  )
  check(
    'rejected-island-boundaries',
    'Every rejected island geometry has a boundary patch.',
    rejected,
    row => validReplacements.has(row.id),
    'Every rejected island geometry has a patch that resolves to a valid replacement polygon.',
  )
  const missing = rejected.filter((row: Row) => !validReplacements.has(row.id))
  if (missing.length)
    result[result.length - 1]!.reason =
      `Missing or invalid replacement polygons for: ${missing.map((row: Row) => row.id).join(', ')}.`
  const recordsById = new Map(evidence.records.map(row => [row.id, row]))
  const memberships = new Map(
    (evidence.islandGroups ?? []).map(group => [group.divisionId, group.memberIds]),
  )
  check(
    'prepared-island-group-members',
    'Every island group has at least one island member.',
    evidence.records.filter(row => row.class === 'island_group'),
    row => {
      const members = memberships.get(row.id)
      return (
        Array.isArray(members) &&
        members.length > 0 &&
        new Set(members).size === members.length &&
        members.every(
          id =>
            id !== row.id &&
            ['major_island', 'minor_island', 'islet'].includes(
              recordsById.get(id)?.class,
            ),
        )
      )
    },
    'Every island group has members that resolve to islands in this release.',
  )
  return result
}
