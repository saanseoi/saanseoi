import { afterEach, expect, test } from 'bun:test'
import { retainAuditResult, type ProvenanceStore } from '@repo/core/provenance'

import { deliverProcessingResult } from './provenance.ts'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey == null) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalApiKey
})

function absentObjectChecks(handler: typeof fetch): typeof fetch {
  return (async (input, init) =>
    String(input).endsWith('/objects/check')
      ? Response.json({ objects: [] })
      : handler(input, init)) as typeof fetch
}

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
  const { ref } = await retainAuditResult(store, {
    resourceReleaseId: 'release',
    scope: { stage: 'ingestion', ownerId: 'release' },
    datasetCode: 'fixture',
    attempt: { id: 'fixture', status: 'completed' },
    bulk: [],
    guards: [],
    individuals: [],
  })
  return { store, ref }
}

test('retries a transient provenance object upload', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let objectUploads = 0
  const progress: string[] = []
  globalThis.fetch = absentObjectChecks((async (input, init) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal)
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
  }) as typeof fetch)

  await expect(
    deliverProcessingResult(
      { environment: 'dev', remote: false },
      store,
      ref,
      message => progress.push(message),
    ),
  ).resolves.toBeUndefined()
  expect(objectUploads).toBe(2)
  expect(progress).toEqual([
    'Provenance objects retained: 1',
    'Registering provenance after 1 objects',
  ])
})

test('does not retry a non-transient provenance object upload', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let objectUploads = 0
  globalThis.fetch = absentObjectChecks((async input => {
    if (String(input).includes('/objects/')) objectUploads += 1
    return Response.json({ error: 'Object digest mismatch.' }, { status: 400 })
  }) as typeof fetch)

  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).rejects.toThrow('Object digest mismatch.')
  expect(objectUploads).toBe(1)
})

test('retries a transient provenance registration', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let registrations = 0
  globalThis.fetch = absentObjectChecks((async input => {
    if (String(input).includes('/objects/'))
      return Response.json({ hash: ref.hash, byteLength: ref.byteLength })
    registrations += 1
    return registrations === 1
      ? Response.json(
          { error: 'internal error; reference = local-d1-lock' },
          { status: 400 },
        )
      : Response.json({ manifestHash: ref.hash })
  }) as typeof fetch)

  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).resolves.toBeUndefined()
  expect(registrations).toBe(2)
})

for (const endpoint of ['objects', 'releases']) {
  for (const failure of ['text', 'network', 'timeout']) {
    test(`retries ${failure} failure at provenance ${endpoint}`, async () => {
      const { store, ref } = await processingResult()
      process.env.HARBOUR_API_KEY = 'test-api-key'
      let attempts = 0
      globalThis.fetch = absentObjectChecks((async input => {
        if (String(input).includes(`/${endpoint}/`)) {
          attempts += 1
          if (attempts === 1) {
            if (failure === 'timeout')
              throw Object.assign(new Error('request timed out'), {
                name: 'TimeoutError',
              })
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
      }) as typeof fetch)
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
  globalThis.fetch = absentObjectChecks((async (
    _input: Parameters<typeof fetch>[0],
  ) => {
    attempts += 1
    return new Response('Unauthorised', { status: 401 })
  }) as typeof fetch)
  await expect(
    deliverProcessingResult({ environment: 'dev', remote: false }, store, ref),
  ).rejects.toThrow('HTTP 401')
  expect(attempts).toBe(1)
})

test('local ingestion uploads provenance to production R2 and registers only locally', async () => {
  const { store, ref } = await processingResult()
  const requests: string[] = []
  const objects: string[] = []
  const counts: number[] = []
  globalThis.fetch = absentObjectChecks((async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('/objects/'))
      return Response.json({
        hash: url.split('/').at(-1),
        byteLength: init?.body instanceof ArrayBuffer ? init.body.byteLength : 0,
      })
    return Response.json({ manifestHash: ref.hash })
  }) as typeof fetch)
  await deliverProcessingResult(
    { remote: false, environment: 'dev', r2: 'production' },
    store,
    ref,
    (_message, count) => counts.push(count),
    {
      async retainRemoteObject(environment, key, bytes) {
        expect(environment).toBe('production')
        expect(bytes.byteLength).toBeGreaterThan(0)
        objects.push(key)
      },
    },
  )
  expect(objects.length).toBeGreaterThan(0)
  expect(counts).toEqual([
    ...Array.from({ length: objects.length }, (_, index) => index + 1),
    objects.length,
  ])
  expect(requests.every(url => url.startsWith('http://localhost:8788/'))).toBe(true)
  expect(requests.at(-1)).toContain('/v1/provenance/releases/release')
})

test('verified destination objects skip uploads, including on a transient check retry', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let checks = 0
  let uploads = 0
  let registrations = 0
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith('/objects/check')) {
      checks++
      if (checks === 1) return Response.json({ error: 'try again' }, { status: 503 })
      return Response.json({ objects: JSON.parse(String(init?.body)).objects })
    }
    if (init?.method === 'PUT') uploads++
    else registrations++
    return Response.json({ manifestHash: ref.hash })
  }) as typeof fetch
  await deliverProcessingResult({ environment: 'dev', remote: false }, store, ref)
  expect(checks).toBe(2)
  expect(uploads).toBe(0)
  expect(registrations).toBe(1)
})

test('destination checks cannot acknowledge different bytes or skip independent R2 retention', async () => {
  const { store, ref } = await processingResult()
  process.env.HARBOUR_API_KEY = 'test-api-key'
  let wrongLength = true
  const retained: string[] = []
  globalThis.fetch = (async input =>
    String(input).endsWith('/objects/check')
      ? Response.json({
          objects: [{ ...ref, byteLength: ref.byteLength + Number(wrongLength) }],
        })
      : Response.json({ manifestHash: ref.hash })) as typeof fetch
  const deliver = () =>
    deliverProcessingResult(
      { environment: 'dev', remote: false, r2: 'production' },
      store,
      ref,
      undefined,
      {
        retainRemoteObject: async (_r2, key) => {
          retained.push(key)
        },
      },
    )
  await expect(deliver()).rejects.toThrow('Invalid provenance object acknowledgement')
  expect(retained).toHaveLength(0)
  wrongLength = false
  await deliver()
  expect(retained).toHaveLength(1)
})

test('audit delivery drains parallel failures and registers only after every dependency and root', async () => {
  const { retainAuditResult, retainObject, objectKey } = await import(
    '@repo/core/provenance'
  )
  const store = memoryStore()
  const individuals = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => ({
      id: `action-${i}`,
      operation: `rule-${i}`,
      basis: 'fixture' as const,
      outcome: 'applied' as const,
      summary: 'Applied rule',
      reason: 'Normalisation',
      definition: await retainObject(store, {
        kind: 'processing-rule',
        schemaVersion: 1,
        id: `rule-${i}`,
        basis: 'fixture',
      }),
      fixture: {
        object: await retainObject(store, {
          recordId: `record-${i}`,
          decision: 'reviewed',
        }),
        pointer: '',
      },
      context: {},
      record: { id: `record-${i}`, names: [], parents: [] },
    })),
  )
  const { ref } = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'release' },
    resourceReleaseId: 'release',
    datasetCode: 'divisions',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [],
    guards: [],
    individuals,
  })
  let registrations = 0
  let active = 0
  let peak = 0
  let fail = true
  const retained: string[] = []
  globalThis.fetch = absentObjectChecks((async (input, init) => {
    const url = String(input)
    if (url.includes('/objects/'))
      return Response.json({
        hash: url.split('/').at(-1),
        byteLength: (init!.body as ArrayBuffer).byteLength,
      })
    expect(active).toBe(0)
    expect(retained.at(-1)).toBe(objectKey(ref.hash))
    registrations++
    return Response.json({ manifestHash: ref.hash })
  }) as typeof fetch)
  const options = {
    async retainRemoteObject(_environment: 'preview' | 'production', key: string) {
      active++
      peak = Math.max(peak, active)
      const reject = fail
      fail = false
      try {
        await new Promise(resolve => setTimeout(resolve, reject ? 1 : 10))
        if (reject) throw new Error('Remote upload failed')
        retained.push(key)
      } finally {
        active--
      }
    },
  }
  const target = {
    remote: false,
    environment: 'dev' as const,
    r2: 'production' as const,
  }
  await expect(
    deliverProcessingResult(target, store, ref, undefined, options),
  ).rejects.toThrow('Remote upload failed')
  expect(active).toBe(0)
  expect(registrations).toBe(0)
  expect(retained).not.toContain(objectKey(ref.hash))
  await deliverProcessingResult(target, store, ref, undefined, options)
  expect(peak).toBe(4)
  expect(registrations).toBe(1)
})
