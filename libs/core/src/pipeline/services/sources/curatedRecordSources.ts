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
      // Canonical publisher attribution can be carried through the grouped
      // assembly workspace alongside internal curation evidence.
      if (reference.publisher !== undefined) {
        if (reference.publisher !== provider)
          throw Error(`Source attribution publisher mismatch: ${provider}`)
        const [attribution] = readSourceAttributions([reference])
        result.set(JSON.stringify(attribution), attribution!)
        continue
      }
      // External lookups without a retained dataset belong to field provenance.
      if (!reference.dataset) continue
      const recordId = reference.recordId ?? reference.record_id
      // Selecting another publisher's geometry does not make it SaanSeoi-authored.
      if (
        provider === 'saanseoi' &&
        reference.contributions?.length &&
        reference.contributions.every((role: string) => role === 'selection')
      )
        continue
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
        publisher: provider,
        dataset: reference.dataset,
        recordId,
      }
      result.set(JSON.stringify(next), next)
    }
  }
  return [...result.values()]
}
