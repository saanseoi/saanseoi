import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import { inspectParquetFile } from '@repo/core/parquet-inspector-node'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'
import {
  handleFinalizeUploadRequest,
  handleSignUploadRequest,
  type UploadSigningEnv,
} from './upload-session'

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
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-session-test-'))
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
      value: ArrayBuffer | Blob | null
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

  async get(key: string) {
    const object = this.objects.get(key)

    if (!object) {
      return null
    }

    return {
      async arrayBuffer() {
        if (object.value instanceof Blob) {
          return object.value.arrayBuffer()
        }

        return object.value ?? new ArrayBuffer(0)
      },
    }
  }

  async put(
    key: string,
    value: ArrayBuffer | Blob | null,
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
}

const signingEnv: UploadSigningEnv = {
  R2_ACCOUNT_ID: '1234567890abcdef1234567890abcdef',
  R2_RAW_ACCESS_KEY_ID: 'test-access-key',
  R2_RAW_BUCKET_NAME: 'ss-raw-preview',
  R2_RAW_SECRET_ACCESS_KEY: 'test-secret-key',
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('upload session flow', () => {
  test('signs a direct upload and finalizes it into a staged dataset', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const inspection = await inspectParquetFile(fixtureFile)

    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'division.parquet',
      fileSize: readFileSync(fixtureFile).byteLength,
      inspection,
      plan: {
        snapshotMonth: '2026-05',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    expect(signResult.datasetId).toBe('hk-2026-05-division')
    expect(signResult.rawObjectKey).toBe(
      'raw/hk/divisions/division/2026-05/2026-05/division.parquet',
    )
    expect(signResult.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(readFileSync(fixtureFile)))

    const finalizeResult = await handleFinalizeUploadRequest(db, bucket, {
      datasetId: signResult.datasetId,
    })
    const dataset = sqlite
      .query('SELECT datasetId, status, rawObjectKey FROM datasets WHERE datasetId = ?')
      .get('hk-2026-05-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
    } | null

    sqlite.close()

    expect(finalizeResult.plan.datasetId).toBe('hk-2026-05-division')
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(signResult.rawObjectKey)
    expect(bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.datasetId).toBe(
      'hk-2026-05-division',
    )
  })
})
