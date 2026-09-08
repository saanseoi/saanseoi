import { hashValue, readObject } from './objects'
import { validateApplication, validateManifest } from './validation'
import { readApplications, verifyProcessingResult } from './bundle'
import { collectionSchema, validateShape } from './schema'
import { createProvenanceReader } from './cache'
import type {
  Application,
  Collection,
  JsonRecord,
  ProvenanceStore,
  RecordKey,
  ObjectRef,
} from './types'

export function recordKey(key: RecordKey) {
  return JSON.stringify([key.collection, key.id])
}

/** Returns a new state only after every guard and retained value has passed validation. */
export async function reapplyApplications(
  store: ProvenanceStore,
  collections: Collection[],
  state: ReadonlyMap<string, JsonRecord>,
  applications: Iterable<Application> | AsyncIterable<Application>,
): Promise<Map<string, JsonRecord>> {
  const reader = createProvenanceReader(store)
  const collectionIds = new Set<string>()
  for (const collection of collections) {
    validateShape(collection, collectionSchema)
    if (collectionIds.has(collection.id)) throw new Error('Duplicate collection.')
    collectionIds.add(collection.id)
  }
  const next = new Map([...state].map(([key, value]) => [key, structuredClone(value)]))
  const layers = new Map(collections.map(c => [c.id, c.layer]))
  const ids = new Set<string>()
  for await (const application of applications) {
    validateApplication(application)
    if (ids.has(application.id))
      throw new Error(`Duplicate application: ${application.id}`)
    ids.add(application.id)
    for (const input of application.inputs) {
      const value = next.get(recordKey(input))
      if (
        !layers.has(input.collection) ||
        value === undefined ||
        (await hashValue(value)) !== input.hash
      )
        throw new Error(`Input guard failed: ${application.id}/${recordKey(input)}`)
    }
    if (application.outcome !== 'applied') continue
    const updates: Array<[string, JsonRecord | null]> = []
    for (const effect of application.effects) {
      if (layers.get(effect.target.collection) !== 'canonical')
        throw new Error('Effects may only target declared canonical collections.')
      const key = recordKey(effect.target)
      const current = next.get(key)
      const actual = current === undefined ? null : await hashValue(current)
      if (actual !== effect.before)
        throw new Error(`Effect guard failed: ${application.id}/${key}`)
      const value = effect.after ? await reader.value(effect.after) : null
      if (
        effect.after &&
        (value === null || typeof value !== 'object' || Array.isArray(value))
      )
        throw new Error('Retained output must be a JSON record.')
      updates.push([key, structuredClone(value) as JsonRecord | null])
    }
    for (const [key, value] of updates) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
  }
  return next
}

/** Verify retained definitions/evidence before applying any recorded effects. */
export async function reapplyProcessingResult(
  store: ProvenanceStore,
  ref: ObjectRef,
  state: ReadonlyMap<string, JsonRecord>,
) {
  const manifest = await readObject(store, ref)
  validateManifest(manifest)
  await verifyProcessingResult(store, manifest)
  return reapplyApplications(
    store,
    manifest.collections,
    state,
    readApplications(store, manifest),
  )
}
