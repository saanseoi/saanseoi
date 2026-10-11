import { expect, test } from 'bun:test'
import { retainCurationReference } from './curationReferences'
import { readValue } from './objects'
import type { ProvenanceStore } from './types'

test('curation references resolve escaped paths in large fixture partitions and reuse writes', async () => {
  const objects = new Map<string, ArrayBuffer>()
  let writes = 0
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      writes++
      objects.set(key, bytes)
    },
  }
  const decision = { id: 'reviewed', replacement: 'name' }
  const metadata = { reason: 'reviewed translation' }
  const document = {
    metadata,
    'entries/~': [
      { padding: 'a'.repeat(600_000) },
      { padding: 'b'.repeat(600_000) },
      { 'decision/~': decision },
    ],
  }
  const reference = await retainCurationReference(store, decision, [document])
  expect(reference.pointer).toBe('/entries~1~0/1/decision~1~0')
  expect(
    await readValue(store, { ...reference.object, pointer: reference.pointer }),
  ).toEqual(decision)
  const count = writes
  expect(await retainCurationReference(store, decision, [document])).toEqual(reference)
  expect(writes).toBe(count)
  const root = await retainCurationReference(store, metadata, [document])
  expect(await readValue(store, { ...root.object, pointer: root.pointer })).toEqual(
    metadata,
  )
  expect(writes).toBe(count)
  const standalone = await retainCurationReference(store, decision)
  expect(standalone.pointer).toBe('')
  expect(
    await retainCurationReference(store, { replacement: 'name', id: 'reviewed' }),
  ).toEqual(standalone)
  expect(writes).toBe(count + 1)
})
