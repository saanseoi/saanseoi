import { describe, expect, test } from 'bun:test'
import {
  apiFieldView,
  auditView,
  curationView,
  hashValue,
  objectKey,
  readApplications,
  readObject,
  reapplyApplications,
  recordKey,
  retainObject,
  retainProcessingResult,
  serialise,
  verifyProcessingResult,
} from './index'
import type { Application, Collection, JsonRecord, ProvenanceStore } from './types'

function memoryStore() {
  const objects = new Map<string, ArrayBuffer>()
  let writes = 0
  const store: ProvenanceStore = {
    async get(key) {
      const value = objects.get(key)
      return value
        ? {
            async arrayBuffer() {
              return value
            },
          }
        : null
    },
    async put(key, bytes) {
      writes++
      objects.set(key, bytes)
    },
  }
  return { store, objects, writes: () => writes }
}
const collections: Collection[] = [
  {
    id: 'raw',
    layer: 'source',
    datasetCode: 'als',
    releaseId: 'source-release',
    snapshotId: null,
    schema: 'als/3.2',
  },
  {
    id: 'addresses',
    layer: 'canonical',
    datasetCode: 'als',
    releaseId: 'release',
    snapshotId: 'snapshot',
    schema: 'address/1',
  },
]
async function fixture() {
  const f = memoryStore()
  const raw = { name: 'PUBLISHER NAME' }
  const source = { collection: 'raw', id: '1', hash: await hashValue(raw) }
  const output = {
    name: 'Reviewed name',
    parentAddressId: null,
    granularity: 'building',
  }
  const a: Application = {
    schemaVersion: 1,
    kind: 'processing-application',
    id: 'decision-application',
    operation: 'review-name',
    operationVersion: 1,
    outcome: 'applied',
    summary: 'Used the reviewed building name.',
    reason: 'Matched the retained source assertion.',
    decision: {
      id: 'name-decision',
      revision: 1,
      origin: 'human',
      review: 'approved',
      definition: await retainObject(f.store, { name: 'Reviewed name', expected: raw }),
    },
    inputs: [source],
    effects: [
      {
        target: { collection: 'addresses', id: '1' },
        before: null,
        after: await retainObject(f.store, output),
      },
    ],
    evidence: [
      { object: await retainObject(f.store, raw), role: 'publisher', pointer: '/name' },
    ],
    fields: [
      {
        output: { collection: 'addresses', path: '/name' },
        inputs: [{ collection: 'raw', path: '/name' }],
        apiFields: ['address.attributes.name'],
      },
    ],
  }
  return {
    ...f,
    a,
    raw,
    output,
    state: new Map<string, JsonRecord>([[recordKey(source), raw]]),
  }
}

describe('retained processing effects', () => {
  test('explain, derive field lineage and reapply without producer code; leave source untouched', async () => {
    const f = await fixture()
    const { manifest, ref } = await retainProcessingResult(f.store, {
      releaseId: 'release',
      collections,
      applications: [f.a],
    })
    expect(await readObject(f.store, ref)).toEqual(manifest)
    const applications = await Array.fromAsync(readApplications(f.store, manifest))
    expect(auditView(applications[0]!).summary).toBe(f.a.summary)
    expect(curationView(applications[0]!).id).toBe('name-decision')
    expect(apiFieldView(applications)[0]?.apiField).toBe('address.attributes.name')
    const result = await reapplyApplications(
      f.store,
      collections,
      f.state,
      applications,
    )
    expect(result.get(recordKey({ collection: 'addresses', id: '1' }))).toEqual(
      f.output,
    )
    expect(result.get(recordKey({ collection: 'raw', id: '1' }))).toEqual(f.raw)
    expect(f.state.size).toBe(1)
    const writes = f.writes()
    await retainProcessingResult(f.store, {
      releaseId: 'release',
      collections,
      applications: [f.a],
    })
    expect(f.writes()).toBe(writes)
  })
  test('rejects changed inputs and targets without partial effects', async () => {
    const f = await fixture()
    const state = new Map(f.state)
    state.set(recordKey(f.a.inputs[0]!), { name: 'Changed publisher' })
    await expect(
      reapplyApplications(f.store, collections, state, [f.a]),
    ).rejects.toThrow('Input guard failed')
    expect(state.size).toBe(1)
    state.set(recordKey(f.a.inputs[0]!), f.raw)
    state.set(recordKey(f.a.effects[0]!.target), { name: 'Existing' })
    await expect(
      reapplyApplications(f.store, collections, state, [f.a]),
    ).rejects.toThrow('Effect guard failed')
  })
  test('records a merge and subsequent exclusion in order', async () => {
    const f = await fixture()
    const second = { ...f.a.inputs[0]!, id: '2' }
    f.state.set(recordKey(second), f.raw)
    const merge = {
      ...f.a,
      inputs: [...f.a.inputs, second],
      operation: 'merge-records',
    }
    const remove: Application = {
      ...f.a,
      id: 'exclude',
      operation: 'exclude-record',
      fields: [],
      inputs: [],
      effects: [
        {
          target: f.a.effects[0]!.target,
          before: await hashValue(f.output),
          after: null,
        },
      ],
    }
    const result = await reapplyApplications(f.store, collections, f.state, [
      merge,
      remove,
    ])
    expect(result.size).toBe(2)
    expect(f.state.size).toBe(2)
  })
  test('rejects source mutations, unapproved model effects and deferred effects', async () => {
    const f = await fixture()
    await expect(
      reapplyApplications(f.store, collections, f.state, [
        {
          ...f.a,
          effects: [{ ...f.a.effects[0]!, target: { collection: 'raw', id: '1' } }],
        },
      ]),
    ).rejects.toThrow('canonical')
    await expect(
      reapplyApplications(f.store, collections, f.state, [
        {
          ...f.a,
          decision: { ...f.a.decision, origin: 'model', review: 'unreviewed' },
        },
      ]),
    ).rejects.toThrow('approval')
    await expect(
      reapplyApplications(f.store, collections, f.state, [
        { ...f.a, outcome: 'deferred' },
      ]),
    ).rejects.toThrow('Unapplied')
  })
  test('missing evidence and corrupted output prevent retention/replay', async () => {
    const f = await fixture()
    f.objects.delete(objectKey(f.a.evidence[0]!.object.hash))
    await expect(
      retainProcessingResult(f.store, {
        releaseId: 'release',
        collections,
        applications: [f.a],
      }),
    ).rejects.toThrow('Missing provenance')
    f.objects.set(
      objectKey(f.a.effects[0]!.after!.hash),
      new TextEncoder().encode('{}').buffer,
    )
    await expect(
      reapplyApplications(f.store, collections, f.state, [f.a]),
    ).rejects.toThrow('checksum')
  })
  test('chunks and pages 257 decisions without one object per application', async () => {
    const f = await fixture()
    const applications = Array.from({ length: 257 }, (_, i) => ({
      ...f.a,
      id: String(i),
    }))
    const { manifest } = await retainProcessingResult(f.store, {
      releaseId: 'release',
      collections,
      applications,
    })
    expect(manifest.chunks.map(c => c.count)).toEqual([256, 1])
    expect(
      (await Array.fromAsync(readApplications(f.store, manifest, 255, 2))).map(
        a => a.id,
      ),
    ).toEqual(['255', '256'])
    await expect(
      verifyProcessingResult(f.store, { ...manifest, summaries: [] }),
    ).rejects.toThrow('summaries')
    f.objects.delete(objectKey(f.a.decision.definition.hash))
    await expect(verifyProcessingResult(f.store, manifest)).rejects.toThrow(
      'Missing provenance',
    )
  })
  test('canonical JSON retains null, sorts keys and rejects lossy values', async () => {
    expect(await hashValue({ b: 1, a: null })).toBe(await hashValue({ a: null, b: 1 }))
    expect(await hashValue({ a: null })).not.toBe(await hashValue({}))
    for (const value of [undefined, NaN, Infinity, { a: undefined }, new Date()])
      expect(() => serialise(value)).toThrow()
  })
})
