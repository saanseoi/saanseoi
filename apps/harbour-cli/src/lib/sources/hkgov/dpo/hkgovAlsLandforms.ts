import type { DivisionHierarchies } from '@repo/db'

const isIslandClass = (value: string) =>
  value === 'major_island' || value === 'minor_island' || value === 'islet'

export type LandformLookup = Map<string, string | null>

/** Exact locale/name/district evidence only; conflicting or incomplete paths stay unset. */
export function addLandformLookup(
  lookup: LandformLookup,
  row: {
    id: string
    class: string
    locale: string
    name: string | null
    hierarchies?: DivisionHierarchies | string
  },
) {
  if (!row.name || !row.hierarchies) return
  const hierarchy: DivisionHierarchies =
    typeof row.hierarchies === 'string' ? JSON.parse(row.hierarchies) : row.hierarchies
  const paths = hierarchy.full
  if (!paths.length) return
  const candidates = paths.map(path => {
    const island = isIslandClass(row.class)
      ? row.id
      : path.findLast(entry => isIslandClass(entry.class))?.id
    const district = path.findLast(entry => entry.class === 'district')?.id
    return island && district ? { island, district } : null
  })
  const island = candidates[0]?.island
  if (!island || candidates.some(candidate => candidate?.island !== island)) return
  for (const candidate of candidates) {
    if (!candidate) continue
    const key = landformLookupKey(row.locale, row.name, candidate.district)
    lookup.set(key, lookup.has(key) && lookup.get(key) !== island ? null : island)
  }
}

function landformLookupKey(locale: string, name: string, districtId: string) {
  return JSON.stringify([locale, name.trim().toLocaleLowerCase('en'), districtId])
}

export function resolveAddressLandform(
  lookup: LandformLookup | undefined,
  districtId: string | null,
  names: { locale: string; name: unknown }[],
) {
  if (!lookup || !districtId) return null
  const ids = new Set<string>()
  for (const { locale, name } of names) {
    if (typeof name !== 'string' || !name.trim()) continue
    const key = landformLookupKey(locale, name, districtId)
    if (!lookup.has(key)) continue
    const id = lookup.get(key)
    if (!id) return null
    ids.add(id)
  }
  return ids.size === 1 ? [...ids][0]! : null
}
