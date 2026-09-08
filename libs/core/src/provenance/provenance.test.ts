import { describe, expect, test } from 'bun:test'
import { requireDefined } from '../requireDefined'
import {
  apiFieldView,
  auditView,
  curationView,
  hashBytes,
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
  recordApplications,
  readValue,
  reapplyProcessingResult,
  transferProcessingResult,
  validateApplication,
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
    const application = requireDefined(applications[0])
    expect(auditView(application).summary).toBe(f.a.summary)
    expect(curationView(application).id).toBe('name-decision')
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
    const input = requireDefined(f.a.inputs[0])
    const effect = requireDefined(f.a.effects[0])
    state.set(recordKey(input), { name: 'Changed publisher' })
    await expect(
      reapplyApplications(f.store, collections, state, [f.a]),
    ).rejects.toThrow('Input guard failed')
    expect(state.size).toBe(1)
    state.set(recordKey(input), f.raw)
    state.set(recordKey(effect.target), { name: 'Existing' })
    await expect(
      reapplyApplications(f.store, collections, state, [f.a]),
    ).rejects.toThrow('Effect guard failed')
  })
  test('records a merge and subsequent exclusion in order', async () => {
    const f = await fixture()
    const second = { ...requireDefined(f.a.inputs[0]), id: '2' }
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
          target: requireDefined(f.a.effects[0]).target,
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
          effects: [
            {
              ...requireDefined(f.a.effects[0]),
              target: { collection: 'raw', id: '1' },
            },
          ],
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
    f.objects.delete(objectKey(requireDefined(f.a.evidence[0]).object.hash))
    await expect(
      retainProcessingResult(f.store, {
        releaseId: 'release',
        collections,
        applications: [f.a],
      }),
    ).rejects.toThrow('Missing provenance')
    f.objects.set(
      objectKey(requireDefined(requireDefined(f.a.effects[0]).after).hash),
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
  test('canonical JSON leads with record identity, retains null and rejects lossy values', async () => {
    expect(await hashValue({ b: 1, a: null })).toBe(await hashValue({ a: null, b: 1 }))
    expect(await hashValue({ a: null })).not.toBe(await hashValue({}))
    expect(
      serialise({
        z: true,
        sourceField: 'MYPOPN_LAND',
        summary: 'Review a field.',
        operationVersion: 1,
        operation: 'curate-statistic-field',
        datasetCode: 'stats',
        releaseId: 'release',
        id: 'field:MYPOPN_LAND',
        schemaVersion: 1,
        kind: 'curation-definition',
        a: null,
      }),
    ).toBe(
      '{"kind":"curation-definition","schemaVersion":1,"id":"field:MYPOPN_LAND","releaseId":"release","datasetCode":"stats","operation":"curate-statistic-field","operationVersion":1,"summary":"Review a field.","sourceField":"MYPOPN_LAND","a":null,"z":true}',
    )
    for (const value of [
      undefined,
      NaN,
      Infinity,
      { a: undefined },
      new Date(),
      new Array(1),
    ])
      expect(() => serialise(value)).toThrow()
  })
  test('reads previously retained lexicographic canonical JSON', async () => {
    const objects = new Map<string, ArrayBuffer>()
    const text = '{"a":null,"kind":"processing-result","schemaVersion":1,"z":true}'
    const bytes = new TextEncoder().encode(text)
    const ref = {
      hash: await hashBytes(bytes),
      byteLength: bytes.byteLength,
    }
    objects.set(objectKey(ref.hash), bytes.buffer)
    const store: ProvenanceStore = {
      async get(key) {
        const value = objects.get(key)
        return value ? { arrayBuffer: async () => value } : null
      },
      async put() {
        throw new Error('Unexpected provenance write.')
      },
    }

    await expect(readObject(store, ref)).resolves.toEqual({
      a: null,
      kind: 'processing-result',
      schemaVersion: 1,
      z: true,
    })
  })
  test('packs guarded inputs, evidence and outputs with a small root and bounded storage reads', async () => {
    const f = await fixture()
    let reads = 0
    const store: ProvenanceStore = {
      ...f.store,
      async get(key) {
        reads++
        return f.store.get(key)
      },
    }
    const observed = Array.from({ length: 4097 }, (_, index) => ({
      ...f.a,
      id: String(index),
      evidence: [],
      inputs: [{ collection: 'raw', id: String(index), value: { index } }],
      evidenceValues: [
        { role: 'decision-context', value: { index, method: 'reviewed' } },
      ],
      effects: [
        {
          target: { collection: 'addresses', id: String(index) },
          before: null,
          after: { index, name: 'Retained' },
        },
      ],
    }))
    const result = await retainProcessingResult(store, {
      releaseId: 'release',
      collections,
      applications: recordApplications(store, observed),
    })
    expect(result.ref.byteLength).toBeLessThan(10000)
    expect(f.objects.size).toBeLessThan(45)
    expect(reads).toBeLessThan(300)
    const last = requireDefined(
      (await Array.fromAsync(readApplications(store, result.manifest, 4096, 1)))[0],
    )
    expect(
      await readValue(store, requireDefined(requireDefined(last.effects[0]).after)),
    ).toEqual({
      index: 4096,
      name: 'Retained',
    })
    const evidence = requireDefined(
      last.evidence.find(e => e.role === 'decision-context'),
    )
    expect(
      await readValue(store, { ...evidence.object, pointer: evidence.pointer }),
    ).toEqual({ index: 4096, method: 'reviewed' })
  })
  test('transfers a closed graph and reapplies it after the producer store is removed', async () => {
    const f = await fixture()
    const result = await retainProcessingResult(f.store, {
      releaseId: 'release',
      collections,
      applications: [f.a],
    })
    const destination = memoryStore()
    await transferProcessingResult(f.store, destination.store, result.ref)
    f.objects.clear()
    const replayed = await reapplyProcessingResult(
      destination.store,
      result.ref,
      f.state,
    )
    expect(replayed.get(recordKey(requireDefined(f.a.effects[0]).target))).toEqual(
      f.output,
    )
    requireDefined(replayed.get(recordKey(requireDefined(f.a.inputs[0])))).name =
      'Caller edit'
    expect(f.raw.name).toBe('PUBLISHER NAME')
    destination.objects.delete(objectKey(requireDefined(f.a.evidence[0]).object.hash))
    await expect(
      reapplyProcessingResult(destination.store, result.ref, f.state),
    ).rejects.toThrow('Missing provenance')
  })
  test('rejects malformed schema members, nonexistent evidence pointers and null outputs', async () => {
    const f = await fixture()
    for (const value of [
      { ...f.a, unrecognised: true },
      { ...f.a, schemaVersion: 2 },
      { ...f.a, fields: [{ ...f.a.fields[0], apiFields: 'not-an-array' }] },
    ])
      expect(() => validateApplication(value)).toThrow()
    await expect(
      retainProcessingResult(f.store, {
        releaseId: 'release',
        collections,
        applications: [
          {
            ...f.a,
            evidence: [{ ...requireDefined(f.a.evidence[0]), pointer: '/missing' }],
          },
        ],
      }),
    ).rejects.toThrow('Missing retained value')
    const after = await retainObject(f.store, null)
    await expect(
      reapplyApplications(f.store, collections, f.state, [
        { ...f.a, effects: [{ ...requireDefined(f.a.effects[0]), after }] },
      ]),
    ).rejects.toThrow('JSON record')
    expect(f.state.size).toBe(1)
  })
})
