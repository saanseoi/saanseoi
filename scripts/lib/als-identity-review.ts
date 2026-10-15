export type IdentityRecord = {
  id: string
  identityKey: string
  continuityKey: string
  sourceVersion: string
  summary: Record<string, string | null>
}

export type IdentityReview = {
  schemaVersion: 1
  sourceVersion: string
  reviewSha256: string
  preparedSha256: string
  address3dSha256: string
  otherIssueCount: number
  cases: { id: string; previous: IdentityRecord; current: IdentityRecord }[]
}

export type IdentityChoice = {
  caseId: string
  previousIdentityKey: string
  currentIdentityKey: string
  resolution: 'keep-existing-id' | 'new-id' | 'investigate'
  notes: string
}

export type IdentityReviewExport = {
  schemaVersion: 1
  sourceVersion: string
  reviewSha256: string
  reviewer: string
  decisions: IdentityChoice[]
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a review object.')
  return value as Record<string, unknown>
}
const digest = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function assertSourceVersion(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(value))
    throw new Error('Choose an exact ALS source version, such as 2024-07-31.0.')
}

function record(value: unknown): IdentityRecord {
  const row = object(value)
  for (const field of ['id', 'identityKey', 'continuityKey', 'sourceVersion'])
    if (typeof row[field] !== 'string' || !row[field])
      throw new Error(`Identity evidence is missing ${field}.`)
  assertSourceVersion(row.sourceVersion)
  if (Object.values(object(row.summary)).some(v => v !== null && typeof v !== 'string'))
    throw new Error('Invalid identity summary.')
  return row as IdentityRecord
}

/** Project exact sealed cases; other issue types remain visible and blocking. */
export function buildIdentityReview(
  value: unknown,
  reviewSha256: string,
): IdentityReview {
  const input = object(value)
  assertSourceVersion(input.sourceVersion)
  if (
    input.schemaVersion !== 1 ||
    !Array.isArray(input.issues) ||
    ![reviewSha256, input.preparedSha256, input.address3dSha256].every(digest)
  )
    throw new Error('Invalid sealed ALS review.')
  const cases: IdentityReview['cases'] = []
  let otherIssueCount = 0
  for (const issue of input.issues) {
    const row = object(issue)
    if (row.code !== 'identity-drift') {
      otherIssueCount++
      continue
    }
    const evidence = object(row.evidence)
    const previous = record(evidence.previous),
      current = record(evidence.current)
    if (
      current.sourceVersion !== input.sourceVersion ||
      previous.sourceVersion.localeCompare(current.sourceVersion, 'en', {
        numeric: true,
      }) >= 0 ||
      previous.identityKey === current.identityKey ||
      cases.some(c => c.id === current.id)
    )
      throw new Error('Ambiguous or inconsistent identity cases.')
    cases.push({ id: current.id, previous, current })
  }
  return {
    schemaVersion: 1,
    sourceVersion: input.sourceVersion,
    reviewSha256,
    preparedSha256: input.preparedSha256 as string,
    address3dSha256: input.address3dSha256 as string,
    otherIssueCount,
    cases,
  }
}

/** Used by browser import and CLI; stale, partial and foreign decisions cannot apply. */
export function validateIdentityReviewExport(
  value: unknown,
  review: IdentityReview,
): IdentityReviewExport {
  const input = object(value)
  if (
    input.schemaVersion !== 1 ||
    input.sourceVersion !== review.sourceVersion ||
    input.reviewSha256 !== review.reviewSha256
  )
    throw new Error('This export belongs to different or changed review evidence.')
  if (typeof input.reviewer !== 'string' || !input.reviewer.trim())
    throw new Error('Enter the reviewer name.')
  if (!Array.isArray(input.decisions) || input.decisions.length !== review.cases.length)
    throw new Error('Export must contain exactly one decision for every case.')
  const seen = new Set<string>()
  const decisions = input.decisions.map(value => {
    const choice = object(value)
    const item = review.cases.find(c => c.id === choice.caseId)
    if (
      !item ||
      seen.has(item.id) ||
      choice.previousIdentityKey !== item.previous.identityKey ||
      choice.currentIdentityKey !== item.current.identityKey
    )
      throw new Error('Duplicate, altered or foreign identity decision.')
    seen.add(item.id)
    if (
      typeof choice.resolution !== 'string' ||
      !['keep-existing-id', 'new-id', 'investigate'].includes(choice.resolution) ||
      typeof choice.notes !== 'string' ||
      !choice.notes.trim()
    )
      throw new Error('Choose a resolution and add an evidence note for every case.')
    return choice as IdentityChoice
  })
  return {
    schemaVersion: 1,
    sourceVersion: review.sourceVersion,
    reviewSha256: review.reviewSha256,
    reviewer: input.reviewer.trim(),
    decisions,
  }
}

type StoredIdentityDecision = {
  previousIdentityKey: string
  currentIdentityKey: string
  resolution: string
  review?: {
    sourceVersion: string
    reviewSha256: string
    reviewer: string
    notes: string
  }
}

export function mergeIdentityDecisions<
  T extends { decisions: StoredIdentityDecision[] },
>(
  fixture: T,
  exported: IdentityReviewExport,
  review: IdentityReview,
): Omit<T, 'decisions'> & { decisions: StoredIdentityDecision[] } {
  const checked = validateIdentityReviewExport(exported, review)
  if (
    review.otherIssueCount ||
    checked.decisions.some(d => d.resolution === 'investigate')
  )
    throw new Error(
      'Unresolved investigations or other review issues still block ingestion.',
    )
  const decisions: StoredIdentityDecision[] = [...fixture.decisions]
  for (const choice of checked.decisions) {
    const existing = decisions.find(
      d =>
        d.previousIdentityKey === choice.previousIdentityKey &&
        d.currentIdentityKey === choice.currentIdentityKey,
    )
    if (existing && existing.resolution !== choice.resolution)
      throw new Error(
        'A conflicting identity decision already exists; review it explicitly.',
      )
    if (!existing)
      decisions.push({
        previousIdentityKey: choice.previousIdentityKey,
        currentIdentityKey: choice.currentIdentityKey,
        resolution: choice.resolution,
        // Keep the human rationale with the decision consumed by ingestion.
        review: {
          sourceVersion: checked.sourceVersion,
          reviewSha256: checked.reviewSha256,
          reviewer: checked.reviewer,
          notes: choice.notes.trim(),
        },
      })
  }
  return { ...fixture, decisions }
}
