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
  let next = 0
  let failed = false
  let failure: unknown
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (!failed && next < pending.length) {
        const ref = pending[next++]!
        try {
          const copied = await retainObject(destination, await readObject(source, ref))
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
