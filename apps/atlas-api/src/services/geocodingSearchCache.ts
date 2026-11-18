import type { GeocodingQuery } from '../schema/geocoding'

export type RankedAddress = { id: string; score: number }
export type AddressSearchSession = {
  version: 1
  id: string
  key: string
  expiresAt: number
  ranked: RankedAddress[]
}
export interface AddressSearchStore {
  read(key: string): Promise<AddressSearchSession | null>
  write(key: string, value: AddressSearchSession): Promise<void>
}
export class AddressSearchExpiredError extends Error {}
export class AddressSearchTooBroadError extends Error {}
const TTL_SECONDS = 300
/** Adapt the Worker Cache API without introducing isolate-local mutable search state.
 * @param cache Request's edge cache capability.
 * @returns Bounded-lifetime public search-session persistence.
 */
export function createAddressSearchStore(
  cache: Pick<Cache, 'match' | 'put'>,
): AddressSearchStore {
  const url = (key: string): string => `https://saanseoi-search.invalid/v1/${key}`
  return {
    async read(key) {
      const response = await cache.match(url(key))
      return response ? ((await response.json()) as AddressSearchSession) : null
    },
    async write(key, value) {
      await cache.put(
        url(key),
        new Response(JSON.stringify(value), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${TTL_SECONDS}`,
          },
        }),
      )
    },
  }
}
/** Bind a ranked search to its entire query, filters, publication and physical generation.
 * @param query Validated query; presentation and page size do not change the ranking.
 * @param publication Exact immutable release and current publication token.
 * @returns Stable cache identity; different release/filter combinations cannot share a cursor.
 */
export async function addressSearchKey(
  query: GeocodingQuery,
  publication: unknown,
): Promise<string> {
  const {
    cursor,
    paginate,
    limit,
    profile,
    locales,
    include,
    geometry,
    releaseSet,
    ...ranking
  } = query
  const data = JSON.stringify({
    version: 1,
    publication,
    ranking: Object.fromEntries(
      Object.entries(ranking).sort(([a], [b]) => a.localeCompare(b)),
    ),
  })
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
/** Read the next immutable slice; expired cursors never rerun ranking implicitly.
 * @param store Shared edge session store.
 * @param key Query/publication identity.
 * @param query Validated page size and opaque continuation cursor.
 * @param rank Initial indexed search; called only on an uncached first page.
 * @returns Ranked IDs, exact total and a continuation token.
 */
export async function pageAddressSearch(
  store: AddressSearchStore,
  key: string,
  query: GeocodingQuery,
  rank: () => Promise<RankedAddress[]>,
): Promise<{
  rows: RankedAddress[]
  total: number
  nextCursor: string | null
  offset: number
}> {
  const now = Date.now()
  const cursor = query.cursor ? /^([a-f0-9]{32})\.(\d+)$/.exec(query.cursor) : null
  if (query.cursor && !cursor)
    throw new AddressSearchExpiredError('Invalid address search cursor.')
  let session = await store.read(key)
  if (
    !session ||
    session.version !== 1 ||
    session.key !== key ||
    session.expiresAt <= now
  ) {
    if (cursor)
      throw new AddressSearchExpiredError(
        'Address search expired. Search again to refresh the results.',
      )
    const ranked = await rank()
    if (ranked.length > 50000)
      throw new AddressSearchTooBroadError(
        'Refine the address query before loading results.',
      )
    session = {
      version: 1,
      id: crypto.randomUUID().replaceAll('-', ''),
      key,
      expiresAt: now + TTL_SECONDS * 1000,
      ranked,
    }
    // Persist before emitting a cursor so an immediate next request can reuse the ranking.
    await store.write(key, session)
  }
  if (cursor && cursor[1] !== session.id)
    throw new AddressSearchExpiredError(
      'Address search expired. Search again to refresh the results.',
    )
  const offset = cursor ? Number(cursor[2]) : 0
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > session.ranked.length)
    throw new AddressSearchExpiredError('Invalid address search cursor.')
  const rows = session.ranked.slice(offset, offset + query.limit)
  const next = offset + rows.length
  return {
    rows,
    total: session.ranked.length,
    nextCursor: next < session.ranked.length ? `${session.id}.${next}` : null,
    offset,
  }
}
