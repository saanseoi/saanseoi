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
    role: 'releaseSourceArchive',
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
    await expect(registerManagedSourceAsset(db, f.store, input)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'metadata unavailable' }),
    })
    expect(f.objects.has(metadata.assetKey)).toBe(true)
    expect(f.objects.size).toBe(2)
    expect(sqlite.query('SELECT count(*) AS n FROM assets').get()).toEqual({ n: 0 })
    sqlite.exec('DROP TRIGGER fail_registration')
    const receipt = await preflightManagedSourceAsset(db, f.store, {
      metadata,
      byteLength: bytes.length,
    })
    expect(receipt.needsUpload).toBe(false)
    if (receipt.needsUpload) throw new Error('Expected a verified retained object.')
    const replay = await registerManagedSourceAsset(db, f.store, input)
    expect(replay.assetId).toBe(receipt.assetId)
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
    role: 'releaseSourceArchive',
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

test('registers independently downloadable sidecars with exact source links and preserves them on replay', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'meta',
    ]),
  )
  sqlite.exec('PRAGMA foreign_keys = ON')
  const db = createLocalHarbourDb(sqlite)
  const f = createSourceAssetTestStore()
  async function retain(value: string, role: string, sourceAssetId?: string) {
    const bytes = new TextEncoder().encode(value)
    const sha256 = hash(bytes)
    const metadata = {
      assetKey: `by-source/hk/test/${sha256}-${role === 'manifest' ? 'manifest.json' : 'source.zip'}`,
      contentHash: sha256,
      mediaType: role === 'manifest' ? 'application/json' : 'application/zip',
      role,
      sourceAssetId,
      retrievedAt: '2026-10-02T00:00:00Z',
    }
    await putSourceAssetPart(
      f.store,
      sourceAssetScope(metadata.assetKey),
      sha256,
      new Response(bytes).body,
    )
    const result = await registerManagedSourceAsset(db, f.store, {
      metadata,
      fileName: role === 'manifest' ? 'manifest.json' : 'source.zip',
      byteLength: bytes.length,
      parts: [{ sha256, byteLength: bytes.length }],
    })
    return { ...result, metadata, byteLength: bytes.length }
  }
  try {
    const source = await retain('publisher ZIP bytes', 'releaseSourceArchive')
    const first = await retain(
      JSON.stringify({
        archive: { objectKey: source.metadata.assetKey },
        slot: '2026-Q1',
      }),
      'manifest',
      source.assetId,
    )
    const second = await retain(
      JSON.stringify({
        archive: { objectKey: source.metadata.assetKey },
        slot: '2026-Q2',
      }),
      'manifest',
      source.assetId,
    )
    expect(
      sqlite
        .query('SELECT id FROM assets WHERE sourceAssetId = ? ORDER BY id')
        .all(source.assetId),
    ).toEqual([first.assetId, second.assetId].sort().map(id => ({ id })))
    expect(f.objects.get(first.metadata.assetKey)?.bytes).toEqual(
      new TextEncoder().encode(
        JSON.stringify({
          archive: { objectKey: source.metadata.assetKey },
          slot: '2026-Q1',
        }),
      ),
    )
    const replay = await preflightManagedSourceAsset(db, f.store, first)
    expect(replay).toMatchObject({ assetId: first.assetId, needsUpload: false })
    // Re-registering existing retained evidence attaches its relationship without rewriting its bytes.
    sqlite
      .query('UPDATE assets SET sourceAssetId = NULL WHERE id = ?')
      .run(first.assetId)
    await preflightManagedSourceAsset(db, f.store, first)
    expect(
      sqlite.query('SELECT sourceAssetId FROM assets WHERE id = ?').get(first.assetId),
    ).toEqual({ sourceAssetId: source.assetId })
    const other = await retain('different publisher ZIP', 'releaseSourceArchive')
    await expect(
      preflightManagedSourceAsset(db, f.store, {
        ...first,
        metadata: { ...first.metadata, sourceAssetId: other.assetId },
      }),
    ).rejects.toThrow('already linked to a different source object')
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      sqlite
        .query<{ name: string }, []>('PRAGMA table_info(assets)')
        .all()
        .some(column => column.name === 'manifest'),
    ).toBe(false)
  } finally {
    sqlite.close()
  }
})

test('rejects inline manifests, unlinked sidecars and links to another manifest before transfer', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'meta',
    ]),
  )
  const db = createLocalHarbourDb(sqlite)
  const f = createSourceAssetTestStore()
  const metadata = {
    assetKey: `by-source/hk/test/${'a'.repeat(64)}-manifest.json`,
    contentHash: 'a'.repeat(64),
    mediaType: 'application/json',
    retrievedAt: '2026-10-02T00:00:00Z',
    role: 'manifest',
  }
  try {
    await expect(
      preflightManagedSourceAsset(db, f.store, { byteLength: 1, metadata }),
    ).rejects.toThrow('require sourceAssetId')
    await expect(
      preflightManagedSourceAsset(db, f.store, {
        byteLength: 1,
        metadata: { ...metadata, sourceAssetId: crypto.randomUUID() },
      }),
    ).rejects.toThrow('registered source object')
    await expect(
      preflightManagedSourceAsset(db, f.store, {
        byteLength: 1,
        metadata: {
          ...metadata,
          role: 'releaseSourceArchive',
          sourceAssetId: crypto.randomUUID(),
        },
      }),
    ).rejects.toThrow('Only manifest assets')
    await expect(
      preflightManagedSourceAsset(db, f.store, {
        byteLength: 1,
        metadata: { ...metadata, manifest: {} } as typeof metadata,
      }),
    ).rejects.toThrow('separate managed asset')
    const manifestId = crypto.randomUUID()
    sqlite
      .query(
        'INSERT INTO assets (id, assetKey, contentHash, byteLength, mediaType, role, retrievedAt) VALUES (?, ?, ?, 1, ?, ?, ?)',
      )
      .run(
        manifestId,
        metadata.assetKey,
        metadata.contentHash,
        metadata.mediaType,
        metadata.role,
        metadata.retrievedAt,
      )
    await expect(
      preflightManagedSourceAsset(db, f.store, {
        byteLength: 1,
        metadata: { ...metadata, sourceAssetId: manifestId },
      }),
    ).rejects.toThrow('registered source object')
    expect(f.objects.size).toBe(0)
  } finally {
    sqlite.close()
  }
})
