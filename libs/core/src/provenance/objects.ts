import type { Digest, Json, ObjectRef, ProvenanceStore } from './types'

export const MAX_OBJECT_BYTES = 1024 * 1024
const encoder = new TextEncoder()

/** Version 1: sorted object keys; array order, missing values and explicit null matter. */
export function serialise(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(serialise).join(',')}]`
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value as object)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${serialise((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`
  throw new Error(
    'Provenance values must be finite JSON, without undefined or class instances.',
  )
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
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const value = JSON.parse(text) as Json
  if (serialise(value) !== text)
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
