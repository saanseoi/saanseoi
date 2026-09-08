import { hashValue, readValue } from './objects'
import { validateApplication } from './validation'
import type {
  Application,
  Collection,
  JsonRecord,
  ProvenanceStore,
  RecordKey,
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
      const value = effect.after ? await readValue(store, effect.after) : null
      if (
        effect.after &&
        (value === null || typeof value !== 'object' || Array.isArray(value))
      )
        throw new Error('Retained output must be a JSON record.')
      updates.push([key, value])
    }
    for (const [key, value] of updates) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
  }
  return next
}
