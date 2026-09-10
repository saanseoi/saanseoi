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
import { landsdSettlementSelectionAudit } from '../apps/harbour-cli/src/lib/sources/hkgov/landsd/settlementSelection'
import { retainRegisteredRule } from '../apps/harbour-cli/src/lib/api/retainedRule'

// Explicit maintenance operation: normal publication/registration remains immutable.
// Retain old objects and a rollback reference before a compare-and-swap pointer update.
if (!process.argv.includes('--local'))
  throw new Error('Pass --local. Remote backfill is not supported.')
const apply = process.argv.includes('--apply')
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
    SELECT r.id, r.code, p.manifestHash, p.byteLength, p.applicationCount, p.attemptStatus
    FROM releases r JOIN datasets d ON d.id = r.datasetId
    LEFT JOIN releaseProvenance p ON p.releaseId = r.id
    WHERE d.code = 'ds-hk-hkgov-landsd-division' AND r.status = 'published'
    ORDER BY r.code
  `)
    .all<{
      id: string
      code: string
      manifestHash: Digest
      byteLength: number
      applicationCount: number
      attemptStatus: string
    }>()
  if (!releases.length)
    throw new Error('No published local LandsD Place Name releases found.')
  for (const release of releases) {
    if (!release.manifestHash || release.attemptStatus !== 'completed')
      throw new Error(`${release.code} requires an existing completed audit.`)
    const oldRef = { hash: release.manifestHash, byteLength: release.byteLength }
    const manifest = await readObject(store, oldRef)
    validateAuditManifest(manifest)
    if (
      manifest.releaseId !== release.id ||
      manifest.datasetCode !== 'ds-hk-hkgov-landsd-division'
    )
      throw new Error('Registered audit identity mismatch.')
    await verifyAuditResult(store, manifest)
    const properties: Record<string, unknown>[] = []
    const identities = new Set<string>()
    for (const [binding, source] of Object.entries(proxy.env)) {
      if (!binding.startsWith('DB_SOURCE_HK_')) continue
      const { results } = await (source as Db)
        .prepare(`
        SELECT sourceRecordId, rawProperties FROM hkgovLandsdPlaceNames
        WHERE validFromRelease <= ? AND (validToRelease IS NULL OR validToRelease > ?)
      `)
        .bind(release.code, release.code)
        .all<{ sourceRecordId: string; rawProperties: string }>()
      for (const row of results) {
        if (identities.has(row.sourceRecordId))
          throw new Error(`Duplicate native source identity ${row.sourceRecordId}`)
        identities.add(row.sourceRecordId)
        const value = JSON.parse(row.rawProperties)
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Invalid native properties.')
        properties.push(value)
      }
    }
    if (!properties.length)
      throw new Error(`${release.code} has no retained native source records.`)
    const rule = landsdSettlementSelectionAudit(properties)
    const counts = {
      inputs: rule.inputs,
      outputs: rule.outputs,
      recordsAffected: rule.recordsAffected,
      decisions: rule.decisions,
    }
    const existing = manifest.bulk.find(b => b.id === rule.declaration.id)
    if (existing) {
      if (serialise(existing.counts) !== serialise(counts))
        throw new Error(
          'Existing selection audit counts differ from retained source records.',
        )
      console.log(
        JSON.stringify({ release: release.code, status: 'already-present', counts }),
      )
      continue
    }
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
      bulk: [
        ...manifest.bulk,
        {
          id: rule.declaration.id,
          definition: await retainRegisteredRule(store, rule.declaration),
          basis: rule.declaration.basis,
          summary: rule.declaration.summary,
          outcome: 'applied' as const,
          counts,
          fixtures: [],
        },
      ],
    }
    await verifyAuditResult(store, updated)
    const ref = await retainObject(store, updated)
    await retainAuditSearchIndex(store, ref, updated, release.code)
    const backupDirectory = resolve('.local/audit-backfills/landsd-selection')
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
      AND EXISTS (SELECT 1 FROM releases WHERE id = ? AND status = 'published')
    `)
      .bind(
        ref.hash,
        ref.byteLength,
        release.id,
        oldRef.hash,
        oldRef.byteLength,
        release.applicationCount,
        release.id,
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
