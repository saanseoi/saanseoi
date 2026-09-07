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
  issue: AlsReviewIssue,
  warn: (line: string) => void = console.warn,
) {
  warn(`ALS_MANUAL_REVIEW ${JSON.stringify({ ...issue, status: 'unresolved' })}`)
}
