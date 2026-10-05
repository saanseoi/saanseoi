import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  objectKey,
  retainAuditResult,
  retainObject,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { retainRemoteR2Object, type RemoteR2Bucket } from '../storage/remoteR2'
import { deliverProcessingResult } from './provenance'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

async function prepare(revision = 1) {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const fixture = await retainObject(store, { revision, decision: 'reviewed' })
  const { ref } = await retainAuditResult(store, {
    resourceReleaseId: 'deterministic-release',
    datasetCode: 'addresses',
    attempt: { id: 'deterministic-release', status: 'completed' },
    bulk: [],
    individuals: [],
    individualFixtures: [{ type: 'reviewed-decisions', object: fixture }],
    guards: [],
  })
  return { store, ref, objects, fixture }
}

for (const scenario of ['present', 'missing', 'corrupt', 'changed-input'] as const) {
  test(`fresh local delivery with ${scenario} production R2 evidence`, async () => {
    const previous = await prepare()
    // A fresh producer has no local audit checkpoint or destination registrations.
    const current = await prepare(scenario === 'changed-input' ? 2 : 1)
    const remote = new Map(previous.objects)
    const fixtureKey = objectKey(previous.fixture.hash)
    if (scenario === 'missing') remote.delete(fixtureKey)
    if (scenario === 'corrupt') remote.set(fixtureKey, new Uint8Array([0]).buffer)
    let writes = 0
    let registrations = 0
    const bucket: RemoteR2Bucket = {
      async head(key) {
        const bytes = remote.get(key)
        return bytes
          ? {
              size: bytes.byteLength,
              checksums: {
                sha256: Uint8Array.from(
                  createHash('sha256').update(new Uint8Array(bytes)).digest(),
                ).buffer,
              },
            }
          : null
      },
      async get(key) {
        const bytes = remote.get(key)
        return bytes ? { arrayBuffer: async () => bytes } : null
      },
      async put(key, bytes) {
        writes++
        remote.set(key, bytes.slice().buffer)
        return this.head(key)
      },
    }
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      expect(url.startsWith('http://localhost:8788/')).toBe(true)
      if (url.endsWith('/objects/check')) return Response.json({ objects: [] })
      if (init?.method === 'PUT')
        return Response.json({
          hash: url.split('/').at(-1),
          byteLength: (init.body as ArrayBuffer).byteLength,
        })
      registrations++
      expect(remote.has(objectKey(current.ref.hash))).toBe(true)
      expect(remote.has(objectKey(current.fixture.hash))).toBe(true)
      return Response.json({ manifestHash: current.ref.hash })
    }) as typeof fetch
    const delivery = deliverProcessingResult(
      { environment: 'dev', remote: false, r2: 'production' },
      current.store,
      current.ref,
      undefined,
      {
        retainRemoteObject: (environment, key, bytes, metadata) =>
          retainRemoteR2Object(environment, key, bytes, metadata, bucket),
      },
    )
    if (scenario === 'corrupt') {
      await expect(delivery).rejects.toThrow('immutable object conflict')
      expect(registrations).toBe(0)
      expect(writes).toBe(0)
    } else {
      await delivery
      expect(registrations).toBe(1)
      expect(writes).toBe(scenario === 'present' ? 0 : scenario === 'missing' ? 1 : 2)
      expect(current.ref.hash === previous.ref.hash).toBe(scenario !== 'changed-input')
    }
  })
}
