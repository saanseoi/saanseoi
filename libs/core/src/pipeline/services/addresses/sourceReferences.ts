import { readAlsPublisherSource } from '../sources/alsSourcePayload'
import type { SourceAttribution } from '@repo/db'

/** Publisher occurrence only; release selection and curation belong to retained evidence. */
export function addressSourceReferences(
  row: Record<string, unknown>,
  _canonicalId: string,
): SourceAttribution[] {
  const publisher = readAlsPublisherSource(row)
  return publisher
    ? [
        {
          publisher: 'hkgov-dpo',
          dataset: 'ds-hk-hkgov-dpo-address',
          recordId: publisher.sourceRecordId,
        },
      ]
    : []
}
