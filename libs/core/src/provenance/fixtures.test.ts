import { expect, test } from 'bun:test'
import { retainFixturePartitions } from './fixtures'
import { MAX_OBJECT_BYTES, readObject } from './objects'
import type { ProvenanceStore } from './types'

test('large translation fixtures preserve root metadata and every entry in bounded partitions', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
  const entries = Array.from({ length: 400 }, (_, index) => ({
    id: index,
    text: '河'.repeat(1100),
  }))
  const parts = await retainFixturePartitions(
    store,
    { version: 1, datasetCode: 'divisions', entries },
    'entries',
  )
  expect(parts.length).toBeGreaterThan(1)
  expect(parts.every(part => part.object.byteLength <= MAX_OBJECT_BYTES)).toBe(true)
  const retained = await Promise.all(parts.map(part => readObject(store, part.object)))
  expect(
    retained.every(
      value =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        value.datasetCode === 'divisions',
    ),
  ).toBe(true)
  expect(retained.flatMap(value => (value as { entries: unknown[] }).entries)).toEqual(
    entries,
  )
  expect(parts[1]?.firstOrdinal).toBe(parts[0]?.count)
})
