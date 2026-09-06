import { resolve } from 'node:path'

export const LOCAL_RELEASE_ROOT = resolve(
  import.meta.dir,
  '../../../../../.local/harbour-sql/releases',
)

export const PLACE_BATCH_SIZE = 512

export const PLACE_ENRICHMENT_CONCURRENCY = 4

export const PLACE_SQL_BATCH_SIZE = 512

export const MAX_SQL_BYTES = 90_000

export const PLACE_H3_LEVELS = [5, 7, 9] as const

export const SUPPLEMENTARY_CURATION_PATH = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/overture-place-address.json',
)

export const SUPPLEMENTARY_ENTRY_LEDGER_ROOT = resolve(
  import.meta.dir,
  '../../../../../.local/overture-places/address-entries',
)

export function supplementaryEntryLedgerPath(
  target: 'local' | 'preview' | 'production',
) {
  return resolve(SUPPLEMENTARY_ENTRY_LEDGER_ROOT, `${target}.json`)
}

export const NORMALISED_PLACES_FILE = 'normalised-places.jsonl'

export const ENRICHED_PLACES_FILE = 'enriched-places.jsonl'
