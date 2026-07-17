import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import { inspectLocalArtifact, listInspectableReleaseCodes } from './inspect.ts'

describe('inspectLocalArtifact', () => {
  test('copies a sampled normalized JSON artifact', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-inspect-'))

    try {
      const persistDir = await createLocalR2Fixture(tempDir, [
        {
          blobId: 'normalized-first',
          body: '{"rowStart":0}',
          key: 'processed/address/dr-hk-hkgov-dpo-address-2026-06-26.0/normalized/000000000000-000000001024.json',
          uploaded: 1,
        },
        {
          blobId: 'normalized-last',
          body: '{"rowStart":1024}',
          key: 'processed/address/dr-hk-hkgov-dpo-address-2026-06-26.0/normalized/000000001024-000000002048.json',
          uploaded: 2,
        },
      ])
      const outDir = join(tempDir, 'out')
      const result = inspectLocalArtifact({
        outDir,
        persistDir,
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-26.0',
        resourceType: 'address',
        sample: 'last',
        stage: 'normalized',
      })

      expect(result.rowStart).toBe(1024)
      expect(result.outputPath.endsWith('-normalized-last.json')).toBe(true)
      expect(await Bun.file(result.outputPath).text()).toBe('{"rowStart":1024}')
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  test('combines current init and first delta SQL artifacts', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'harbour-inspect-'))

    try {
      const persistDir = await createLocalR2Fixture(tempDir, [
        {
          blobId: 'current-init',
          body: 'INIT;',
          key: 'processed/dr-hk-hkgov-dpo-address-2026-06-26.0/sql/current/address-hkgov-current-init.sql',
          uploaded: 1,
        },
        {
          blobId: 'current-0',
          body: 'DELTA;',
          key: 'processed/dr-hk-hkgov-dpo-address-2026-06-26.0/sql/current/address-hkgov-current-0.sql',
          uploaded: 2,
        },
      ])
      const outDir = join(tempDir, 'out')
      const releaseCodes = listInspectableReleaseCodes({
        dbShard: 'current',
        persistDir,
        resourceType: 'address',
        stage: 'operations',
      })
      const result = inspectLocalArtifact({
        dbShard: 'current',
        outDir,
        persistDir,
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-26.0',
        resourceType: 'address',
        sample: 'first',
        stage: 'operations',
      })
      const body = await Bun.file(result.outputPath).text()

      expect(releaseCodes).toEqual(['dr-hk-hkgov-dpo-address-2026-06-26.0'])
      expect(result.sourceKeys).toHaveLength(2)
      expect(body).toContain('INIT;')
      expect(body).toContain('DELTA;')
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })
})

async function createLocalR2Fixture(
  tempDir: string,
  objects: Array<{
    blobId: string
    body: string
    key: string
    uploaded: number
  }>,
) {
  const persistDir = join(tempDir, 'd1', 'dev')
  const objectDbDir = join(persistDir, 'v3', 'r2', 'miniflare-R2BucketObject')
  const blobDir = join(persistDir, 'v3', 'r2', 'ss-raw-preview', 'blobs')

  await mkdir(objectDbDir, { recursive: true })
  await mkdir(blobDir, { recursive: true })

  const db = new Database(join(objectDbDir, 'objects.sqlite'))

  db.exec(`
    CREATE TABLE _mf_objects (
      key TEXT NOT NULL,
      blob_id TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded INTEGER NOT NULL
    );
  `)

  const insert = db.query(
    'INSERT INTO _mf_objects (key, blob_id, size, uploaded) VALUES ($key, $blobId, $size, $uploaded)',
  )

  for (const object of objects) {
    await writeFile(join(blobDir, object.blobId), object.body)
    insert.run({
      $blobId: object.blobId,
      $key: object.key,
      $size: Buffer.byteLength(object.body),
      $uploaded: object.uploaded,
    })
  }

  db.close()

  return persistDir
}
