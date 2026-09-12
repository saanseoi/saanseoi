import { expect, test } from 'bun:test'
import { retainObject } from './objects'
import { transferObjects } from './transferObjects'
import type { ProvenanceStore } from './types'

function memoryStore(): ProvenanceStore {
  const objects = new Map<string, ArrayBuffer>()
  return {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
}

test('copies unique objects concurrently within the bound and verifies readback', async () => {
  const source = memoryStore()
  const destination = memoryStore()
  const refs = await Promise.all(
    Array.from({ length: 9 }, (_, i) => retainObject(source, { i })),
  )
  let active = 0
  let peak = 0
  let writes = 0
  await transferObjects(
    source,
    {
      get: destination.get,
      async put(key, bytes) {
        writes++
        peak = Math.max(peak, ++active)
        await Bun.sleep(5)
        await destination.put(key, bytes)
        active--
      },
    },
    [...refs, ...refs],
    4,
  )
  expect(peak).toBe(4)
  expect(active).toBe(0)
  expect(writes).toBe(9)
})

test('failure drains in-flight writes and rejects corrupt acknowledgement', async () => {
  const source = memoryStore()
  const destination = memoryStore()
  const refs = await Promise.all(
    Array.from({ length: 9 }, (_, i) => retainObject(source, { i })),
  )
  let active = 0
  let writes = 0
  await expect(
    transferObjects(
      source,
      {
        get: destination.get,
        async put(key, bytes) {
          const current = ++writes
          active++
          await Bun.sleep(current === 1 ? 1 : 20)
          await destination.put(key, current === 1 ? new ArrayBuffer(1) : bytes)
          active--
        },
      },
      refs,
      4,
    ),
  ).rejects.toThrow('checksum/length mismatch')
  expect(active).toBe(0)
  expect(writes).toBe(4)
})
