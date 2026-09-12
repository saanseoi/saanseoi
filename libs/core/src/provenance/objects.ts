import type { Digest, Json, ObjectRef, ProvenanceStore, ValueRef } from './types'
import { requireDefined } from '../requireDefined'

export const MAX_OBJECT_BYTES = 1024 * 1024
const encoder = new TextEncoder()

/**
 * Keep the discriminator and enough context to identify a retained record at
 * the front. The remaining keys stay lexicographic, preserving deterministic
 * bytes regardless of producer property insertion order.
 */
const identifyingKeys = [
  'kind',
  'schemaVersion',
  'id',
  'releaseId',
  'datasetCode',
  'sourceVersion',
  'operation',
  'operationVersion',
  'outcome',
  'summary',
  'reason',
  'sourceField',
  'sourceDatasetCode',
  'apiField',
  'hash',
  'byteLength',
  'collection',
  'snapshotId',
  'layer',
] as const
const identifyingKeyOrder = new Map<string, number>(
  identifyingKeys.map((key, index) => [key, index]),
)

function orderedKeys(value: object) {
  return Object.keys(value).sort((left, right) => {
    const leftOrder = identifyingKeyOrder.get(left) ?? identifyingKeys.length
    const rightOrder = identifyingKeyOrder.get(right) ?? identifyingKeys.length
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left < right ? -1 : left > right ? 1 : 0
  })
}

function serialiseWithObjectKeys(
  value: unknown,
  keysFor: (value: object) => string[],
): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${Array.from(value, item => serialiseWithObjectKeys(item, keysFor)).join(',')}]`
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${keysFor(value)
      .map(
        key =>
          `${JSON.stringify(key)}:${serialiseWithObjectKeys((value as Record<string, unknown>)[key], keysFor)}`,
      )
      .join(',')}}`
  throw new Error(
    'Provenance values must be finite JSON, without undefined or class instances.',
  )
}

/** Canonical JSON leads with record type and identifying context. */
export function serialise(value: unknown): string {
  return serialiseWithObjectKeys(value, orderedKeys)
}

/** Accept immutable objects created before record-identifying key order. */
function serialiseLegacy(value: unknown): string {
  return serialiseWithObjectKeys(value, Object.keys)
}

export async function hashBytes(bytes: Uint8Array): Promise<Digest> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return `sha256:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`
}

export async function hashValue(value: unknown) {
  return hashBytes(encoder.encode(serialise(value)))
}

export function objectKey(hash: string) {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid provenance digest.')
  return `provenance/v1/sha256/${hash.slice(7)}.json`
}

export function validateRef(value: unknown): asserts value is ObjectRef {
  const ref = value as ObjectRef
  if (!ref || typeof ref !== 'object') throw new Error('Invalid provenance reference.')
  objectKey(ref.hash)
  if (
    !Number.isSafeInteger(ref.byteLength) ||
    ref.byteLength < 1 ||
    ref.byteLength > MAX_OBJECT_BYTES
  )
    throw new Error('Invalid provenance object length.')
}

export async function readObject(
  store: ProvenanceStore,
  ref: ObjectRef,
): Promise<Json> {
  validateRef(ref)
  const object = await store.get(objectKey(ref.hash))
  if (!object) throw new Error(`Missing provenance object: ${ref.hash}`)
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.length !== ref.byteLength || (await hashBytes(bytes)) !== ref.hash)
    throw new Error(`Provenance checksum/length mismatch: ${ref.hash}`)
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  const value = JSON.parse(text) as Json
  if (serialise(value) !== text && serialiseLegacy(value) !== text)
    throw new Error('Provenance object is not canonical JSON.')
  return value
}

/** Existing content is verified; retries never replace an object with different bytes. */
export async function retainObject(
  store: ProvenanceStore,
  value: unknown,
): Promise<ObjectRef> {
  const bytes = encoder.encode(serialise(value))
  const ref = { hash: await hashBytes(bytes), byteLength: bytes.length }
  validateRef(ref)
  if (!(await store.get(objectKey(ref.hash))))
    await store.put(objectKey(ref.hash), Uint8Array.from(bytes).buffer)
  await readObject(store, ref)
  return ref
}

/** Resolve only own JSON members; absent and explicit null remain distinct. */
export async function readValue(store: ProvenanceStore, ref: ValueRef): Promise<Json> {
  return valueAtPointer(await readObject(store, ref), ref.pointer ?? '')
}

export function valueAtPointer(value: Json, pointer: string): Json {
  if (pointer !== '' && !/^(\/(?:[^~]|~[01])*)+$/.test(pointer))
    throw new Error('Invalid provenance JSON Pointer.')
  for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    if (
      value === null ||
      typeof value !== 'object' ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) ||
      !Object.hasOwn(value, key)
    )
      throw new Error(`Missing retained value: ${pointer}`)
    value = requireDefined((value as Record<string, Json>)[key])
  }
  return value
}
