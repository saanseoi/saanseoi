import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'

const metadata = new Set([
  'snapshotId',
  'versionHash',
  'sourceReleaseId',
  'isCurrent',
  'createdAt',
  'updatedAt',
])
export function snapshotContent(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !metadata.has(key))
      .map(([key, value]) => [
        key,
        value instanceof Uint8Array || value instanceof ArrayBuffer
          ? decompressJsonBrotli(value)
          : value,
      ]),
  )
}
export function compareSnapshotRecords(
  before: Map<string, unknown>,
  after: Map<string, unknown>,
) {
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 }
  const records = [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap(id => {
      const old = before.get(id) ?? null
      const next = after.get(id) ?? null
      const fields = jsonFieldDiff(old, next)
      const type: 'added' | 'changed' | 'removed' | 'unchanged' = !before.has(id)
        ? 'added'
        : !after.has(id)
          ? 'removed'
          : fields.length
            ? 'changed'
            : 'unchanged'
      counts[type]++
      return type === 'unchanged'
        ? []
        : [{ id, type, before: old, after: next, fields }]
    })
  return { counts, records, total: after.size }
}
