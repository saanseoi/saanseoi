import { MAX_OBJECT_BYTES, retainObject, serialise } from './objects'
import type { ObjectRef, ProvenanceStore } from './types'

/** Preserve every fixture entry and root property in bounded, readable partitions. */
export async function retainFixturePartitions(
  store: ProvenanceStore,
  value: unknown,
  arrayKey: string,
): Promise<Array<{ object: ObjectRef; firstOrdinal: number; count: number }>> {
  const document = value as Record<string, unknown>
  const entries = document?.[arrayKey]
  const size = (v: unknown) => new TextEncoder().encode(serialise(v)).length
  if (!Array.isArray(entries) || size(document) <= MAX_OBJECT_BYTES)
    return [
      {
        object: await retainObject(store, document),
        firstOrdinal: 0,
        count: Array.isArray(entries) ? entries.length : 0,
      },
    ]
  const { [arrayKey]: _, ...root } = document
  const parts: Array<{ object: ObjectRef; firstOrdinal: number; count: number }> = []
  let firstOrdinal = 0
  let pending: unknown[] = []
  // Reserve envelope space for partition metadata and commas.
  const envelope = size({
    ...root,
    [arrayKey]: [],
    auditPartition: { firstOrdinal: entries.length, totalEntries: entries.length },
  })
  let bytes = envelope
  async function flush() {
    if (!pending.length) return
    const object = await retainObject(store, {
      ...root,
      [arrayKey]: pending,
      auditPartition: { firstOrdinal, totalEntries: entries.length },
    })
    parts.push({ object, firstOrdinal, count: pending.length })
    firstOrdinal += pending.length
    pending = []
    bytes = envelope
  }
  for (const entry of entries) {
    const entryBytes = size(entry) + 1
    if (envelope + entryBytes > MAX_OBJECT_BYTES)
      throw new Error('A single fixture entry exceeds the retained object limit.')
    if (bytes + entryBytes > MAX_OBJECT_BYTES) await flush()
    pending.push(entry)
    bytes += entryBytes
  }
  await flush()
  return parts
}
