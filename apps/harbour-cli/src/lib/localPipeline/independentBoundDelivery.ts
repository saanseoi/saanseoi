import { readBoundDeliveryStatements } from './sqlDeliveryFiles.ts'
import type { prepareSqlDelivery } from './sqlDeliveryFiles.ts'

type Generate = Parameters<typeof prepareSqlDelivery>[2]
type Append = Parameters<Generate>[0]

/** Opt-in for producers with no cross-database dependencies. Never split a collection. */
export async function captureIndependentBoundDelivery(
  append: Append,
  generate: Generate,
) {
  const groups = new Map<
    string,
    {
      target: Parameters<Append>[0]
      statements: ReturnType<typeof readBoundDeliveryStatements>
      bytes: number
    }
  >()
  let bufferedBytes = 0
  const flush = async (key: string) => {
    const group = groups.get(key)
    if (!group) return
    await append(group.target, Buffer.from(JSON.stringify(group.statements)), 'bound')
    bufferedBytes -= group.bytes
    groups.delete(key)
  }
  const outputs = await generate(async (target, bytes, kind) => {
    if (kind !== 'bound') {
      for (const key of groups.keys()) await flush(key)
      await append(target, bytes, kind)
      return
    }
    const key = JSON.stringify(target)
    const statements = readBoundDeliveryStatements(bytes)
    const previous = groups.get(key)
    if (
      previous &&
      (previous.statements.length + statements.length > 64 ||
        previous.bytes + bytes.byteLength > 16 * 1024 * 1024)
    )
      await flush(key)
    // Bound aggregate memory as well as each target buffer. An oversized atomic
    // collection is written directly, not retained alongside other buffers.
    while (groups.size && bufferedBytes + bytes.byteLength > 64 * 1024 * 1024) {
      const oldest = groups.keys().next().value
      if (oldest !== undefined) await flush(oldest)
    }
    if (statements.length >= 64 || bytes.byteLength >= 16 * 1024 * 1024) {
      await flush(key)
      await append(target, bytes, kind)
      return
    }
    const group = groups.get(key) ?? { target, statements: [], bytes: 0 }
    group.statements.push(...statements)
    group.bytes += bytes.byteLength
    bufferedBytes += bytes.byteLength
    groups.set(key, group)
  })
  for (const key of groups.keys()) await flush(key)
  return outputs
}
