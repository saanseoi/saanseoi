import { afterEach, expect, test } from 'bun:test'
import { hashValue, serialise } from '@repo/core/provenance'
import { deliverRecordEvidence } from './provenance'

const originalFetch = globalThis.fetch
const originalKey = process.env.HARBOUR_API_KEY
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalKey
})

test('record evidence checks bounded batches and uploads only unacknowledged content', async () => {
  process.env.HARBOUR_API_KEY = 'test'
  const documents = Array.from({ length: 65 }, (_, id) => ({ id }))
  const missingHash = await hashValue(documents[64])
  const checks: number[] = []
  const uploads: string[] = []
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith('/objects/check')) {
      const { objects } = JSON.parse(String(init?.body))
      checks.push(objects.length)
      return Response.json({
        objects: objects.filter((ref: { hash: string }) => ref.hash !== missingHash),
      })
    }
    uploads.push(String(input))
    return Response.json({
      hash: missingHash,
      byteLength: new TextEncoder().encode(serialise(documents[64])).length,
    })
  }) as typeof fetch
  await deliverRecordEvidence(
    { environment: 'dev', remote: false, r2: 'local' },
    documents,
  )
  expect(checks).toEqual([64, 1])
  expect(uploads).toHaveLength(1)
  expect(uploads[0]).toEndWith(missingHash)
})

test('record evidence rejects acknowledgements for different bytes', async () => {
  process.env.HARBOUR_API_KEY = 'test'
  globalThis.fetch = (async (_input, init) => {
    const { objects } = JSON.parse(String(init?.body))
    return Response.json({
      objects: [{ ...objects[0], byteLength: objects[0].byteLength + 1 }],
    })
  }) as typeof fetch
  await expect(
    deliverRecordEvidence({ environment: 'dev', remote: false, r2: 'local' }, [
      { id: 1 },
    ]),
  ).rejects.toThrow('Invalid provenance object acknowledgement')
})

test('verified API evidence still reaches an independently selected R2 destination', async () => {
  process.env.HARBOUR_API_KEY = 'test'
  globalThis.fetch = (async (_input, init) =>
    Response.json(JSON.parse(String(init?.body)))) as typeof fetch
  const destinations: string[] = []
  await deliverRecordEvidence(
    { environment: 'dev', remote: false, r2: 'preview' },
    [{ id: 1 }],
    {
      retainRemoteObject: async (target, _key, bytes) => {
        destinations.push(target)
        expect(new TextDecoder().decode(bytes)).toBe(serialise({ id: 1 }))
      },
    },
  )
  expect(destinations).toEqual(['preview'])
})
