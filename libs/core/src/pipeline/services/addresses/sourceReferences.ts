import { readAlsPublisherSource } from '../sources/alsSourcePayload'

/** A record points to evidence; publisher payloads and processing decisions live elsewhere. */
export function addressSourceReferences(
  row: Record<string, unknown>,
  canonicalId: string,
) {
  const publisher = readAlsPublisherSource(row)
  const references: Record<string, Array<Record<string, unknown>>> = {}
  if (publisher)
    references.hkgovAls = [
      { record_id: publisher.sourceRecordId, versionHash: publisher.versionHash },
    ]
  const sources =
    typeof row.sources === 'string' ? JSON.parse(row.sources) : row.sources
  if (
    !publisher ||
    (sources &&
      typeof sources === 'object' &&
      Object.keys(sources).some(key => key !== 'hkgovAls'))
  ) {
    // Exact release audit selection comes from the requested snapshot, independently
    // of the version that last changed the canonical address components.
    references.curation = [{ record_id: canonicalId }]
  }
  return references
}
