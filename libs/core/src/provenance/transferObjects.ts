import { readObject, retainObject } from './objects'
import type { ObjectRef, ProvenanceStore } from './types'

/** Drain in-flight copies before returning an error; callers publish the root last. */
export async function transferObjects(
  source: ProvenanceStore,
  destination: ProvenanceStore,
  refs: ObjectRef[],
  concurrency: number,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new Error('Provenance transfer concurrency must be between 1 and 16.')
  const unique = new Map<string, ObjectRef>()
  for (const ref of refs) {
    const previous = unique.get(ref.hash)
    if (previous && previous.byteLength !== ref.byteLength)
      throw new Error('Conflicting dependency lengths.')
    unique.set(ref.hash, ref)
  }
  const pending = [...unique.values()]
  const existing = new Set<string>()
  for (const ref of (await destination.hasObjects?.(pending)) ?? []) {
    if (unique.get(ref.hash)?.byteLength !== ref.byteLength)
      throw new Error('Destination acknowledged an unexpected provenance object.')
    existing.add(ref.hash)
  }
  let next = 0
  let failed = false
  let failure: unknown
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (!failed && next < pending.length) {
        const ref = pending[next++]!
        try {
          const value = await readObject(source, ref)
          if (existing.has(ref.hash)) continue
          const copied = await retainObject(destination, value)
          if (copied.hash !== ref.hash || copied.byteLength !== ref.byteLength)
            throw new Error('Transferred provenance reference mismatch.')
        } catch (error) {
          if (!failed) failure = error
          failed = true
        }
      }
    }),
  )
  if (failed) throw failure
}
