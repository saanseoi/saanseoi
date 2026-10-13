import type { StagedAddressResolution } from './supplementaryPlaceAddress.ts'

export type PlaceAddressReviewReference = ReturnType<typeof placeAddressReviewReference>

/** Require pinned lookup scopes and reject copied payloads at the archive boundary. */
export function validatePlaceAddressReviewReport(report: {
  version?: unknown
  placeReleaseId?: unknown
  addressSnapshotId?: unknown
  sourceRelease?: unknown
  unresolvedCount?: unknown
  results?: unknown
}) {
  const nonempty = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0
  const allowed = new Set([
    'placeId',
    'fingerprint',
    'tier',
    'addressId',
    'reason',
    'candidateAddressIds',
    'previousAddressId',
    'previousAddressSnapshotId',
  ])
  if (
    report.version !== 2 ||
    !nonempty(report.placeReleaseId) ||
    !nonempty(report.addressSnapshotId) ||
    !nonempty(report.sourceRelease) ||
    !Number.isSafeInteger(report.unresolvedCount) ||
    !Array.isArray(report.results) ||
    report.results.length !== report.unresolvedCount ||
    report.results.some(
      row =>
        !row ||
        typeof row !== 'object' ||
        Object.keys(row).some(key => !allowed.has(key)) ||
        row.tier !== 'review' ||
        row.addressId !== null ||
        !nonempty(row.placeId) ||
        !nonempty(row.fingerprint) ||
        !nonempty(row.reason) ||
        !Array.isArray(row.candidateAddressIds) ||
        !row.candidateAddressIds.every(nonempty) ||
        new Set(row.candidateAddressIds).size !== row.candidateAddressIds.length ||
        (row.previousAddressId !== undefined && !nonempty(row.previousAddressId)) ||
        (row.previousAddressSnapshotId !== undefined &&
          !nonempty(row.previousAddressSnapshotId)),
    )
  )
    throw new Error('Invalid unresolved Place Address reference report.')
  const ids = report.results.map(row => row.placeId)
  if (new Set(ids).size !== ids.length)
    throw new Error(
      'Invalid unresolved Place Address reference report: duplicate Place.',
    )
}

/** IDs are resolved against the report's Place release and Address snapshot. */
export function placeAddressReviewReference(row: StagedAddressResolution) {
  if (!['review', 'investigation'].includes(row.tier) || row.addressId !== null)
    throw new Error('Only unresolved Place Address cases can become review references.')
  return {
    placeId: row.placeId,
    fingerprint: row.fingerprint,
    tier: row.tier,
    addressId: null,
    reason: row.reason,
    candidateAddressIds: [
      ...new Set(row.candidates.map(candidate => candidate.addressId)),
    ].sort(),
    ...(row.previous
      ? {
          previousAddressId: row.previous.addressId,
          ...('addressSnapshotId' in row.previous && row.previous.addressSnapshotId
            ? { previousAddressSnapshotId: row.previous.addressSnapshotId }
            : {}),
        }
      : {}),
    ...(row.investigation ? { investigation: row.investigation } : {}),
  }
}
