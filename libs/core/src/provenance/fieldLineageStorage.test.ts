import { expect, test } from 'bun:test'
import { computeVersionHash } from '../../../db/src/versioning'
import { createMemoryProvenanceStore } from '../testing/provenanceStore'
import { readFieldLineage, retainFieldLineage } from './fieldLineageStorage'
import { MAX_OBJECT_BYTES, objectKey, retainObject } from './objects'

const fixture = () => ({
  kind: 'api-response-lineage-definition',
  schemaVersion: 2,
  nodes: Array.from({ length: 2000 }, (_, i) => ({
    id: `node-${i}`,
    description: '地'.repeat(220),
  })),
  definitions: { rule: { operation: 'copy' } },
  fields: [],
  api: { version: 'v1' },
})

test('large graphs roundtrip in bounded shared JSON chunks; retries do not write again', async () => {
  const { store, objects } = createMemoryProvenanceStore()
  const definition = fixture(),
    id = computeVersionHash(definition)
  const ref = await retainFieldLineage(store, id, definition)
  expect(new TextEncoder().encode(JSON.stringify(definition)).length).toBeGreaterThan(
    MAX_OBJECT_BYTES,
  )
  expect(
    [...objects.values()].every(bytes => bytes.byteLength <= MAX_OBJECT_BYTES),
  ).toBe(true)
  expect<unknown>(await readFieldLineage(store, ref)).toEqual(definition)
  const count = objects.size
  const noWrites = {
    ...store,
    put: async () => {
      throw new Error('Unexpected write')
    },
  }
  expect(await retainFieldLineage(noWrites, id, definition)).toEqual(ref)
  expect(objects.size).toBe(count)
  // A graph with different fields shares the node and rule objects.
  const next = { ...definition, fields: ['new-field'] }
  await retainFieldLineage(store, computeVersionHash(next), next)
  expect(objects.size - count).toBe(2)
})

test('missing and corrupt objects fail closed; wrong logical identity cannot be pinned', async () => {
  const { store, objects } = createMemoryProvenanceStore()
  const definition = fixture(),
    id = computeVersionHash(definition)
  await expect(
    retainFieldLineage(store, `sha256:${'0'.repeat(64)}`, definition),
  ).rejects.toThrow('definition hash mismatch')
  const ref = await retainFieldLineage(store, id, definition)
  await expect(
    readFieldLineage(store, { ...ref, id: `sha256:${'0'.repeat(64)}` }),
  ).rejects.toThrow('Invalid field lineage manifest')
  const key = [...objects.keys()].find(key => key !== objectKey(ref.manifestHash))!
  const bytes = objects.get(key)!
  objects.delete(key)
  await expect(readFieldLineage(store, ref)).rejects.toThrow(
    'Missing provenance object',
  )
  objects.set(key, new Uint8Array(bytes.byteLength).buffer)
  await expect(readFieldLineage(store, ref)).rejects.toThrow('checksum/length mismatch')
})

test('upload failure and missing readback cannot return a reference', async () => {
  const definition = fixture(),
    id = computeVersionHash(definition)
  await expect(
    retainFieldLineage(
      {
        get: async () => null,
        put: async () => {
          throw new Error('offline')
        },
      },
      id,
      definition,
    ),
  ).rejects.toThrow('offline')
  await expect(
    retainFieldLineage({ get: async () => null, put: async () => {} }, id, definition),
  ).rejects.toThrow('Missing provenance object')
})

test('a valid object digest cannot conceal a modified logical graph', async () => {
  const { store } = createMemoryProvenanceStore()
  const definition = fixture(),
    id = computeVersionHash(definition)
  const ref = await retainFieldLineage(store, id, definition)
  const object = await store.get(objectKey(ref.manifestHash))
  const manifest = JSON.parse(new TextDecoder().decode(await object!.arrayBuffer()))
  manifest.header.kind = 'wrong'
  const changed = await retainObject(store, manifest)
  await expect(
    readFieldLineage(store, {
      ...ref,
      manifestHash: changed.hash,
      manifestByteLength: changed.byteLength,
    }),
  ).rejects.toThrow('definition hash mismatch')
})
