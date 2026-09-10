import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import {
  readObject,
  retainObject,
  retainAuditSearchIndex,
  validateAuditManifest,
  verifyAuditResult,
  serialise,
  type Digest,
  type ProvenanceStore,
} from '@repo/core/provenance'

// Explicit maintenance operation: normal publication/registration remains immutable.
// Retain old objects and a rollback reference before a compare-and-swap pointer update.
if (!process.argv.includes('--local'))
  throw new Error('Pass --local. Remote backfill is not supported.')
const apply = process.argv.includes('--apply')
const releaseId =
  process.argv
    .find(arg => arg.startsWith('--release-id='))
    ?.slice('--release-id='.length) ?? '5395feb9-cad3-5bcd-86cb-27ecbbefcdc0'
if (!/^[a-f0-9-]{36}$/.test(releaseId)) throw new Error('Invalid release ID.')
type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): ReturnType<Db['prepare']>
    all<T>(): Promise<{ results: T[] }>
    run(): Promise<{ meta: { changes: number } }>
  }
}
const proxy = await getPlatformProxy<
  {
    DB_META: Db
    R2_GUIDE_ASSETS: ProvenanceStore
  } & Record<string, unknown>
>({
  configPath: resolve('apps/atlas-app/wrangler.jsonc'),
  persist: { path: resolve('.local/d1/dev/v3') },
  remoteBindings: false,
})
try {
  const db = proxy.env.DB_META
  const store = proxy.env.R2_GUIDE_ASSETS
  const { results: releases } = await db
    .prepare(`
    SELECT r.id, s.code, r.status, r.sourceReleaseId, p.manifestHash, p.byteLength, p.applicationCount, p.attemptStatus
    FROM releases r JOIN sourceReleases s ON s.id = r.sourceReleaseId JOIN datasets d ON d.id = s.datasetId
    LEFT JOIN releaseProvenance p ON p.releaseId = r.id
    WHERE r.id = ?
    ORDER BY r.code
  `)
    .bind(releaseId)
    .all<{
      id: string
      code: string
      status: string
      manifestHash: Digest
      byteLength: number
      applicationCount: number
      attemptStatus: string
    }>()
  if (!releases.length)
    throw new Error('The requested local Overture area release was not found.')
  for (const release of releases) {
    if (!release.manifestHash || release.attemptStatus !== 'completed')
      throw new Error(`${release.code} requires an existing completed audit.`)
    if (
      !release.code.startsWith('dr-hk-overture-division-area-') ||
      !['published', 'superseded'].includes(release.status)
    )
      throw new Error('Unexpected release identity or status.')
    const oldRef = { hash: release.manifestHash, byteLength: release.byteLength }
    const manifest = await readObject(store, oldRef)
    validateAuditManifest(manifest)
    if (
      manifest.releaseId !== release.id ||
      manifest.datasetCode !== 'ds-hk-overture-division-area'
    )
      throw new Error('Registered audit identity mismatch.')
    await verifyAuditResult(store, manifest)
    const rule = manifest.bulk.find(b => b.id === 'overture_hong_kong_area_synthesised')
    if (!rule) throw new Error('The retained synthesis rule was not found.')
    const count = rule.counts.recordsAffected
    if (
      !Number.isSafeInteger(count) ||
      count !== 3 ||
      rule.counts.decisions.applied !== count
    )
      throw new Error('Expected retained evidence of three generated area records.')
    // The retained producer emitted one action with affectedRecordCount: 1
    // per synthesised area. Sum those retained actions, not current source rows:
    // current source history can have been rebuilt after this audit was recorded.
    const declaration = await readObject(store, rule.definition)
    if (
      !declaration ||
      typeof declaration !== 'object' ||
      Array.isArray(declaration) ||
      !Array.isArray(declaration.outputs) ||
      !declaration.outputs.includes('divisionAreas')
    )
      throw new Error('The retained rule does not declare divisionAreas outputs.')
    const counts = { ...rule.counts, outputs: { divisionAreas: count } }
    if (serialise(rule.counts.outputs) === serialise(counts.outputs)) {
      console.log(
        JSON.stringify({ release: release.code, status: 'already-present', counts }),
      )
      continue
    }
    if (Object.keys(rule.counts.outputs).length)
      throw new Error('Existing output counts conflict; refusing to overwrite.')
    console.log(
      JSON.stringify({
        release: release.code,
        status: apply ? 'backfilling' : 'would-backfill',
        counts,
      }),
    )
    if (!apply) continue
    const updated = {
      ...manifest,
      bulk: manifest.bulk.map(b => (b === rule ? { ...b, counts } : b)),
    }
    await verifyAuditResult(store, updated)
    const ref = await retainObject(store, updated)
    await retainAuditSearchIndex(store, ref, updated, release.code)
    const backupDirectory = resolve('.local/audit-backfills/hong-kong-area')
    await mkdir(backupDirectory, { recursive: true })
    await writeFile(
      resolve(backupDirectory, `${release.code}-${oldRef.hash.slice(7)}.json`),
      `${JSON.stringify({ release, previous: oldRef, replacement: ref, counts }, null, 2)}\n`,
      { flag: 'wx' },
    ).catch(error => {
      if (error.code !== 'EEXIST') throw error
    })
    const result = await db
      .prepare(`
      UPDATE releaseProvenance SET manifestHash = ?, byteLength = ?
      WHERE releaseId = ? AND manifestHash = ? AND byteLength = ?
      AND applicationCount = ? AND attemptStatus = 'completed'
      AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND status = ?)
    `)
      .bind(
        ref.hash,
        ref.byteLength,
        release.id,
        oldRef.hash,
        oldRef.byteLength,
        release.applicationCount,
        release.id,
        release.status,
      )
      .run()
    if (result.meta.changes !== 1)
      throw new Error('Audit pointer changed concurrently; backfill was not applied.')
    const { results: readback } = await db
      .prepare(
        'SELECT manifestHash, byteLength FROM releaseProvenance WHERE releaseId = ?',
      )
      .bind(release.id)
      .all<{ manifestHash: string; byteLength: number }>()
    if (
      readback[0]?.manifestHash !== ref.hash ||
      readback[0]?.byteLength !== ref.byteLength
    )
      throw new Error('Audit registration readback failed.')
    console.log(
      JSON.stringify({
        release: release.code,
        status: 'verified',
        previous: oldRef,
        replacement: ref,
      }),
    )
  }
} finally {
  await proxy.dispose()
}
