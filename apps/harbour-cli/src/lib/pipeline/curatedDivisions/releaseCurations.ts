import { divisionUpdateFingerprint, type UpdateDecision } from './updateReview'

type Review = {
  kind: 'curation'
  guard: {
    id: 'division-source-updates'
    summary: string
    consequence: 'block-ingestion'
  }
  fingerprint: string
  field: string
  before: unknown
  proposed: unknown
}
export type ReleaseCuration = {
  divisionId: string
  appliesFrom: string
  appliesUntil?: string
  reason: string
  review: Review
}
export type ReleaseCurationFixtures = {
  additions: { releaseEntries?: ReleaseCuration[] }
  exclusions: { releaseEntries?: ReleaseCuration[] }
  names: { releaseEntries?: Array<ReleaseCuration & { decision: 'keep' | 'accept' }> }
}
const version = /^\d{4}-\d{2}-\d{2}\.\d+$/
const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })
/** Release bounds select instructions; the fingerprint still binds the exact source change. */
export function releaseCurationDecisions(
  fixtures: ReleaseCurationFixtures,
  release: string,
): UpdateDecision[] {
  if (!version.test(release)) throw Error(`Invalid curation release: ${release}`)
  return (['additions', 'exclusions', 'names'] as const).flatMap(type =>
    (fixtures[type].releaseEntries ?? []).flatMap(entry => {
      if (
        !version.test(entry.appliesFrom) ||
        (entry.appliesUntil &&
          (!version.test(entry.appliesUntil) ||
            compare(entry.appliesUntil, entry.appliesFrom) <= 0))
      )
        throw Error(`Invalid curation applicability: ${entry.divisionId}`)
      const review = entry.review
      if (
        !entry.reason.trim() ||
        review.kind !== 'curation' ||
        review.guard.id !== 'division-source-updates' ||
        (type === 'names'
          ? !/^names\.[^.]+\.name$/.test(review.field)
          : review.field !== '$record')
      )
        throw Error(`Invalid release curation: ${entry.divisionId}`)
      const fingerprint = divisionUpdateFingerprint({
        divisionId: entry.divisionId,
        field: review.field,
        before: review.before,
        proposed: review.proposed,
      })
      if (fingerprint !== review.fingerprint)
        throw Error(`Curation evidence mismatch: ${entry.divisionId}`)
      if (
        compare(release, entry.appliesFrom) < 0 ||
        (entry.appliesUntil && compare(release, entry.appliesUntil) >= 0)
      )
        return []
      const action =
        type === 'additions'
          ? review.before === null
            ? 'accept'
            : 'keep'
          : type === 'exclusions'
            ? 'delete'
            : (entry as ReleaseCuration & { decision: 'keep' | 'accept' }).decision
      if (!['keep', 'delete', 'accept'].includes(action))
        throw Error(`Invalid curation decision: ${entry.divisionId}`)
      return [{ fingerprint, action, reason: entry.reason }]
    }),
  )
}
