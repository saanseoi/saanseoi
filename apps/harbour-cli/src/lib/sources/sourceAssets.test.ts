import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'bun:test'
import type { MetaDatabase } from '@repo/db'
import { unzipSync } from 'fflate'

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
      releaseId: upload.metadata.releaseId,
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
        releaseId: '00000000-0000-4000-8000-000000000002',
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
    expect(uploads).toEqual([
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
          releaseId: '00000000-0000-4000-8000-000000000002',
          role: 'sourceArchive',
        }),
      }),
    ])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
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
        releaseId: 'release-id',
        sourceVersion: '2026-08-22.0',
      },
      {
        upload: async (_target, input) => {
          uploads.push(input)
          return { assetId: 'asset-id', url: 'https://example.test/asset-id' }
        },
      },
    )

    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.fileName).toBe('published-boundaries.zip')
    expect(uploads[0]?.metadata.mediaType).toBe('application/zip')
    expect(uploads[0]?.metadata.manifest).toMatchObject({
      artefact: { mediaType: 'application/zip', role: 'sourceArchive' },
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
          releaseId: 'release-id',
          sourceVersion: '2026-08-22.0',
        },
        {
          upload: async (_target, input) => {
            retainedBytes = await readFile(input.filePath)
            uploads.push(input)
            return { assetId: 'asset-id', url: 'https://example.test/asset-id' }
          },
        },
      )

      expect(uploads).toHaveLength(1)
      expect(uploads[0]?.fileName).toBe(`${sourceFileName}.zip`)
      expect(uploads[0]?.metadata.mediaType).toBe('application/zip')
      expect(uploads[0]?.metadata.manifest).toMatchObject({
        artefact: { mediaType: 'application/zip', role: 'sourceArchive' },
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
          releaseId: 'release-id',
          sourceVersion: '2026-08-22.0',
        },
      ),
    ).rejects.toThrow('R2 source retention accepts ZIP or Parquet')
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
})

test('reuses an already registered local source asset without writing it again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'saanseoi-source-asset-'))
  const bytes = new TextEncoder().encode('publisher evidence')
  const contentHash = hash(bytes)
  const upload = await writeUpload(root, bytes, contentHash)
  const registry = createMemoryRegistry({
    contentHash,
    id: '11111111-1111-4111-8111-111111111111',
    assetKey: upload.metadata.assetKey,
  })

  try {
    await expect(
      registerLocalManagedSourceAsset(registry.db, upload, {
        putObject: async () => {
          throw new Error('Existing asset should not be written again.')
        },
      }),
    ).resolves.toBe('11111111-1111-4111-8111-111111111111')
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
      releaseId: '00000000-0000-4000-8000-000000000002',
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
