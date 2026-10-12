import type { SourceAttribution } from '@repo/db'
import mappings from '../../../../../../fixtures/meta/sourceAttributions/overture.json'

const datasets = new Map(
  mappings.datasets.flatMap(mapping =>
    mapping.names.map(name => [name, mapping] as const),
  ),
)
const pointer = /^(?:\/(?:[^~/]|~[01])*)*$/

/** Normalise publisher attribution only; preparation and decision evidence stays outside it. */
export function normaliseOvertureAttribution(value: unknown): SourceAttribution[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Overture attribution must be an array.')
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Invalid Overture attribution item.')
    const source = item as Record<string, unknown>
    const mapping = datasets.get(String(source.dataset))
    if (!mapping)
      throw new Error(`Unregistered upstream attribution dataset: ${source.dataset}`)
    const result: SourceAttribution = {
      publisherCode: mapping.publisherCode,
      dataset: mapping.dataset,
    }
    if (source.property !== undefined) {
      if (
        source.property !== null &&
        (typeof source.property !== 'string' || !pointer.test(source.property))
      )
        throw new Error('Source property must be an RFC 6901 JSON Pointer.')
      result.property = source.property as string | null
    }
    for (const [upstream, field] of [
      ['record_id', 'recordId'],
      ['update_time', 'updateTime'],
      ['version', 'version'],
      ['license', 'license'],
    ] as const) {
      const nativeValue = source[upstream]
      const retainedValue = source[field]
      if (nativeValue != null && retainedValue != null && nativeValue !== retainedValue)
        throw new Error(`Conflicting source ${upstream} and ${field}.`)
      const input = nativeValue ?? retainedValue
      if (input === null || input === undefined) continue
      if (
        typeof input !== 'string' &&
        !(field === 'version' && typeof input === 'number' && Number.isFinite(input))
      )
        throw new Error(
          `Source ${upstream} must be a string${field === 'version' ? ' or finite number' : ''}.`,
        )
      result[field] = String(input)
    }
    if (source.confidence !== null && source.confidence !== undefined) {
      if (
        typeof source.confidence !== 'number' ||
        !Number.isFinite(source.confidence) ||
        source.confidence < 0 ||
        source.confidence > 1
      )
        throw new Error('Source confidence must be between zero and one.')
      result.confidence = source.confidence
    }
    return result
  })
}
