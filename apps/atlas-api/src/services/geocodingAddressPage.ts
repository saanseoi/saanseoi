import type { GeocodingQuery } from '../schema/geocoding'
import type { GeocodingDatabases, GeocodingRelease } from './geocodingData'
import { addressGeocodingCandidates } from '../db/geocoding'
import { listAddressRecordsCurrentByIds, type AddressRecord } from '../db/addresses'
import { geocodingGramSelection } from '../db/geocodingGram'
import {
  getPublicationReadiness,
  guardPublicationRead,
  PublicationReadUnavailableError,
} from '../db/publicationState'
import { rankAddress } from './addressGeocoding'
import {
  geographicFilterContext,
  matchesAddressGeographicMembership,
} from '../lib/geographicFilterContext'
import {
  addressSearchKey,
  pageAddressSearch,
  AddressSearchTooBroadError,
  type AddressSearchStore,
} from './geocodingSearchCache'
/** Rank one prepared publication once, then hydrate only the requested continuation page.
 * @param db Request-local publication databases.
 * @param release Resolved Address release, pinned into every continuation key.
 * @param query Validated text search and page size.
 * @param store Public search-session persistence with bounded expiry.
 * @returns Source records for one page, total and next cursor; never an unmarked partial scan.
 */
export async function loadGeocodingAddressPage(
  db: GeocodingDatabases,
  release: GeocodingRelease,
  query: GeocodingQuery,
  store: AddressSearchStore,
): Promise<{
  records: AddressRecord[]
  total: number
  nextCursor: string | null
  offset: number
}> {
  const ids = release.snapshots
    .filter(row => row.snapshotResourceType === 'address')
    .map(row => row.snapshotId)
  const token = await getPublicationReadiness(db.currentDb, 'address', ids)
  if (token === null)
    throw new PublicationReadUnavailableError(
      'Lazy address search requires a prepared publication.',
    )
  const result = await guardPublicationRead(
    db.currentDb,
    'address',
    ids,
    token,
    async () => {
      // A continuation performs no FTS lookup or text ranking; the publication guard still runs.
      const geography = geographicFilterContext()
      const key = await addressSearchKey(query, {
        release: release.code,
        token,
        geography: geography
          ? {
              releaseSet: geography.releaseSet,
              groups: geography.groups.map(group => [...group].sort()),
              targetClasses: geography.targetClasses,
            }
          : null,
      })
      const page = await pageAddressSearch(store, key, query, async () => {
        await geocodingGramSelection(
          db.currentDb,
          ids,
          (query.address ?? query.placename)!,
          true,
        )
        const best = new Map<string, number>()
        for await (const records of addressGeocodingCandidates(
          db.currentDb,
          ids,
          query,
        )) {
          for (const record of records) {
            if (
              !matchesAddressGeographicMembership(record.address.divisionRelationships)
            )
              continue
            const ranked = rankAddress(record, query)
            if (ranked)
              best.set(
                record.address.id,
                Math.max(best.get(record.address.id) ?? 0, ranked.score),
              )
          }
          if (best.size > 50000)
            throw new AddressSearchTooBroadError(
              'Refine the address query before loading results.',
            )
        }
        return [...best]
          .map(([id, score]) => ({ id, score }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      })
      const records = page.rows.length
        ? await listAddressRecordsCurrentByIds(db.currentDb, {
            snapshotIds: ids,
            addressIds: page.rows.map(row => row.id),
            localeSelection: { mode: 'all', locales: ['*'] },
          })
        : []
      const byId = new Map(records.map(record => [record.address.id, record]))
      if (page.rows.some(row => !byId.has(row.id)))
        throw new PublicationReadUnavailableError('Address search publication changed.')
      return {
        records: page.rows.map(row => byId.get(row.id)!),
        total: page.total,
        nextCursor: page.nextCursor,
        offset: page.offset,
      }
    },
  )
  if (!result)
    throw new PublicationReadUnavailableError('Address search publication changed.')
  const division = release.snapshots.find(
    row => row.snapshotResourceType === 'division' && row.variant === 'overture',
  )
  if (!division)
    throw new PublicationReadUnavailableError('Address division companion unavailable.')
  return {
    ...result,
    records: result.records.map(record => ({
      ...record,
      address: { ...record.address, divisionSnapshotId: division.snapshotId },
    })),
  }
}
