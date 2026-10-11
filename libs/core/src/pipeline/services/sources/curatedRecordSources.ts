/** Record references only. Processing rules belong to release-set field provenance. */
export type CuratedRecordSource = {
  dataset: string
  recordId: string
  componentIndexes?: number[]
}

const authoredCurations = new Set([
  'division-geometry',
  'division-additions',
  'division-names',
  'division-update-policy',
])

export function curatedRecordSources(
  value: unknown,
  ownerId: string,
): Record<string, CuratedRecordSource[]> {
  const sources = typeof value === 'string' ? JSON.parse(value) : value
  const result: Record<string, CuratedRecordSource[]> = {}
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return result
  for (const [provider, references] of Object.entries(sources)) {
    if (!Array.isArray(references))
      throw Error(`Invalid source references: ${provider}`)
    const unique = new Map<string, CuratedRecordSource>()
    for (const reference of references) {
      if (!reference || typeof reference !== 'object')
        throw Error('Invalid source reference')
      if (
        provider === 'saanseoi' &&
        (reference.method || reference.islandGroup || reference.geometryPartition)
      )
        continue
      // External lookups without a retained dataset belong to field provenance.
      if (!reference.dataset) continue
      let recordId = reference.recordId ?? reference.record_id
      if (reference.curation) {
        if (provider !== 'saanseoi' || !authoredCurations.has(reference.curation))
          continue
        // An authored assertion belongs to this retained record, not a review alias.
        recordId = ownerId
      }
      if (
        typeof reference.dataset !== 'string' ||
        !reference.dataset ||
        typeof recordId !== 'string' ||
        !recordId
      )
        throw Error(
          `Source reference requires dataset and recordId: ${ownerId}/${provider}/${JSON.stringify(reference)}`,
        )
      const next: CuratedRecordSource = { dataset: reference.dataset, recordId }
      if (reference.componentIndexes !== undefined) {
        const indexes = reference.componentIndexes
        if (
          !Array.isArray(indexes) ||
          !indexes.length ||
          indexes.some(
            (index, i) =>
              !Number.isInteger(index) ||
              index < 0 ||
              (i > 0 && index <= indexes[i - 1]),
          )
        )
          throw Error('Invalid source component indexes')
        next.componentIndexes = [...indexes]
      }
      unique.set(JSON.stringify(next), next)
    }
    if (unique.size) result[provider] = [...unique.values()]
  }
  return result
}
