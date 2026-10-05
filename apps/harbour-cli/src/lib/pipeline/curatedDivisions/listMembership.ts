import bounds from '../../../../../../fixtures/meta/curations/saanseoi-division/division-bounds-overrides.json'
import matches from '../../../../../../fixtures/meta/curations/saanseoi-division/division-identity-matches.json'
const crosswalk = matches.sourceMemberships.rvd
const object = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v)

export function applyCuratedBounds(divisions: any[]) {
  for (const entry of bounds.entries) {
    const row = divisions.find(row => row.id === entry.divisionId)
    if (!row) throw Error(`Missing bounds target ${entry.divisionId}`)
    if (!row.bbox) {
      row.bbox = entry.bbox
      const { publisher, ...source } = entry.source
      row.sources = { ...object(row.sources), [publisher]: [source] }
    }
  }
}

/** List inclusion is source evidence; it does not assert current spatial parentage. */
export function applyRvdMembership(
  divisions: any[],
  records: any[],
  releaseCode: string,
) {
  if (releaseCode !== crosswalk.sourceRelease)
    throw Error('RVD crosswalk release mismatch.')
  const byId = new Map(divisions.map(row => [row.id, row]))
  const native = new Map(
    records.map(row => [row.sourceRecordId, object(row.properties)]),
  )
  for (const entry of crosswalk.entries) {
    const row = byId.get(entry.divisionId),
      source = native.get(entry.sourceRecordId)
    if (!row || !source)
      throw Error(`Missing RVD membership target or evidence: ${entry.sourceRecordId}`)
    const path =
      source.kind === 'area'
        ? source.areaCode
        : source.kind === 'district'
          ? `${source.areaCode}:${source.districtCode}`
          : `${source.areaCode}:${source.districtCode}:${row.divisionCode}`
    if (!row.divisionCode) throw Error(`Missing curated membership code: ${row.id}`)
    row.memberships = [
      ...(row.memberships ?? []),
      {
        collection: 'rvd-areas-and-districts',
        dataset: 'ds-hk-hkgov-rvd-division',
        release: releaseCode,
        recordId: entry.sourceRecordId,
        key: path,
        keyAuthority: 'saanseoi',
        ...(source.includedIn ? { includedIn: source.includedIn } : {}),
      },
    ]
  }
  return { matched: crosswalk.entries.length, unmatched: crosswalk.unmatched }
}
