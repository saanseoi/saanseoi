import { expect, test } from 'bun:test'
import {
  releaseCurationDecisions,
  type ReleaseCuration,
  type ReleaseCurationFixtures,
} from './releaseCurations'
import { reviewDivisionUpdates, divisionUpdateFingerprint } from './updateReview'
import additions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-additions.json'
import exclusions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-exclusions.json'
import names from '../../../../../../fixtures/meta/curations/saanseoi-division/division-names.json'
import type { ReviewDivision } from '@repo/core/pipeline/services/divisions/geographicReview'
const fixtures = { additions, exclusions, names } as unknown as ReleaseCurationFixtures
const policy = { coreLocales: ['en'], excludedNewNamePatterns: [] }
test('October instructions are inactive in September and carry exact evidence', () => {
  expect(releaseCurationDecisions(fixtures, '2026-09-01.0')).toEqual([])
  const decisions = releaseCurationDecisions(fixtures, '2026-10-01.0')
  expect(decisions).toHaveLength(4)
  const accepted = [...additions.releaseEntries, ...exclusions.releaseEntries].map(
    e => e.review.before,
  ) as unknown as ReviewDivision[]
  const result = reviewDivisionUpdates(accepted, [], policy, decisions)
  expect(result.pending).toHaveLength(0)
  expect(result.divisions.map(row => row.names.en).sort()).toEqual([
    'Hung Lung Hang',
    'Wan Tsai',
  ])
  const changed = structuredClone(accepted)
  changed[0]!.names.en = 'Changed source evidence'
  expect(reviewDivisionUpdates(changed, [], policy, decisions).pending).toHaveLength(1)
})
test('expiry is exclusive and altered evidence is rejected', () => {
  const entry = structuredClone(
    additions.releaseEntries[0],
  ) as unknown as ReleaseCuration
  entry.appliesUntil = '2026-11-01.0'
  const scoped = { additions: { releaseEntries: [entry] }, exclusions: {}, names: {} }
  expect(releaseCurationDecisions(scoped, '2026-10-01.0')).toHaveLength(1)
  expect(releaseCurationDecisions(scoped, '2026-11-01.0')).toHaveLength(0)
  entry.review.before = null
  expect(() => releaseCurationDecisions(scoped, '2026-10-01.0')).toThrow(
    'evidence mismatch',
  )
})
test('a release-scoped exclusion can reject a new source division', () => {
  const candidate = structuredClone(
    additions.releaseEntries[0]!.review.before,
  ) as unknown as ReviewDivision
  const change = {
    divisionId: candidate.id,
    field: '$record',
    before: null,
    proposed: candidate,
  }
  const entry: ReleaseCuration = {
    divisionId: candidate.id,
    appliesFrom: '2026-10-01.0',
    reason: 'Outside coverage',
    review: {
      kind: 'curation',
      guard: {
        id: 'division-source-updates',
        summary: 'Review changes',
        consequence: 'block-ingestion',
      },
      ...change,
      fingerprint: divisionUpdateFingerprint(change),
    },
  }
  const decisions = releaseCurationDecisions(
    { additions: {}, exclusions: { releaseEntries: [entry] }, names: {} },
    '2026-10-01.0',
  )
  const result = reviewDivisionUpdates([], [candidate], policy, decisions)
  expect(result.divisions).toEqual([])
  expect(result.events[0]?.status).toBe('delete')
})
test('fingerprints are independent of JSON property order', () => {
  expect(divisionUpdateFingerprint({ a: 1, b: { x: 1, y: 2 } })).toBe(
    divisionUpdateFingerprint({ b: { y: 2, x: 1 }, a: 1 }),
  )
})
test('a reviewed addition can explicitly include a new division excluded by a broad policy', () => {
  const candidate = structuredClone(
    additions.releaseEntries[0]!.review.before,
  ) as unknown as ReviewDivision
  const change = {
    divisionId: candidate.id,
    field: '$record',
    before: null,
    proposed: candidate,
  }
  const entry: ReleaseCuration = {
    divisionId: candidate.id,
    appliesFrom: '2026-10-01.0',
    reason: 'Reviewed inclusion',
    review: {
      kind: 'curation',
      guard: {
        id: 'division-source-updates',
        summary: 'Review changes',
        consequence: 'block-ingestion',
      },
      ...change,
      fingerprint: divisionUpdateFingerprint(change),
    },
  }
  const decisions = releaseCurationDecisions(
    { additions: { releaseEntries: [entry] }, exclusions: {}, names: {} },
    '2026-10-01.0',
  )
  const result = reviewDivisionUpdates(
    [],
    [candidate],
    { ...policy, excludedNewNamePatterns: ['.*'] },
    decisions,
  )
  expect(result.divisions).toEqual([candidate])
  expect(result.events[0]?.status).toBe('accept')
})
