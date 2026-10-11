import { computeVersionHash } from '../../../db/src/versioning'
import type { FieldLineageDefinition } from '../../../db/src/fieldLineage'
import { createProvenanceReader } from './cache'
import { retainObject, serialise, MAX_OBJECT_BYTES } from './objects'
import type { ObjectRef, ProvenanceStore } from './types'

export type FieldLineageReference = {
  id: string
  schemaVersion: number
  manifestHash: string
  manifestByteLength: number
}
type Collection = { key: string; shape: 'array' | 'object'; chunks: ObjectRef[] }
type Manifest = {
  kind: 'field-lineage-manifest'
  schemaVersion: 1
  definitionId: string
  definitionSchemaVersion: number
  header: Record<string, unknown>
  collections: Collection[]
}
const encoder = new TextEncoder()
// Leave room for the chunk envelope. Individual members must fit one object.
const TARGET_BYTES = MAX_OBJECT_BYTES - 1024

/** Retain meaningful graph collections using the existing immutable JSON store. */
export async function retainFieldLineage(
  store: ProvenanceStore,
  id: string,
  definition: { schemaVersion?: number; [key: string]: unknown },
): Promise<FieldLineageReference> {
  if (computeVersionHash(definition) !== id)
    throw new Error(`Field lineage definition hash mismatch: ${id}`)
  const manifest: Manifest = {
    kind: 'field-lineage-manifest',
    schemaVersion: 1,
    definitionId: id,
    definitionSchemaVersion: definition.schemaVersion ?? 0,
    header: {},
    collections: [],
  }
  for (const key of Object.keys(definition).sort()) {
    const value = definition[key]
    if (value === null || typeof value !== 'object') {
      manifest.header[key] = value
      continue
    }
    const collection: Collection = {
      key,
      shape: Array.isArray(value) ? 'array' : 'object',
      chunks: [],
    }
    const members = Array.isArray(value)
      ? value
      : Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    let items: unknown[] = [],
      size = 0
    const flush = async () => {
      if (!items.length) return
      collection.chunks.push(
        await retainObject(store, {
          kind: 'field-lineage-collection',
          schemaVersion: 1,
          collection: key,
          shape: collection.shape,
          items,
        }),
      )
      items = []
      size = 0
    }
    for (const item of members) {
      const length = encoder.encode(serialise(item)).length + 1
      if (length > TARGET_BYTES)
        throw new Error(`Field lineage member too large: ${key}`)
      if (size + length > TARGET_BYTES) await flush()
      items.push(item)
      size += length
    }
    await flush()
    manifest.collections.push(collection)
  }
  const ref = await retainObject(store, manifest)
  const result = {
    id,
    schemaVersion: definition.schemaVersion ?? 0,
    manifestHash: ref.hash,
    manifestByteLength: ref.byteLength,
  }
  await readFieldLineage(store, result)
  return result
}

/** Verify every retained object and the reconstructed logical definition identity. */
export async function readFieldLineage(
  store: ProvenanceStore,
  ref: FieldLineageReference,
): Promise<FieldLineageDefinition> {
  const reader = createProvenanceReader(store)
  const manifest = (await reader.read({
    hash: ref.manifestHash as ObjectRef['hash'],
    byteLength: ref.manifestByteLength,
  })) as unknown as Manifest
  if (
    manifest.kind !== 'field-lineage-manifest' ||
    manifest.schemaVersion !== 1 ||
    manifest.definitionId !== ref.id ||
    manifest.definitionSchemaVersion !== ref.schemaVersion
  )
    throw new Error(`Invalid field lineage manifest: ${ref.id}`)
  const definition: Record<string, unknown> = { ...manifest.header }
  for (const collection of manifest.collections) {
    if (
      Object.hasOwn(definition, collection.key) ||
      !['array', 'object'].includes(collection.shape)
    )
      throw new Error('Invalid field lineage collection.')
    const items: unknown[] = []
    for (const chunkRef of collection.chunks) {
      const chunk = (await reader.read(chunkRef)) as unknown as {
        kind: string
        schemaVersion: number
        collection: string
        shape: string
        items: unknown[]
      }
      if (
        chunk.kind !== 'field-lineage-collection' ||
        chunk.schemaVersion !== 1 ||
        chunk.collection !== collection.key ||
        chunk.shape !== collection.shape ||
        !Array.isArray(chunk.items)
      )
        throw new Error('Invalid field lineage chunk.')
      for (const item of chunk.items) items.push(item)
    }
    Object.defineProperty(definition, collection.key, {
      value:
        collection.shape === 'array'
          ? items
          : Object.fromEntries(items as [string, unknown][]),
      enumerable: true,
    })
  }
  if (
    (definition.schemaVersion ?? 0) !== ref.schemaVersion ||
    computeVersionHash(definition) !== ref.id
  )
    throw new Error(`Field lineage definition hash mismatch: ${ref.id}`)
  return definition as FieldLineageDefinition
}
