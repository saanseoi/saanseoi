import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../testing/local-db'
import { handleUploadRequest } from './upload-request'

const migrationSql = readFileSync(
  resolve(
    import.meta.dir,
    '../../../../../libs/db/migrations/20260602105608_ordinary_true_believers.sql',
  ),
  'utf8',
)

const fixtureFile = resolve(import.meta.dir, '../../../../../data/division.parquet')
const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-request-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  return db
}

class FakeR2Bucket {
  objects = new Map<
    string,
    {
      customMetadata?: Record<string, string>
      value: Blob | null
    }
  >()

  async head(key: string) {
    const object = this.objects.get(key)

    if (!object) {
      return null
    }

    return {
      key,
      customMetadata: object.customMetadata,
    }
  }

  async put(
    key: string,
    value: Blob | null,
    options?: { customMetadata?: Record<string, string> },
  ) {
    this.objects.set(key, {
      customMetadata: options?.customMetadata,
      value,
    })

    return {
      key,
      customMetadata: options?.customMetadata,
    }
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('handleUploadRequest', () => {
  test('uploads parquet to R2 and registers the dataset in Harbour', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const formData = new FormData()

    formData.set(
      'file',
      new File([readFileSync(fixtureFile)], 'division.parquet', {
        type: 'application/octet-stream',
      }),
    )
    formData.set('snapshotMonth', '2026-05')

    const result = await handleUploadRequest(db, bucket, formData)
    const dataset = sqlite
      .query('SELECT datasetId, status, rawObjectKey FROM datasets WHERE datasetId = ?')
      .get('hk-2026-05-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
    } | null

    sqlite.close()

    expect(result.plan.datasetId).toBe('hk-2026-05-division')
    expect(result.rawObjectKey).toBe(
      'raw/hk/divisions/division/2026-05/2026-05/division.parquet',
    )
    expect(bucket.objects.get(result.rawObjectKey ?? '')?.customMetadata?.datasetId).toBe(
      'hk-2026-05-division',
    )
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(result.rawObjectKey ?? undefined)
  })

  test('does not upload a new object when Harbour preflight rejects the dataset', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const formData = new FormData()

    formData.set(
      'file',
      new File([readFileSync(fixtureFile)], 'division.parquet', {
        type: 'application/octet-stream',
      }),
    )
    formData.set('snapshotMonth', '2026-05')

    await handleUploadRequest(db, bucket, formData)

    const duplicateFormData = new FormData()
    duplicateFormData.set(
      'file',
      new File([readFileSync(fixtureFile)], 'division.parquet', {
        type: 'application/octet-stream',
      }),
    )
    duplicateFormData.set('snapshotMonth', '2026-05')

    await expect(handleUploadRequest(db, bucket, duplicateFormData)).rejects.toThrow(
      'strictly newer monthly uploads',
    )
    expect(bucket.objects.size).toBe(1)

    sqlite.close()
  })
})
