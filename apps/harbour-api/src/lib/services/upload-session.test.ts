import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { ParquetInspection } from '@repo/core'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'
import {
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/meta-fixtures'
import type { DatasetProcessingQueue, UploadSigningEnv } from './upload-session'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir)
const tempDirs: string[] = []
const fixtureInspection: ParquetInspection = {
  rowCount: 3,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
  ],
  distinctThemeValues: ['divisions'],
  distinctTypeValues: ['division'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}
const fixtureBytes = new Uint8Array([0x50, 0x41, 0x52, 0x31])
const inspectParquetMock = mock(async () => fixtureInspection)

mock.module('@repo/core/parquet-inspector', () => ({
  inspectParquet: inspectParquetMock,
}))

const {
  handleFinalizeUploadRequest,
  handleRequeueUploadRequest,
  handleSignUploadRequest,
} = await import('./upload-session')

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-session-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
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
const queuedMessages: Array<Record<string, string>> = []
const queue: DatasetProcessingQueue = {
  async send(message) {
    queuedMessages.push(message as Record<string, string>)
  },
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer
}

afterEach(() => {
  inspectParquetMock.mockClear()
  queuedMessages.length = 0

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

    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-division.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2026',
        snapshotMonth: '2026-05',
        sourceVersion: '2026-05-24.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    expect(signResult.datasetId).toBe('overture-hk-division')
    expect(signResult.rawObjectKey).toBe('hk/overture/2026-05-24.0/division.parquet')
    expect(signResult.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))

    const finalizeResult = await handleFinalizeUploadRequest(db, bucket, queue, {
      releaseId: signResult.releaseId,
    })
    const dataset = sqlite
      .query(
        'SELECT code AS datasetId, status, rawObjectKey, originalFileName FROM releases WHERE code = ?',
      )
      .get('overture-hk-2026-05-24.0-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
    } | null

    sqlite.close()

    expect(finalizeResult.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(inspectParquetMock).toHaveBeenCalledTimes(1)
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(signResult.rawObjectKey)
    expect(dataset?.originalFileName).toBe('overture-hk-division.parquet')
    expect(queuedMessages).toEqual([
      {
        datasetId: 'overture-hk-division',
        datasetCode: 'hk-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-24.0-division',
        releaseId: signResult.releaseId,
        regionCode: 'hk',
        shardYear: '2026',
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.datasetCode,
    ).toBe('hk-division')
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.releaseCode,
    ).toBe('overture-hk-2026-05-24.0-division')
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.originalFileName,
    ).toBe('overture-hk-division.parquet')
  })

  test('requeues an existing staged release without re-finalizing the upload', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-requeue.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()

    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-division.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2026',
        snapshotMonth: '2026-05',
        sourceVersion: '2026-05-24.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(db, bucket, queue, {
      releaseId: signResult.releaseId,
    })

    inspectParquetMock.mockClear()
    queuedMessages.length = 0

    const requeued = await handleRequeueUploadRequest(db, queue, {
      releaseId: signResult.releaseId,
    })
    const processRun = sqlite
      .query(
        'SELECT phase, status, error, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .get(signResult.releaseId, 'processDataset') as {
      error: string | null
      finishedAt: string | null
      phase: string
      status: string
    } | null

    sqlite.close()

    expect(requeued.releaseCode).toBe('overture-hk-2026-05-24.0-division')
    expect(processRun).toMatchObject({
      phase: 'processDataset',
      status: 'queued',
      error: null,
      finishedAt: null,
    })
    expect(inspectParquetMock).toHaveBeenCalledTimes(0)
    expect(queuedMessages).toEqual([
      {
        datasetId: 'overture-hk-division',
        datasetCode: 'hk-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-24.0-division',
        releaseId: signResult.releaseId,
        regionCode: 'hk',
        shardYear: '2026',
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
  })
})
