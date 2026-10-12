import type { SourceAttribution } from '@repo/db'
import { readSourceAttributions } from './sourceAttribution'

export function curatedRecordSources(
  value: unknown,
  ownerId: string,
): SourceAttribution[] {
  const sources = typeof value === 'string' ? JSON.parse(value) : value
  const result = new Map<string, SourceAttribution>()
  if (!sources || typeof sources !== 'object') return []
  if (Array.isArray(sources)) return readSourceAttributions(sources)
  for (const [provider, references] of Object.entries(sources)) {
    if (!Array.isArray(references))
      throw Error(`Invalid source references: ${provider}`)
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
      const recordId = reference.recordId ?? reference.record_id
      if (reference.curation) {
        continue
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
      const next: SourceAttribution = {
        publisherCode: provider,
        dataset: reference.dataset,
        recordId,
      }
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
      }
      result.set(JSON.stringify(next), next)
    }
  }
  return [...result.values()]
}
