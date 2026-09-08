import { afterEach, expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retainAuditResult } from '@repo/core/provenance'
import { deliverProducerAudit } from './producerAuditDelivery'

const originalFetch = globalThis.fetch
const originalKey = process.env.HARBOUR_API_KEY
const directories: string[] = []
afterEach(async () => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalKey
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('a failed registration retries the completed retained graph without rerunning the producer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'producer-audit-'))
  directories.push(directory)
  process.env.HARBOUR_API_KEY = 'test'
  let failRegistration = true
  let generated = 0
  const hashes: string[] = []
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes('/objects/'))
      return Response.json({
        hash: String(url).split('/').at(-1),
        byteLength: (requireDefined(init?.body) as ArrayBuffer).byteLength,
      })
    const ref = JSON.parse(String(init?.body))
    hashes.push(ref.hash)
    return failRegistration
      ? Response.json({ error: 'registration unavailable' }, { status: 503 })
      : Response.json({ manifestHash: ref.hash })
  }) as typeof fetch
  const input: Parameters<typeof deliverProducerAudit>[0] = {
    target: { environment: 'dev', remote: false },
    directory,
    identity: 'source-digest',
    retain: async store => {
      generated++
      return retainAuditResult(store, {
        releaseId: 'release',
        datasetCode: 'places',
        attempt: { id: 'release', status: 'completed' },
        bulk: [],
        guards: [],
        individuals: [],
      })
    },
  }
  await expect(deliverProducerAudit(input)).rejects.toThrow('registration unavailable')
  failRegistration = false
  await deliverProducerAudit(input)
  expect(generated).toBe(1)
  expect(new Set(hashes).size).toBe(1)
  await expect(
    deliverProducerAudit({ ...input, identity: 'different-source' }),
  ).rejects.toThrow('Processing inputs differ')
  expect(generated).toBe(1)
})
