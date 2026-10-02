import type { HarbourReadableDb } from '../../../lib/db/types'
import { addressSearchIndex } from '../addresses/searchIndex'
import { placeSearchIndex } from '../places/searchIndex'
import { divisionSearchIndex } from './divisions'
import { synchroniseSearchIndexes, type SearchD1Database } from './incrementalIndex'

/** Publication/reconciliation is the single finalisation boundary for search. */
export async function finalisePublishedSearch(
  db: HarbourReadableDb,
  current: SearchD1Database,
  options: {
    deferred?: boolean
    pendingReleaseSetCodes?: readonly string[]
    /** Omit for reconciliation, including a retry after a failed finalisation. */
    publishedFamilies?: readonly string[]
  } = {},
  dependencies = { synchroniseSearchIndexes },
) {
  // Drafts are not serving selections. An unrelated incomplete cohort must not
  // suppress indexes for published inventories; synchronisation checks every
  // selected snapshot's complete delivery receipt in the same batch as FTS.
  if (options.deferred) return
  const families = options.publishedFamilies
  const places = !families || families.includes('places')
  // Places publication also completes the curated supplementary Address collection.
  const addresses = places || families?.includes('addresses')
  const divisions = !families || families.includes('divisions')
  await dependencies.synchroniseSearchIndexes(db, current, [
    ...(addresses ? [addressSearchIndex] : []),
    ...(places ? [placeSearchIndex] : []),
    ...(divisions ? [divisionSearchIndex] : []),
  ])
}
