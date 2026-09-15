/** Expand compact evidence references using the source selection of the requested snapshot. */
export function expandAddressSourceReferences(
  sources: unknown,
  specification: { snapshotId: string; datasetCode: string; sourceReleaseId?: string },
) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources))
    return sources ?? null
  return Object.fromEntries(
    Object.entries(sources).map(([kind, references]) => [
      kind,
      Array.isArray(references)
        ? references.map(reference => ({
            ...reference,
            dataset: specification.datasetCode,
            snapshotId: specification.snapshotId,
            ...(specification.sourceReleaseId
              ? { resourceReleaseId: specification.sourceReleaseId }
              : {}),
          }))
        : references,
    ]),
  )
}
