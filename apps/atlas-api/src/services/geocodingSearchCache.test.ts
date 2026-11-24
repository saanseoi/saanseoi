import { expect, test } from 'bun:test'
import { GeocodingQuerySchema } from '../schema/geocoding'
import {
  pageAddressSearch,
  addressSearchKey,
  AddressSearchExpiredError,
  type AddressSearchSession,
} from './geocodingSearchCache'

test('continuations reuse one immutable ranking across pages, page sizes and presentation profiles', async () => {
  const data = new Map<string, AddressSearchSession>()
  const store = {
    read: async (key: string) => data.get(key) ?? null,
    write: async (key: string, value: AddressSearchSession) => {
      data.set(key, value)
    },
  }
  let scans = 0
  const rank = async () => {
    scans++
    return Array.from({ length: 57 }, (_, index) => ({
      id: `address-${index}`,
      score: 0.8,
    }))
  }
  const query = GeocodingQuerySchema.parse({
    address: 'hollywood',
    paginate: 'true',
    limit: 20,
  })
  const key = await addressSearchKey(query, { release: 'r1', token: 'p1' })
  const all: string[] = []
  let page = await pageAddressSearch(store, key, query, rank)
  all.push(...page.rows.map(row => row.id))
  expect(page.total).toBe(57)
  while (page.nextCursor) {
    const next = GeocodingQuerySchema.parse({
      address: 'hollywood',
      paginate: 'true',
      limit: 10,
      cursor: page.nextCursor,
      releaseSet: 'r1',
      profile: 'full',
    })
    expect(await addressSearchKey(next, { release: 'r1', token: 'p1' })).toBe(key)
    page = await pageAddressSearch(store, key, next, rank)
    all.push(...page.rows.map(row => row.id))
  }
  expect(scans).toBe(1)
  expect(all).toEqual(Array.from({ length: 57 }, (_, index) => `address-${index}`))
  expect(new Set(all).size).toBe(57)
})

test('expired, evicted and cross-query/release cursors do not repeat the search', async () => {
  const data = new Map<string, AddressSearchSession>()
  const store = {
    read: async (key: string) => data.get(key) ?? null,
    write: async (key: string, value: AddressSearchSession) => {
      data.set(key, value)
    },
  }
  let scans = 0
  const rank = async () => {
    scans++
    return [
      { id: 'one', score: 1 },
      { id: 'two', score: 1 },
    ]
  }
  const query = GeocodingQuerySchema.parse({
    address: 'hollywood',
    paginate: 'true',
    limit: 1,
  })
  const key = await addressSearchKey(query, 'r1')
  const first = await pageAddressSearch(store, key, query, rank)
  const next = { ...query, cursor: first.nextCursor! }
  const wrong = await addressSearchKey({ ...query, address: 'other' }, 'r1')
  await expect(pageAddressSearch(store, wrong, next, rank)).rejects.toBeInstanceOf(
    AddressSearchExpiredError,
  )
  data.get(key)!.expiresAt = 0
  await expect(pageAddressSearch(store, key, next, rank)).rejects.toBeInstanceOf(
    AddressSearchExpiredError,
  )
  data.clear()
  await expect(pageAddressSearch(store, key, next, rank)).rejects.toBeInstanceOf(
    AddressSearchExpiredError,
  )
  expect(scans).toBe(1)
})
