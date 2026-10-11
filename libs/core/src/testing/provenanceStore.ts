import type { ProvenanceStore } from '../provenance/types'

export function createMemoryProvenanceStore() {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes.slice(0) } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes.slice(0))
    },
  }
  return { store, objects }
}
