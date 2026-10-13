import {
  orderSourceAttribution,
  sourceAttributionFieldOrder,
  type SourceAttribution,
} from '@repo/db'
import mappings from '../../../../../../fixtures/meta/sourceAttributions/overture.json'

const datasets = new Map(
  mappings.datasets.flatMap(mapping =>
    mapping.names.map(name => [name, mapping] as const),
  ),
)
const pointer = /^(?:\/(?:[^~/]|~[01])*)*$/

/** Validate the canonical boundary without accepting legacy evidence envelopes. */
export function readSourceAttributions(value: unknown): SourceAttribution[] {
  if (value == null) return []
  if (!Array.isArray(value))
    throw new Error('Source attribution requires an array; reingest this snapshot.')
  const fields = new Set<string>(sourceAttributionFieldOrder)
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Invalid source attribution item.')
    if (Object.keys(item).some(key => !fields.has(key)))
      throw new Error('Source attribution contains processing metadata.')
    for (const field of ['publisher', 'dataset'])
      if (typeof item[field] !== 'string' || !item[field].trim())
        throw new Error(`Source attribution requires ${field}.`)
    if (
      item.upstreamOf !== undefined &&
      (typeof item.upstreamOf !== 'string' ||
        !item.upstreamOf.trim() ||
        item.upstreamOf === item.publisher)
    )
      throw new Error('Source upstreamOf must name a different direct publisher.')
    for (const field of ['recordId', 'updateTime', 'version', 'license'])
      if (item[field] !== undefined && typeof item[field] !== 'string')
        throw new Error(`Source ${field} must be a string.`)
    if (
      item.property != null &&
      (typeof item.property !== 'string' || !pointer.test(item.property))
    )
      throw new Error('Source property must be an RFC 6901 JSON Pointer.')
    if (
      item.confidence !== undefined &&
      (typeof item.confidence !== 'number' ||
        !Number.isFinite(item.confidence) ||
        item.confidence < 0 ||
        item.confidence > 1)
    )
      throw new Error('Source confidence must be between zero and one.')
  }
  return value.map(orderSourceAttribution)
}

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
      publisher: mapping.publisherCode,
      ...(mapping.publisherCode !== 'overture' ? { upstreamOf: 'overture' } : {}),
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
    return orderSourceAttribution(result)
  })
}
