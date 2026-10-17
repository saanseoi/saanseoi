/** Dot-separated upstream keys; escape dots, slashes and backslashes, and use \\e for empty keys. */
export const sourcePropertyPathPattern =
  /^(?:(?:\\e|(?:[^.\\/]|\\[.\\/])+)(?:\.(?:\\e|(?:[^.\\/]|\\[.\\/])+))*)?$/

/** Convert a publisher JSON Pointer without changing its field namespace. */
export function sourcePropertyPathFromPointer(pointer: string): string {
  if (!/^(?:\/(?:[^~/]|~[01])*)*$/.test(pointer))
    throw new Error('Source property must be an RFC 6901 JSON Pointer.')
  if (pointer === '') return ''
  return pointer
    .slice(1)
    .split('/')
    .map(token => {
      const key = token.replaceAll('~1', '/').replaceAll('~0', '~')
      return key === '' ? '\\e' : key.replace(/[.\\/]/g, '\\$&')
    })
    .join('.')
}

/** One record-level reference to an upstream publisher dataset. */
export type SourceAttribution = {
  /**
   * Dot-separated upstream path in the publisher's field namespace.
   * Absent, null or empty means the whole record. A more specific path takes
   * precedence over a broader attribution for the property it identifies.
   */
  property?: string | null
  /** Canonical field paths supplied by this contributor; omitted for whole-record attribution. */
  properties?: string[]
  /** Stable upstream publisher code. */
  publisher: string
  /** Direct publisher through which this attribution was inherited; omitted for direct sources. */
  upstreamOf?: string
  /** Stable upstream dataset code. */
  dataset: string
  recordId?: string
  updateTime?: string
  /** Publisher-supplied record version; never an ingestion release or content hash. */
  version?: string
  confidence?: number
  license?: string
}

/** Member order for preprocessed and serialised canonical attribution. */
export const sourceAttributionFieldOrder = [
  'property',
  'properties',
  'publisher',
  'upstreamOf',
  'dataset',
  'recordId',
  'updateTime',
  'version',
  'confidence',
  'license',
] as const satisfies readonly (keyof SourceAttribution)[]

export function orderSourceAttribution(value: SourceAttribution): SourceAttribution {
  return Object.fromEntries(
    sourceAttributionFieldOrder
      .filter(key => Object.hasOwn(value, key))
      .map(key => [key, value[key]]),
  ) as SourceAttribution
}
