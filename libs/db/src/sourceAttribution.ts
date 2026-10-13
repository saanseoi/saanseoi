/** One record-level reference to an upstream publisher dataset. */
export type SourceAttribution = {
  /**
   * Upstream JSON Pointer (RFC 6901), preserved in the publisher's field namespace.
   * Absent, null or empty means the whole record. A more specific pointer takes
   * precedence over a broader attribution for the property it identifies.
   */
  property?: string | null
  publisherCode: string
  /** Direct publisher through which this attribution was inherited; omitted for direct sources. */
  upstreamOf?: string
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
  'publisherCode',
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
