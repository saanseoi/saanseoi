import { expect, test } from 'bun:test'
import {
  resolveHkgovAlsIdentityDrift,
  type HkgovAlsIdentityRecord,
} from '../../apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsDrift'
import {
  buildIdentityReview,
  mergeIdentityDecisions,
  validateIdentityReviewExport,
} from './als-identity-review'

const sha = 'a'.repeat(64)
const record = (id: string, sourceVersion: string) => ({
  id,
  identityKey: `identity-${id}`,
  continuityKey: 'anchor',
  sourceVersion,
  summary: { buildingName: id, longitude: '114.1', latitude: '22.3' },
})
const sealed = {
  schemaVersion: 1 as const,
  sourceVersion: '2024-07-31.0',
  preparedSha256: sha,
  address3dSha256: sha,
  issues: [
    {
      code: 'identity-drift',
      evidence: {
        previous: record('old', '2024-07-25.0'),
        current: record('new', '2024-07-31.0'),
      },
    },
  ],
}
const review = buildIdentityReview(sealed, sha)
const exported = {
  schemaVersion: 1 as const,
  sourceVersion: review.sourceVersion,
  reviewSha256: sha,
  decisions: [
    {
      caseId: 'new',
      previousIdentityKey: 'identity-old',
      currentIdentityKey: 'identity-new',
      resolution: 'keep-existing-id',
      notes: 'Same exact source anchor and independently checked premise.',
    },
  ],
}
const valid = () => validateIdentityReviewExport(exported, review)

test('reviewed decisions drive the ingestion resolver without unresolved drift', () => {
  const item = review.cases[0]!
  for (const resolution of ['keep-existing-id', 'new-id'] as const) {
    const checked = validateIdentityReviewExport(
      { ...exported, decisions: [{ ...exported.decisions[0], resolution }] },
      review,
    )
    const merged = mergeIdentityDecisions(
      { authority: 'hkgov-dpo' as const, version: 1 as const, decisions: [] },
      checked,
      review,
    )
    const result = resolveHkgovAlsIdentityDrift(
      [item.current as HkgovAlsIdentityRecord],
      {
        authority: 'hkgov-dpo',
        version: 1,
        entries: [item.previous as HkgovAlsIdentityRecord],
      },
      {
        ...merged,
        decisions: merged.decisions.map(d => ({
          ...d,
          resolution: d.resolution as 'keep-existing-id' | 'new-id',
        })),
      },
    )
    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(item.current.identityKey)).toBe(
      resolution === 'keep-existing-id' ? item.previous.id : undefined,
    )
  }
})

test('applies only the exact reviewed pair and retains rationale with existing decisions', () => {
  const fixture = {
    authority: 'hkgov-dpo',
    version: 1,
    decisions: [
      {
        previousIdentityKey: 'other-old',
        currentIdentityKey: 'other-new',
        resolution: 'new-id',
      },
    ],
  }
  const result = mergeIdentityDecisions(fixture, valid(), review)
  expect(fixture.decisions).toHaveLength(1)
  expect(result.decisions).toHaveLength(2)
  expect(result.decisions[0]).toEqual(fixture.decisions[0])
  expect(result.decisions[1]).toMatchObject({
    resolution: 'keep-existing-id',
    review: { notes: exported.decisions[0]!.notes },
  })
  expect(mergeIdentityDecisions(result, valid(), review)).toEqual(result)
})

test('rejects stale evidence, forged pairs, duplicates and malformed notes', () => {
  for (const invalid of [
    { ...exported, reviewSha256: 'b'.repeat(64) },
    { ...exported, sourceVersion: '2024-08-21.0' },
    { ...exported, decisions: [...exported.decisions, ...exported.decisions] },
    ...[
      { caseId: 'foreign' },
      { currentIdentityKey: 'forged' },
      { previousIdentityKey: 'forged' },
      { resolution: 'auto-approve' },
      { resolution: ['new-id'] },
      { notes: 12 },
    ].map(patch => ({
      ...exported,
      decisions: [{ ...exported.decisions[0], ...patch }],
    })),
  ])
    expect(() => validateIdentityReviewExport(invalid, review)).toThrow()
  const twoCases = {
    ...review,
    cases: [...review.cases, { ...review.cases[0]!, id: 'second' }],
  }
  expect(() =>
    validateIdentityReviewExport(
      { ...exported, decisions: [...exported.decisions, ...exported.decisions] },
      twoCases,
    ),
  ).toThrow('Duplicate')
})

test('investigations export without approving ingestion and conflicts cannot overwrite decisions', () => {
  const investigating = validateIdentityReviewExport(
    {
      ...exported,
      decisions: [{ ...exported.decisions[0], resolution: 'investigate' }],
    },
    review,
  )
  expect(
    mergeIdentityDecisions({ decisions: [] }, investigating, review).decisions,
  ).toEqual([])
  expect(() =>
    mergeIdentityDecisions(
      {
        decisions: [
          {
            previousIdentityKey: 'identity-old',
            currentIdentityKey: 'identity-new',
            resolution: 'new-id',
          },
        ],
      },
      valid(),
      review,
    ),
  ).toThrow('conflicting')
  expect(
    mergeIdentityDecisions({ decisions: [] }, valid(), {
      ...review,
      otherIssueCount: 1,
    }).decisions,
  ).toHaveLength(1)
})

test('rejects inconsistent sealed evidence and counts unsupported preparation issues', () => {
  expect(() =>
    buildIdentityReview(
      { ...sealed, issues: [...sealed.issues, ...sealed.issues] },
      sha,
    ),
  ).toThrow('Ambiguous')
  expect(() =>
    buildIdentityReview({ ...sealed, sourceVersion: '../secret' }, sha),
  ).toThrow('exact ALS')
  expect(() => buildIdentityReview({ ...sealed, preparedSha256: '' }, sha)).toThrow(
    'Invalid sealed',
  )
  expect(
    buildIdentityReview(
      { ...sealed, issues: [...sealed.issues, { code: 'division-linkage' }] },
      sha,
    ).otherIssueCount,
  ).toBe(1)
})

test('accepts empty and partial exports without names or explanations, leaving omitted drift unresolved', () => {
  const second = {
    id: 'second',
    previous: { ...record('older', '2024-07-25.0'), continuityKey: 'second-anchor' },
    current: { ...record('second', '2024-07-31.0'), continuityKey: 'second-anchor' },
  }
  const partialReview = { ...review, cases: [...review.cases, second] }
  expect(
    validateIdentityReviewExport({ ...exported, decisions: [] }, partialReview)
      .decisions,
  ).toEqual([])
  const { notes, ...choice } = exported.decisions[0]!
  for (const optional of [{}, { notes: '' }, { notes: '  ' }]) {
    const checked = validateIdentityReviewExport(
      {
        ...exported,
        reviewer: 'Discard this name',
        decisions: [{ ...choice, ...optional, reviewer: 'Discard this too' }],
      },
      partialReview,
    )
    expect(JSON.stringify(checked)).not.toContain('reviewer')
    expect(checked.decisions[0]).not.toHaveProperty('notes')
    const merged = mergeIdentityDecisions({ decisions: [] }, checked, partialReview)
    expect(merged.decisions).toHaveLength(1)
    const result = resolveHkgovAlsIdentityDrift(
      partialReview.cases.map(c => c.current),
      {
        authority: 'hkgov-dpo',
        version: 1,
        entries: partialReview.cases.map(c => c.previous),
      },
      { authority: 'hkgov-dpo', version: 1, decisions: merged.decisions as any },
    )
    expect(result.candidates.map(c => c.current.id)).toEqual(['second'])
  }
})

test('strips stored reviewer attribution while preserving decisions and optional notes', () => {
  const decision = {
    previousIdentityKey: 'old',
    currentIdentityKey: 'new',
    resolution: 'new-id',
    review: {
      sourceVersion: review.sourceVersion,
      reviewSha256: sha,
      reviewer: 'Remove me',
      notes: 'Retain this evidence',
    },
  }
  const merged = mergeIdentityDecisions(
    { decisions: [decision] },
    { ...exported, decisions: [] },
    review,
  )
  expect(merged.decisions[0]?.review).toEqual({
    sourceVersion: review.sourceVersion,
    reviewSha256: sha,
    notes: 'Retain this evidence',
  })
  expect(decision.review.reviewer).toBe('Remove me')
})
