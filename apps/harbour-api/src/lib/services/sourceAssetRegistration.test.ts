import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  createSourceAssetTestStore,
  hash,
} from '../../../../../libs/core/src/testing/sourceAssetStore'
import { putSourceAssetPart, sourceAssetScope } from '@repo/core/sourceAssetTransfer'
import { registerManagedSourceAsset, preflightManagedSourceAsset } from './sourceAssets'

test('only verified completed objects enter metadata and registration failure remains recoverable', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'meta',
    ]),
  )
  const db = createLocalHarbourDb(sqlite)
  const f = createSourceAssetTestStore()
  const bytes = new TextEncoder().encode('retained publisher evidence')
  const sha256 = hash(bytes)
  const metadata = {
    assetKey: `by-source/hk/test/${sha256}-source.zip`,
    contentHash: sha256,
    mediaType: 'application/zip',
    role: 'sourceArchive',
    retrievedAt: '2026-09-12T00:00:00.000Z',
  }
  const input = {
    metadata,
    fileName: 'source.zip',
    byteLength: bytes.length,
    parts: [{ sha256, byteLength: bytes.length }],
  }
  try {
    await expect(registerManagedSourceAsset(db, f.store, input)).rejects.toThrow(
      'chunk is missing',
    )
    expect(sqlite.query('SELECT count(*) AS n FROM assets').get()).toEqual({ n: 0 })
    await putSourceAssetPart(
      f.store,
      sourceAssetScope(metadata.assetKey),
      sha256,
      new Response(bytes).body,
    )
    sqlite.exec(
      "CREATE TRIGGER fail_registration BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'metadata unavailable'); END;",
    )
    await expect(registerManagedSourceAsset(db, f.store, input)).rejects.toThrow(
      'metadata unavailable',
    )
    expect(f.objects.has(metadata.assetKey)).toBe(true)
    expect(f.objects.size).toBe(2)
    expect(sqlite.query('SELECT count(*) AS n FROM assets').get()).toEqual({ n: 0 })
    sqlite.exec('DROP TRIGGER fail_registration')
    const receipt = await preflightManagedSourceAsset(db, f.store, {
      metadata,
      byteLength: bytes.length,
    })
    expect(receipt.needsUpload).toBe(false)
    const replay = await registerManagedSourceAsset(db, f.store, input)
    expect(replay.assetId).toBe(receipt.assetId!)
    expect(f.objects.size).toBe(1)
    expect(sqlite.query('SELECT count(*) AS n FROM assets').get()).toEqual({ n: 1 })
    expect(f.writes.filter(key => key === metadata.assetKey)).toHaveLength(1)
  } finally {
    sqlite.close()
  }
})

test('preflight never registers an object carrying only a false declared hash', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'meta',
    ]),
  )
  const f = createSourceAssetTestStore()
  const metadata = {
    assetKey: `by-source/hk/test/${'0'.repeat(64)}-source.zip`,
    contentHash: '0'.repeat(64),
    mediaType: 'application/zip',
    role: 'sourceArchive',
    retrievedAt: '2026-09-12T00:00:00Z',
  }
  f.objects.set(metadata.assetKey, {
    bytes: new Uint8Array(5),
    customMetadata: { sha256: metadata.contentHash },
  })
  try {
    await expect(
      preflightManagedSourceAsset(createLocalHarbourDb(sqlite), f.store, {
        metadata,
        byteLength: 5,
      }),
    ).rejects.toThrow('SHA-256 differs')
    expect(sqlite.query('SELECT count(*) AS n FROM assets').get()).toEqual({ n: 0 })
  } finally {
    sqlite.close()
  }
})
