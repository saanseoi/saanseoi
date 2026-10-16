import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import type { MetaDatabase } from '@repo/db'
import { unzipSync } from 'fflate'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'

import type { withLocalMetaDb } from '../dbCache/localDbCache.ts'
import {
  buildSourceAssetObjectKey,
  buildSourceReleaseAssetFileName,
  buildSourceReleaseAssetObjectKey,
  registerLocalManagedSourceAsset,
  type ManagedSourceAssetUpload,
  uploadManagedSourceAsset,
  uploadSourceReleaseAsset,
} from './sourceAssets.ts'

test('registers a local source asset after storing its immutable object', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('publisher evidence')
  const contentHash = hash(bytes)
  const upload = await writeUpload(root, bytes, contentHash)
  const registry = createMemoryRegistry()
  const uploads: Array<{ objectKey: string }> = []

  try {
    const result = await uploadManagedSourceAsset(
      { environment: 'dev', remote: false },
      upload,
      {
        putObject: async input => {
          uploads.push({ objectKey: input.objectKey })
        },
        withMetaDb: (async work => work(registry.db)) as typeof withLocalMetaDb,
      },
    )
    const assetId = result.assetId

    expect(result.url).toBe(`http://localhost:8787/v0/assets/${assetId}`)
    expect(assetId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(uploads).toEqual([{ objectKey: upload.metadata.assetKey }])
    expect(registry.rows.get(upload.metadata.assetKey)).toMatchObject({
      contentHash,
      datasetId: upload.metadata.datasetId,
      id: assetId,
      mediaType: 'application/pdf',
      resourceReleaseId: upload.metadata.resourceReleaseId,
      role: 'governmentNotice',
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('retains an Overture release Parquet as a managed source asset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('overture parquet source')
  const filePath = join(root, 'division.division.intersects.clipSmart.parquet')
  const contentHash = hash(bytes)
  const uploads: ManagedSourceAssetUpload[] = []

  try {
    await writeFile(filePath, bytes)
    await uploadSourceReleaseAsset(
      { environment: 'dev', remote: false },
      {
        datasetCode: 'ds-hk-overture-division',
        datasetId: '00000000-0000-4000-8000-000000000001',
        filePath,
        publisherCode: 'overture',
        releaseCode: 'dr-hk-overture-division-2026-01-21.0',
        resourceReleaseId: '00000000-0000-4000-8000-000000000002',
        sourceVersion: '2026-01-21.0',
      },
      {
        now: () => new Date('2026-07-30T00:00:00.000Z'),
        upload: async (_target, input) => {
          uploads.push(input)
          return {
            assetId: 'asset-id',
            url: 'http://localhost:8787/v0/assets/asset-id',
          }
        },
      },
    )

    const fileName = buildSourceReleaseAssetFileName({
      datasetCode: 'ds-hk-overture-division',
      sourceVersion: '2026-01-21.0',
    })
    expect(uploads[0]).toEqual(
      expect.objectContaining({
        fileName,
        filePath,
        metadata: expect.objectContaining({
          assetKey: buildSourceReleaseAssetObjectKey({
            datasetCode: 'ds-hk-overture-division',
            fileName,
            publisherCode: 'overture',
            releaseCode: 'dr-hk-overture-division-2026-01-21.0',
            sha256: contentHash,
          }),
          contentHash,
          datasetId: '00000000-0000-4000-8000-000000000001',
          mediaType: 'application/vnd.apache.parquet',
          resourceReleaseId: '00000000-0000-4000-8000-000000000002',
          role: 'releaseSourceArchive',
        }),
      }),
    )
    expect(uploads).toHaveLength(2)
    expect(uploads[1]?.metadata).toMatchObject({
      role: 'manifest',
      sourceAssetId: 'asset-id',
      resourceReleaseId: '00000000-0000-4000-8000-000000000002',
    })
    const sidecarBytes = await readFile(uploads[1]!.filePath)
    expect(uploads[1]?.metadata.contentHash).toBe(hash(sidecarBytes))
    expect(uploads[1]?.metadata.assetKey).toContain(
      `${hash(sidecarBytes)}-manifest.json`,
    )
    expect(JSON.parse(sidecarBytes.toString()).artefact.objectKey).toBe(
      uploads[0]?.metadata.assetKey,
    )
    expect(uploads[0]?.metadata).not.toHaveProperty('manifest')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('encodes compound materialisation release codes in source asset paths', () => {
  expect(
    buildSourceReleaseAssetObjectKey({
      datasetCode: 'ds-hk-hkgov-censtatd-district',
      fileName: 'division-area.gml.zip',
      publisherCode: 'hkgov-censtatd',
      releaseCode: 'dr-hk-hkgov-censtatd-district-2016::divisionArea',
      sha256: 'a'.repeat(64),
    }),
  ).toBe(
    'by-source/hk/hkgov-censtatd/ds-hk-hkgov-censtatd-district/' +
      'dr-hk-hkgov-censtatd-district-2016__divisionArea/' +
      `${'a'.repeat(64)}-division-area.gml.zip`,
  )
})

test('retains a published source archive with its original filename and media type', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const archivePath = join(outputDir, 'published-boundaries.zip')
  await writeFile(archivePath, new Uint8Array([1, 2, 3]))
  const uploads: ManagedSourceAssetUpload[] = []

  try {
    await uploadSourceReleaseAsset(
      { environment: 'dev', remote: false },
      {
        datasetCode: 'ds-hk-example-division',
        datasetId: 'dataset-id',
        fileName: 'published-boundaries.zip',
        filePath: archivePath,
        publisherCode: 'example',
        releaseCode: 'dr-hk-example-division-2026-08-22.0',
        resourceReleaseId: 'release-id',
        sourceVersion: '2026-08-22.0',
      },
      {
        upload: async (_target, input) => {
          uploads.push(input)
          return { assetId: 'asset-id', url: 'https://example.test/asset-id' }
        },
      },
    )

    expect(uploads).toHaveLength(2)
    expect(uploads[0]?.fileName).toBe('published-boundaries.zip')
    expect(uploads[0]?.metadata.mediaType).toBe('application/zip')
    expect(JSON.parse(await readFile(uploads[1]!.filePath, 'utf8'))).toMatchObject({
      artefact: { mediaType: 'application/zip', role: 'releaseSourceArchive' },
    })
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
})

test.each([
  ['boundaries.geojson', 'application/geo+json'],
  ['boundaries.gml', 'application/gml+xml'],
] as const)(
  'losslessly ZIP-compresses a direct %s source before retaining it',
  async (sourceFileName, sourceMediaType) => {
    const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
    const sourcePath = join(outputDir, sourceFileName)
    const sourceBytes = new TextEncoder().encode('publisher source bytes')
    const uploads: ManagedSourceAssetUpload[] = []
    let retainedBytes: Uint8Array | undefined

    await writeFile(sourcePath, sourceBytes)
    try {
      await uploadSourceReleaseAsset(
        { environment: 'dev', remote: false },
        {
          datasetCode: 'ds-hk-example-division',
          datasetId: 'dataset-id',
          fileName: sourceFileName,
          filePath: sourcePath,
          publisherCode: 'example',
          releaseCode: 'dr-hk-example-division-2026-08-22.0',
          resourceReleaseId: 'release-id',
          sourceVersion: '2026-08-22.0',
        },
        {
          upload: async (_target, input) => {
            if (input.metadata.role === 'releaseSourceArchive')
              retainedBytes = await readFile(input.filePath)
            uploads.push(input)
            return { assetId: 'asset-id', url: 'https://example.test/asset-id' }
          },
        },
      )

      expect(uploads).toHaveLength(2)
      expect(uploads[0]?.fileName).toBe(`${sourceFileName}.zip`)
      expect(uploads[0]?.metadata.mediaType).toBe('application/zip')
      expect(JSON.parse(await readFile(uploads[1]!.filePath, 'utf8'))).toMatchObject({
        artefact: { mediaType: 'application/zip', role: 'releaseSourceArchive' },
        original: {
          byteLength: sourceBytes.byteLength,
          fileName: sourceFileName,
          mediaType: sourceMediaType,
          sha256: hash(sourceBytes),
        },
        packaging: 'saanseoi-lossless-zip',
      })
      expect(unzipSync(retainedBytes as Uint8Array)[sourceFileName]).toEqual(
        sourceBytes,
      )
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  },
)

test('rejects a direct source asset that is neither ZIP nor Parquet', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const sourcePath = join(outputDir, 'source.csv')
  await writeFile(sourcePath, 'name,value\nexample,1\n', 'utf8')

  try {
    await expect(
      uploadSourceReleaseAsset(
        { environment: 'dev', remote: false },
        {
          datasetCode: 'ds-hk-example-division',
          datasetId: 'dataset-id',
          fileName: 'source.csv',
          filePath: sourcePath,
          publisherCode: 'example',
          releaseCode: 'dr-hk-example-division-2026-08-22.0',
          resourceReleaseId: 'release-id',
          sourceVersion: '2026-08-22.0',
        },
      ),
    ).rejects.toThrow('R2 source retention accepts ZIP or Parquet')
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
})

test('rechecks an already registered local source object without duplicating metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('publisher evidence')
  const contentHash = hash(bytes)
  const upload = await writeUpload(root, bytes, contentHash)
  const registry = createMemoryRegistry({
    contentHash,
    id: '11111111-1111-4111-8111-111111111111',
    assetKey: upload.metadata.assetKey,
  })
  let checked = false

  try {
    await expect(
      registerLocalManagedSourceAsset(registry.db, upload, {
        putObject: async () => {
          checked = true
        },
      }),
    ).resolves.toBe('11111111-1111-4111-8111-111111111111')
    expect(checked).toBe(true)
    expect(registry.rows.size).toBe(1)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('retries a transient local metadata lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('publisher evidence')
  const contentHash = hash(bytes)
  const upload = await writeUpload(root, bytes, contentHash)
  const registry = createMemoryRegistry()
  let attempts = 0

  try {
    await expect(
      uploadManagedSourceAsset({ environment: 'dev', remote: false }, upload, {
        putObject: async () => {},
        withMetaDb: (async work => {
          attempts += 1
          if (attempts === 1) throw new Error('database is locked')
          return work(registry.db)
        }) as typeof withLocalMetaDb,
      }),
    ).resolves.toMatchObject({
      url: expect.stringMatching(/^http:\/\/localhost:8787\/v0\/assets\//),
    })
    expect(attempts).toBe(2)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('refuses a local source asset whose bytes differ from its declared hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('publisher evidence')
  const upload = await writeUpload(root, bytes, 'a'.repeat(64))
  const registry = createMemoryRegistry()

  try {
    await expect(
      registerLocalManagedSourceAsset(registry.db, upload, {
        putObject: async () => {
          throw new Error('Invalid asset should not be written.')
        },
      }),
    ).rejects.toThrow('SHA-256 does not match')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('local registration retains a linked sidecar and reuses the same asset IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-sidecar-'))
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'meta',
    ]),
  )
  sqlite.exec('PRAGMA foreign_keys = ON')
  const db = createLocalHarbourDb(sqlite) as unknown as MetaDatabase
  const objects = new Map<string, Uint8Array>()
  const options = {
    putObject: async (input: { objectKey: string; filePath: string }) => {
      objects.set(input.objectKey, await readFile(input.filePath))
    },
  }
  try {
    const bytes = new TextEncoder().encode('publisher evidence')
    const source = await writeUpload(root, bytes, hash(bytes))
    const sourceInput = {
      ...source,
      metadata: {
        ...source.metadata,
        datasetId: undefined,
        resourceReleaseId: undefined,
      },
    }
    const sourceAssetId = await registerLocalManagedSourceAsset(
      db,
      sourceInput,
      options,
    )
    const manifestBytes = new TextEncoder().encode(
      JSON.stringify({
        artefact: { objectKey: source.metadata.assetKey, sha256: hash(bytes) },
      }),
    )
    const filePath = join(root, 'manifest.json')
    await writeFile(filePath, manifestBytes)
    const manifest: ManagedSourceAssetUpload = {
      fileName: 'manifest.json',
      filePath,
      metadata: {
        assetKey: buildSourceAssetObjectKey(hash(manifestBytes), 'manifest.json'),
        contentHash: hash(manifestBytes),
        mediaType: 'application/json',
        retrievedAt: source.metadata.retrievedAt,
        role: 'manifest',
        sourceAssetId,
      },
    }
    const manifestId = await registerLocalManagedSourceAsset(db, manifest, options)
    expect(await registerLocalManagedSourceAsset(db, manifest, options)).toBe(
      manifestId,
    )
    expect(
      sqlite.query('SELECT sourceAssetId FROM assets WHERE id = ?').get(manifestId),
    ).toEqual({ sourceAssetId })
    expect(objects.get(manifest.metadata.assetKey)).toEqual(manifestBytes)
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(objects.size).toBe(2)
  } finally {
    sqlite.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('a failed sidecar upload resumes with the same immutable manifest despite a later retrieval time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-retry-'))
  const filePath = join(root, 'publisher.zip')
  await writeFile(filePath, 'publisher ZIP bytes')
  const uploads: ManagedSourceAssetUpload[] = []
  let failSidecar = true
  const input = {
    datasetCode: 'ds-hk-example-division',
    datasetId: 'dataset-id',
    fileName: 'publisher.zip',
    filePath,
    publisherCode: 'example',
    releaseCode: 'dr-hk-example-division-2026-10-02.0',
    resourceReleaseId: 'release-id',
    sourceVersion: '2026-10-02.0',
  }
  const upload = async (_target: unknown, asset: ManagedSourceAssetUpload) => {
    uploads.push(asset)
    if (asset.metadata.role === 'manifest' && failSidecar)
      throw new Error('sidecar transfer interrupted')
    return {
      assetId: asset.metadata.role === 'manifest' ? 'manifest-id' : 'source-id',
      url: 'https://example.test/asset',
    }
  }
  try {
    await expect(
      uploadSourceReleaseAsset({ environment: 'dev', remote: false }, input, {
        upload,
        now: () => new Date('2026-10-02'),
      }),
    ).rejects.toThrow('sidecar transfer interrupted')
    failSidecar = false
    const result = await uploadSourceReleaseAsset(
      { environment: 'dev', remote: false },
      input,
      { upload, now: () => new Date('2026-10-03') },
    )
    expect(result.assetId).toBe('source-id')
    expect(result.manifest.assetId).toBe('manifest-id')
    expect(uploads[1]?.metadata.assetKey).toBe(uploads[3]?.metadata.assetKey)
    expect(uploads[3]?.metadata.sourceAssetId).toBe('source-id')
    expect(await readFile(uploads[3]!.filePath)).toEqual(
      await readFile(uploads[1]!.filePath),
    )
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

async function writeUpload(root: string, bytes: Uint8Array, contentHash: string) {
  const filePath = join(root, 'notice.pdf')
  await writeFile(filePath, bytes)
  return {
    fileName: 'notice.pdf',
    filePath,
    metadata: {
      assetKey: buildSourceAssetObjectKey(contentHash, 'notice.pdf'),
      contentHash,
      datasetId: '00000000-0000-4000-8000-000000000001',
      mediaType: 'application/pdf',
      originalUrl: 'https://www.landsd.gov.hk/example/notice.pdf',
      resourceReleaseId: '00000000-0000-4000-8000-000000000002',
      retrievedAt: '2026-07-26T00:00:00.000Z',
      role: 'governmentNotice',
    },
  } satisfies ManagedSourceAssetUpload
}

function createMemoryRegistry(initial?: {
  assetKey: string
  contentHash: string
  id: string
}) {
  const rows = new Map<
    string,
    Record<string, unknown> & { contentHash: string; id: string }
  >()
  if (initial) rows.set(initial.assetKey, initial)

  const db = {
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          run: async () => {
            const assetKey = String(value.assetKey)
            if (!rows.has(assetKey)) {
              rows.set(assetKey, {
                ...value,
                contentHash: String(value.contentHash),
                id: String(value.id),
              })
            }
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => rows.values().next().value,
        }),
      }),
    }),
  } as unknown as MetaDatabase

  return { db, rows }
}

function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

test('production R2 retains objects but registers IDs only in local metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-assets-r2-'))
  try {
    const bytes = new TextEncoder().encode('evidence')
    const upload = await writeUpload(root, bytes, hash(bytes))
    const registry = createMemoryRegistry()
    let remoteWrites = 0
    let localWrites = 0
    const options = {
      withMetaDb: async <T>(work: (db: MetaDatabase) => T | Promise<T>) =>
        work(registry.db),
      putObject: async () => {
        localWrites++
      },
      retainRemoteFile: async (environment: string, key: string, path: string) => {
        expect(environment).toBe('production')
        expect(key).toBe(upload.metadata.assetKey)
        expect(new Uint8Array(await readFile(path))).toEqual(bytes)
        remoteWrites++
      },
    }
    const target = {
      environment: 'dev' as const,
      remote: false,
      r2: 'production' as const,
    }
    const result = await uploadManagedSourceAsset(target, upload, options)
    const replay = await uploadManagedSourceAsset(target, upload, options)
    expect(result.url).toBe(`https://api.saanseoi.hk/v0/assets/${result.assetId}`)
    expect(replay.assetId).toBe(result.assetId)
    expect(registry.rows.size).toBe(1)
    expect(localWrites).toBe(2)
    // Re-check R2 even when registration is already present locally.
    expect(remoteWrites).toBe(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
