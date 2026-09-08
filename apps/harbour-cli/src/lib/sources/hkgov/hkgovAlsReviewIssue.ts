export type AlsReviewIssue = {
  sourceVersion: string
  sourceFile: string
  featureIndexOneBased: number
  code:
    | 'ambiguous-block-parent'
    | 'unreviewed-section-inventory'
    | 'shared-building-owners'
  estate: string | null
  building: string | null
  csu: string | null
  candidateAddressIds: string[]
}

/** Machine-readable line retained by the ingestion log without approving an identity. */
export function reportAlsReviewIssue(
  issue: AlsReviewIssue | AlsCurationGuardIssue,
  warn: (line: string) => void = console.warn,
) {
  warn(`ALS_MANUAL_REVIEW ${JSON.stringify({ ...issue, status: 'unresolved' })}`)
}

export type AlsCurationGuardIssue = {
  code: 'curation-guard-mismatch'
  sourceVersion: string
  curationFile: string
  decisionId: string
  message: string
}

/** A skipped guard is an unresolved correction, not a verified source change. */
export function reportAlsCurationGuard(
  sourceVersion: string,
  curationFile: string,
  decisionId: string,
  error: Error,
) {
  reportAlsReviewIssue({
    code: 'curation-guard-mismatch',
    sourceVersion,
    curationFile,
    decisionId,
    message: error.message,
  })
}
