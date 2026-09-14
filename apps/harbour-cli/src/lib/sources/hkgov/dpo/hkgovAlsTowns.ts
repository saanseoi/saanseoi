import type { DivisionHierarchies } from '@repo/db'

export type TownLookup = Map<string, string | null>

const key = (locale: string, name: string, district: string) =>
  JSON.stringify([
    locale,
    name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en'),
    district,
  ])

/** Only named towns with complete district ancestry qualify. */
export function addTownLookup(
  lookup: TownLookup,
  row: {
    id: string
    class: string
    locale: string
    name: string | null
    hierarchies?: DivisionHierarchies | string
  },
) {
  if (row.class !== 'town' || !row.name || !row.hierarchies) return
  const hierarchy: DivisionHierarchies =
    typeof row.hierarchies === 'string' ? JSON.parse(row.hierarchies) : row.hierarchies
  const districts = hierarchy.full.map(
    path => path.findLast(entry => entry.class === 'district')?.id,
  )
  if (!districts.length || districts.some(id => !id)) return
  for (const district of districts) {
    const lookupKey = key(row.locale, row.name, district!)
    lookup.set(
      lookupKey,
      lookup.has(lookupKey) && lookup.get(lookupKey) !== row.id ? null : row.id,
    )
  }
}

export function resolveAddressTown(
  lookup: TownLookup | undefined,
  districtId: string | null,
  names: { locale: string; name: unknown }[],
) {
  if (!lookup || !districtId) return null
  const ids = new Set<string>()
  for (const { locale, name } of names) {
    if (typeof name !== 'string' || !name.trim()) continue
    const lookupKey = key(locale, name, districtId)
    if (!lookup.has(lookupKey)) continue
    const id = lookup.get(lookupKey)
    if (!id) return null
    ids.add(id)
  }
  return ids.size === 1 ? [...ids][0]! : null
}
