import { canonicalIdentifiers } from '@repo/core/pipeline/services/sources/canonicalIdentifiers'
export const LANDSD_NAME_MATCH_DISTANCE_METRES = 5000

/** Positive membership evidence only; unmatched records are not asserted absent. */
type Division = {
  id: string
  geometry?: unknown
  identifiers?: unknown
  sources?: unknown
}
type Name = {
  divisionId: string
  locale: string
  name: string
  nameAlts?: string | null
}
const object = (value: unknown): Record<string, any> =>
  typeof value === 'string'
    ? JSON.parse(value)
    : (structuredClone(value ?? {}) as Record<string, any>)
const normalise = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ')
function point(row: Division): number[] | null {
  const geometry = object(row.geometry)
  return geometry.type === 'Point' ? geometry.coordinates : null
}
function nearby(a: Division, b: Division) {
  const p = point(a),
    q = point(b)
  if (!p || !q) return false
  const dy = (p[1]! - q[1]!) * 111320
  const dx = (p[0]! - q[0]!) * 111320 * Math.cos((p[1]! * Math.PI) / 180)
  return Math.hypot(dx, dy) <= LANDSD_NAME_MATCH_DISTANCE_METRES
}
export function attachIngredientMembership<T extends Division>(args: {
  divisions: T[]
  names: Name[]
  landsd: Division[]
  landsdNames: Name[]
  landsdRelease: string
  overtureIds: Set<string>
  overtureRelease: string
  excludedSourceIds?: ReadonlySet<string>
}) {
  const curatedNames = membershipNameIndex(args.names),
    nativeNames = membershipNameIndex(args.landsdNames)
  const candidates = new Map<string, Division[]>()
  for (const division of args.divisions) {
    const identifiers = canonicalIdentifiers(division.identifiers)
    const curatedIslandSourceId = object(identifiers?.saanseoiIsland).sourceId
    const explicit =
      identifiers?.['LANDSD:GEO_NAME_ID'] ??
      (typeof curatedIslandSourceId === 'string' &&
      curatedIslandSourceId.startsWith('LANDSD:PLACE_NAME:')
        ? curatedIslandSourceId.slice('LANDSD:PLACE_NAME:'.length)
        : undefined)
    const labels = curatedNames.get(division.id)
    candidates.set(
      division.id,
      args.landsd.filter(native => {
        if (args.excludedSourceIds?.has(native.id)) return false
        const key = canonicalIdentifiers(native.identifiers)?.['LANDSD:GEO_NAME_ID']
        if (!key) return false
        if (explicit) return explicit === key
        const upstream = nativeNames.get(native.id)
        return membershipNamesMatch(labels, upstream) && nearby(division, native)
      }),
    )
  }
  const owners = new Map<string, number>()
  for (const matches of candidates.values())
    if (matches.length === 1)
      owners.set(matches[0]!.id, (owners.get(matches[0]!.id) ?? 0) + 1)
  let matched = 0
  const divisions = args.divisions.map(division => {
    const sources = object(division.sources),
      identifiers = canonicalIdentifiers(division.identifiers) ?? {}
    if (args.overtureIds.has(division.id))
      sources.overture = [
        ...(Array.isArray(sources.overture) ? sources.overture : []).filter(
          (s: any) => !s.contributions?.includes('membership'),
        ),
        {
          dataset: 'ds-hk-overture-division',
          recordId: division.id,
          release: args.overtureRelease,
          contributions: ['identity'],
        },
      ]
    const matches = candidates.get(division.id) ?? []
    if (matches.length === 1 && owners.get(matches[0]!.id) === 1) {
      const geoNameId = canonicalIdentifiers(matches[0]!.identifiers)![
        'LANDSD:GEO_NAME_ID'
      ]
      identifiers['LANDSD:GEO_NAME_ID'] = geoNameId
      // Dataset presence is represented by the external identifier. It does not
      // assert that names or geometry were taken from this matching record.

      matched++
    }
    return { ...division, identifiers, sources }
  })
  return { divisions, matched, unresolved: args.divisions.length - matched }
}

export function membershipNameIndex(rows: Name[]) {
  const result = new Map<string, Map<string, Set<string>>>()
  for (const row of rows) {
    const entry = result.get(row.divisionId) ?? new Map<string, Set<string>>()
    const labels = entry.get(row.locale) ?? new Set<string>()
    for (const value of [row.name, ...(row.nameAlts?.split('|') ?? [])])
      if (value) labels.add(normalise(value))
    entry.set(row.locale, labels)
    result.set(row.divisionId, entry)
  }
  return result
}

export function membershipNamesMatch(
  left: Map<string, Set<string>> | undefined,
  right: Map<string, Set<string>> | undefined,
) {
  return ['en', 'zh-hant'].every(locale =>
    [...(left?.get(locale) ?? [])].some(name => right?.get(locale)?.has(name)),
  )
}
