/** Inclusive start and exclusive end, expressed as SaanSeoi release versions. */
export type CurationApplicability = { appliesFrom?: string; appliesUntil?: string }
const version = /^\d{4}-\d{2}-\d{2}\.\d+$/
const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
export function curationApplies(
  entry: CurationApplicability,
  release?: string,
): boolean {
  if (
    (entry.appliesFrom && !version.test(entry.appliesFrom)) ||
    (entry.appliesUntil && !version.test(entry.appliesUntil)) ||
    (entry.appliesFrom &&
      entry.appliesUntil &&
      compare(entry.appliesUntil, entry.appliesFrom) <= 0)
  )
    throw Error('Invalid curation release bounds.')
  if (!entry.appliesFrom && !entry.appliesUntil) return true
  if (!release || !version.test(release))
    throw Error('A release version is required for a bounded curation.')
  return (
    (!entry.appliesFrom || compare(release, entry.appliesFrom) >= 0) &&
    (!entry.appliesUntil || compare(release, entry.appliesUntil) < 0)
  )
}
export type ExclusionScope = 'result' | 'overture' | 'landsd'
export type ScopedExclusion = CurationApplicability & {
  divisionId: string
  scopes: string[]
  sourceRecordId?: string
  reviewId?: string
}
export function scopedExclusions<T extends ScopedExclusion>(
  entries: T[],
  scope: ExclusionScope,
  release?: string,
): T[] {
  for (const entry of entries) {
    if (
      !entry.scopes.length ||
      entry.scopes.some(value => !['result', 'overture', 'landsd'].includes(value))
    )
      throw Error(`Invalid exclusion scope: ${entry.divisionId}`)
  }
  return entries.filter(
    entry => entry.scopes.includes(scope) && curationApplies(entry, release),
  )
}
