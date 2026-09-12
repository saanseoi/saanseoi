import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import {
  readObject,
  retainAuditSearchIndex,
  validateAuditManifest,
  auditSearchKey,
  type ProvenanceStore,
  type Digest,
} from '@repo/core/provenance'

if (!process.argv.includes('--local'))
  throw new Error(
    'Pass --local to backfill local retained audits. Remote writes are not supported.',
  )
const apply = process.argv.includes('--apply')
const proxy = await getPlatformProxy<{
  DB_META: { prepare(sql: string): { all<T>(): Promise<{ results: T[] }> } }
  R2_GUIDE_ASSETS: ProvenanceStore
}>({
  configPath: resolve('apps/atlas-app/wrangler.jsonc'),
  persist: { path: resolve('.local/d1/dev/v3') },
  experimental: { remoteBindings: false },
})
try {
  const { results } = await proxy.env.DB_META.prepare(
    `SELECT p.releaseId, p.manifestHash, p.byteLength, r.code FROM releaseProvenance p JOIN releases r ON r.id = p.releaseId ORDER BY r.code`,
  ).all<{ releaseId: string; manifestHash: Digest; byteLength: number; code: string }>()
  const store = proxy.env.R2_GUIDE_ASSETS
  let created = 0,
    existing = 0,
    skipped = 0
  const failures: Array<{ releaseId: string; error: string }> = []
  for (const row of results) {
    try {
      const ref = { hash: row.manifestHash, byteLength: row.byteLength }
      const manifest = await readObject(store, ref)
      if (
        !manifest ||
        typeof manifest !== 'object' ||
        Array.isArray(manifest) ||
        manifest.kind !== 'processing-audit'
      ) {
        skipped++
        continue
      }
      validateAuditManifest(manifest)
      if (await store.get(auditSearchKey(ref.hash))) {
        existing++
        continue
      }
      console.log(
        `${apply ? 'Indexing' : 'Would index'} ${row.code} (${row.releaseId})`,
      )
      if (apply) await retainAuditSearchIndex(store, ref, manifest, row.code)
      created++
    } catch (error) {
      failures.push({ releaseId: row.releaseId, error: String(error) })
      console.error(row.code, String(error))
    }
  }
  console.log(
    JSON.stringify(
      { apply, registered: results.length, created, existing, skipped, failures },
      null,
      2,
    ),
  )
  if (failures.length) process.exitCode = 1
} finally {
  await proxy.dispose()
}
