import { expect, test } from 'bun:test'
import { loadAddressCurrentLookupCache } from './addressCurrentLookupCache'

test('a baseline without a parent cannot reuse a retained address lookup', async () => {
  expect(await loadAddressCurrentLookupCache('local', 'hk', null)).toBeNull()
})
test('a cache cannot be used for a different parent snapshot', async () => {
  expect(
    await loadAddressCurrentLookupCache('local', 'hk', 'not-a-real-snapshot'),
  ).toBeNull()
})
