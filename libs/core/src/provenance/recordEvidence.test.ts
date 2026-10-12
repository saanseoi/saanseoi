import { expect, test } from 'bun:test'
import { prepareRecordEvidence, readRecordEvidence } from './recordEvidence'
import { retainObject, objectKey } from './objects'
import type { ProvenanceStore } from './types'

test('R2 evidence is immutable, verified and scoped to the exact record', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const value = objects.get(key)
      return value ? { arrayBuffer: async () => value } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
  const first = await prepareRecordEvidence('address2d', 'a', {
    score: 125,
    selectedAlsBase: 'base',
  })
  const next = await prepareRecordEvidence('address2d', 'a', {
    score: 120,
    selectedAlsBase: 'other',
  })
  expect(first.reference).not.toEqual(next.reference)
  expect(await retainObject(store, first.document)).toEqual(first.reference)
  expect(await readRecordEvidence(store, first.reference, 'address2d', 'a')).toEqual({
    score: 125,
    selectedAlsBase: 'base',
  })
  await expect(
    readRecordEvidence(store, first.reference, 'address2d', 'b'),
  ).rejects.toThrow('identity mismatch')
  objects.set(objectKey(first.reference.hash), new TextEncoder().encode('{}').buffer)
  await expect(
    readRecordEvidence(store, first.reference, 'address2d', 'a'),
  ).rejects.toThrow('checksum/length')
  await expect(
    readRecordEvidence(store, next.reference, 'address2d', 'a'),
  ).rejects.toThrow('Missing')
})
