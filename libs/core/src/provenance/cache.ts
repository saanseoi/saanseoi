import type { Json, ObjectRef, ProvenanceStore, ValueRef } from './types'
import { readObject, valueAtPointer } from './objects'
import { requireDefined } from '../requireDefined'

/** Cache verified parsed objects too: hundreds of pointers can share one pack. */
export function createProvenanceReader(
  store: ProvenanceStore,
  maxBytes = 8 * 1024 * 1024,
) {
  const cache = new Map<string, { value: Json; byteLength: number }>()
  let bytes = 0
  async function read(ref: ObjectRef) {
    const previous = cache.get(ref.hash)
    if (previous) {
      if (previous.byteLength !== ref.byteLength)
        throw new Error('Conflicting dependency lengths.')
      cache.delete(ref.hash)
      cache.set(ref.hash, previous)
      return previous.value
    }
    const value = await readObject(store, ref)
    cache.set(ref.hash, { value, byteLength: ref.byteLength })
    bytes += ref.byteLength
    while (bytes > maxBytes) {
      const key = requireDefined(cache.keys().next().value)
      bytes -= requireDefined(cache.get(key)).byteLength
      cache.delete(key)
    }
    return value
  }
  return {
    read,
    async value(ref: ValueRef) {
      return valueAtPointer(await read(ref), ref.pointer ?? '')
    },
  }
}

/** A bounded read cache keeps shared evidence/value packs cheap to traverse. */
export function cachedProvenanceStore(
  store: ProvenanceStore,
  maxBytes = 8 * 1024 * 1024,
): ProvenanceStore {
  const cache = new Map<string, ArrayBuffer>()
  let size = 0
  return {
    async get(key) {
      let bytes = cache.get(key)
      if (bytes) cache.delete(key)
      else {
        const object = await store.get(key)
        if (!object) return null
        bytes = await object.arrayBuffer()
        if (bytes.byteLength > maxBytes) {
          const uncached = bytes
          return { arrayBuffer: async () => uncached.slice(0) }
        }
        size += bytes.byteLength
      }
      const retained = requireDefined(bytes)
      cache.set(key, retained)
      while (size > maxBytes) {
        const oldest = requireDefined(cache.keys().next().value)
        size -= requireDefined(cache.get(oldest)).byteLength
        cache.delete(oldest)
      }
      return { arrayBuffer: async () => retained.slice(0) }
    },
    async put(key, bytes) {
      const previous = cache.get(key)
      if (previous) {
        size -= previous.byteLength
        cache.delete(key)
      }
      return store.put(key, bytes)
    },
  }
}
