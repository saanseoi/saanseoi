import { afterEach, expect, test } from 'bun:test'
import { retainProcessingResult, type ProvenanceStore } from '@repo/core/provenance'

import { deliverProcessingResult } from './provenance.ts'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey == null) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalApiKey
})

function memoryStore(): ProvenanceStore {
  const objects = new Map<string, ArrayBuffer>()
  return {
    async get(key) {
      const value = objects.get(key)
      return value ? { arrayBuffer: async () => value } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
}

async function processingResult() {
  const store = memoryStore()
  const { ref } = await retainProcessingResult(store, {
    releaseId: 'release',
    collections: [],
    applications: [],
  })
  return { store, ref }
}

test('retries a transient provenance object upload', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let objectUploads = 0
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes('/objects/')) {
      objectUploads += 1
      return objectUploads === 1
        ? Response.json(
            { error: 'internal error; reference = local-r2-lock' },
            { status: 400 },
          )
        : Response.json({ hash: ref.hash, byteLength: ref.byteLength })
    }
    expect(init?.method).toBe('POST')
    return Response.json({ manifestHash: ref.hash })
  }) as typeof fetch

  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).resolves.toBeUndefined()
  expect(objectUploads).toBe(2)
})

test('does not retry a non-transient provenance object upload', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let objectUploads = 0
  globalThis.fetch = (async input => {
    if (String(input).includes('/objects/')) objectUploads += 1
    return Response.json({ error: 'Object digest mismatch.' }, { status: 400 })
  }) as typeof fetch

  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).rejects.toThrow('Object digest mismatch.')
  expect(objectUploads).toBe(1)
})

test('retries a transient provenance registration', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let registrations = 0
  globalThis.fetch = (async input => {
    if (String(input).includes('/objects/'))
      return Response.json({ hash: ref.hash, byteLength: ref.byteLength })
    registrations += 1
    return registrations === 1
      ? Response.json(
          { error: 'internal error; reference = local-d1-lock' },
          { status: 400 },
        )
      : Response.json({ manifestHash: ref.hash })
  }) as typeof fetch

  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).resolves.toBeUndefined()
  expect(registrations).toBe(2)
})

for (const endpoint of ['objects', 'releases']) {
  for (const failure of ['text', 'network']) {
    test(`retries ${failure} failure at provenance ${endpoint}`, async () => {
      const { store, ref } = await processingResult()
      process.env.HARBOUR_API_KEY = 'test-api-key'
      let attempts = 0
      globalThis.fetch = (async input => {
        if (String(input).includes(`/${endpoint}/`)) {
          attempts += 1
          if (attempts === 1) {
            if (failure === 'network')
              throw new TypeError('fetch failed: Network connection lost.')
            return new Response('Error inside ProxyWorker: Network connection lost.', {
              status: 502,
            })
          }
        }
        return String(input).includes('/objects/')
          ? Response.json({ hash: ref.hash, byteLength: ref.byteLength })
          : Response.json({ manifestHash: ref.hash })
      }) as typeof fetch
      await expect(
        deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
      ).resolves.toBeUndefined()
      expect(attempts).toBe(2)
    })
  }
}

test('preserves a non-JSON terminal HTTP error without retrying', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let attempts = 0
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0]) => {
    attempts += 1
    return new Response('Unauthorised', { status: 401 })
  }) as typeof fetch
  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).rejects.toThrow('HTTP 401')
  expect(attempts).toBe(1)
})
