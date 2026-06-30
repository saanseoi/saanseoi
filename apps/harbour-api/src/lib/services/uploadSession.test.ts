import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { DatasetProcessingMessage, ParquetInspection } from '@repo/core'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'
import {
  handleFinalizeUploadRequest,
  handleRequeueUploadRequest,
  handleSignUploadRequest,
  type DatasetProcessingQueue,
  type UploadSigningEnv,
} from './uploadSession'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir)
const tempDirs: string[] = []
const sqliteHandles: Database[] = []
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
const addressFixtureInspection: ParquetInspection = {
  rowCount: 2050,
  schema: [
    { name: 'id', type: 'string', nullable: false },
    { name: 'theme', type: 'string', nullable: true },
    { name: 'type', type: 'string', nullable: true },
    { name: 'country', type: 'string', nullable: true },
    { name: 'region', type: 'string', nullable: true },
    { name: 'address_levels', type: 'list', nullable: true },
    { name: 'street', type: 'string', nullable: true },
    { name: 'number', type: 'string', nullable: true },
    { name: 'geometry', type: 'json', nullable: true },
    { name: 'bbox', type: 'json', nullable: true },
    { name: 'sources', type: 'json', nullable: true },
    { name: 'version', type: 'int64', nullable: true },
  ],
  distinctThemeValues: ['addresses'],
  distinctTypeValues: ['address'],
  distinctCountryValues: ['hk'],
  distinctRegionValues: ['hk'],
}
const fixtureBytes = new Uint8Array([0x50, 0x41, 0x52, 0x31])
const inspectParquetMock = mock(async () => fixtureInspection)

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-upload-session-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
  sqliteHandles.push(db)
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
type QueuedMessage = Parameters<DatasetProcessingQueue['send']>[0]

const queuedMessages: QueuedMessage[] = []
const queue: DatasetProcessingQueue = {
  async send(message) {
    queuedMessages.push(message)
  },
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer
}

afterEach(() => {
  inspectParquetMock.mockClear()
  queuedMessages.length = 0

  while (sqliteHandles.length > 0) {
    sqliteHandles.pop()?.close()
  }

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
        shardYear: '2025',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    expect(signResult.datasetId).toBe('overture-hk-division')
    expect(signResult.rawObjectKey).toBe('hk/overture/2026-05-20.0/division.parquet')
    expect(signResult.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))

    const finalizeResult = await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectParquetMock,
      },
    )
    const dataset = sqlite
      .query(
        'SELECT code AS datasetId, status, rawObjectKey, originalFileName FROM releases WHERE code = ?',
      )
      .get('overture-hk-2026-05-20.0-division') as {
      datasetId: string
      status: string
      rawObjectKey: string
      originalFileName: string
    } | null

    expect(finalizeResult.plan.datasetId).toBe('overture-hk-2026-05-20.0-division')
    expect(inspectParquetMock).toHaveBeenCalledTimes(1)
    expect(dataset?.status).toBe('staged')
    expect(dataset?.rawObjectKey).toBe(signResult.rawObjectKey)
    expect(dataset?.originalFileName).toBe('overture-hk-division.parquet')
    expect(queuedMessages).toEqual([
      {
        datasetId: 'overture-hk-division',
        datasetCode: 'ds-hk-overture-division',
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-20.0-division',
        releaseId: signResult.releaseId,
        regionCode: 'hk',
        shardYear: '2025',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.datasetCode,
    ).toBe('ds-hk-overture-division')
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.releaseCode,
    ).toBe('overture-hk-2026-05-20.0-division')
    expect(
      bucket.objects.get(signResult.rawObjectKey)?.customMetadata?.originalFileName,
    ).toBe('overture-hk-division.parquet')
  })

  test('finalizes address uploads into preplanned row-range jobs', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-address.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const inspectAddressParquetMock = mock(async () => addressFixtureInspection)

    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-address.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: addressFixtureInspection,
      plan: {
        shardYear: '2026',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
        type: 'address',
        theme: 'addresses',
      },
      schemaVersionId: 'overture-address-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectAddressParquetMock,
      },
    )

    const addressMessages = queuedMessages as DatasetProcessingMessage[]

    expect(addressMessages).toHaveLength(3)
    expect(addressMessages.map(message => [message.rowStart, message.rowEnd])).toEqual([
      [0, 1024],
      [1024, 2048],
      [2048, 2050],
    ])
    for (const message of addressMessages) {
      expect(message).toEqual(
        expect.objectContaining({
          addressStage: 'normalize',
          chunkSize: 1024,
          preplannedAddressChunks: true,
          processingRunStartedAt: addressMessages[0]?.processingRunStartedAt,
          totalRows: 2050,
          type: 'address',
        }),
      )
    }
  })

  test('requeues address uploads as preplanned row-range jobs', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-address-requeue.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const inspectAddressParquetMock = mock(async () => addressFixtureInspection)

    const signResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-address.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: addressFixtureInspection,
      plan: {
        shardYear: '2026',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
        type: 'address',
        theme: 'addresses',
      },
      schemaVersionId: 'overture-address-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectAddressParquetMock,
      },
    )

    queuedMessages.length = 0

    const requeued = await handleRequeueUploadRequest(db, queue, {
      releaseId: signResult.releaseId,
    })
    const addressMessages = queuedMessages as DatasetProcessingMessage[]

    expect(requeued.status).toBe('queued')
    expect(requeued.rowCount).toBe(2050)
    expect(addressMessages).toHaveLength(3)
    expect(addressMessages.map(message => [message.rowStart, message.rowEnd])).toEqual([
      [0, 1024],
      [1024, 2048],
      [2048, 2050],
    ])
    expect(
      new Set(addressMessages.map(message => message.processingRunStartedAt)).size,
    ).toBe(1)
    expect(addressMessages.every(message => message.preplannedAddressChunks)).toBe(true)
  })

  test('force signing replaces an interrupted uploading session', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-force-sign.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const request = {
      contentType: 'application/octet-stream',
      fileName: 'overture-hk-division.parquet',
      fileSize: fixtureBytes.byteLength,
      inspection: fixtureInspection,
      plan: {
        shardYear: '2026',
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    }

    const firstSignResult = await handleSignUploadRequest(
      db,
      bucket,
      signingEnv,
      request,
    )

    await expect(
      handleSignUploadRequest(db, bucket, signingEnv, request),
    ).rejects.toThrow(
      'Dataset already exists with status uploading: overture-hk-division',
    )

    const forcedSignResult = await handleSignUploadRequest(db, bucket, signingEnv, {
      ...request,
      force: true,
    })

    expect(forcedSignResult.releaseId).toBe(firstSignResult.releaseId)
    expect(forcedSignResult.rawObjectKey).toBe(firstSignResult.rawObjectKey)
    expect(forcedSignResult.status).toBe('uploading')
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
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectParquetMock,
      },
    )

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
    const release = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(signResult.releaseId) as { status: string } | null

    expect(requeued.releaseCode).toBe('overture-hk-2026-05-20.0-division')
    expect(requeued.rowCount).toBe(3)
    expect(requeued.status).toBe('queued')
    expect(release?.status).toBe('staged')
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
        datasetCode: 'ds-hk-overture-division',
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-20.0-division',
        releaseId: signResult.releaseId,
        regionCode: 'hk',
        shardYear: '2026',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
  })

  test('requeues a failed release by reopening the processDataset ingest run', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-requeue-failed.sqlite')
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
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectParquetMock,
      },
    )

    sqlite
      .query('UPDATE releases SET status = ?, updatedAt = ? WHERE id = ?')
      .run('failed', '2026-06-24T12:00:00.000Z', signResult.releaseId)
    sqlite
      .query(
        `
          INSERT INTO ingestRuns (
            runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(releaseId, phase) DO UPDATE SET
            status = excluded.status,
            stats = excluded.stats,
            error = excluded.error,
            startedAt = excluded.startedAt,
            finishedAt = excluded.finishedAt,
            updatedAt = excluded.updatedAt
        `,
      )
      .run(
        'process-run-failed',
        signResult.releaseId,
        'processDataset',
        'error',
        JSON.stringify({
          processedRows: 1,
        }),
        JSON.stringify({
          message: 'previous failure',
        }),
        '2026-06-24T12:00:00.000Z',
        '2026-06-24T12:05:00.000Z',
        '2026-06-24T12:00:00.000Z',
        '2026-06-24T12:05:00.000Z',
      )

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
    const release = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(signResult.releaseId) as { status: string } | null

    expect(requeued.releaseCode).toBe('overture-hk-2026-05-20.0-division')
    expect(requeued.rowCount).toBe(3)
    expect(requeued.status).toBe('queued')
    expect(release?.status).toBe('staged')
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
        datasetCode: 'ds-hk-overture-division',
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-20.0-division',
        releaseId: signResult.releaseId,
        regionCode: 'hk',
        shardYear: '2026',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
  })

  test('does not enqueue a duplicate processDataset message when the release is already queued', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-requeue-queued.sqlite')
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
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectParquetMock,
      },
    )

    queuedMessages.length = 0
    sqlite
      .query(
        `
          INSERT INTO ingestRuns (
            runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(releaseId, phase) DO UPDATE SET
            status = excluded.status,
            stats = excluded.stats,
            error = excluded.error,
            startedAt = excluded.startedAt,
            finishedAt = excluded.finishedAt,
            updatedAt = excluded.updatedAt
        `,
      )
      .run(
        'process-run-queued',
        signResult.releaseId,
        'processDataset',
        'queued',
        null,
        null,
        '2026-06-24T12:00:00.000Z',
        null,
        '2026-06-24T12:00:00.000Z',
        '2026-06-24T12:00:00.000Z',
      )

    const requeued = await handleRequeueUploadRequest(db, queue, {
      releaseId: signResult.releaseId,
    })
    const release = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(signResult.releaseId) as { status: string } | null

    expect(requeued.status).toBe('queued')
    expect(release?.status).toBe('staged')
    expect(requeued.rowCount).toBe(3)
    expect(queuedMessages).toEqual([])
  })

  test('force requeues a processing release', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-requeue-processing-force.sqlite')
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
        cohortKey: '2026-05',
        sourceVersion: '2026-05-20.0',
      },
      schemaVersionId: 'overture-division-v2025-09-24.0',
    })

    await bucket.put(signResult.rawObjectKey, toArrayBuffer(fixtureBytes))
    await handleFinalizeUploadRequest(
      db,
      bucket,
      queue,
      {
        releaseId: signResult.releaseId,
      },
      {
        inspectParquet: inspectParquetMock,
      },
    )

    queuedMessages.length = 0
    sqlite
      .query('UPDATE releases SET status = ?, updatedAt = ? WHERE id = ?')
      .run('processing', '2026-06-24T12:00:00.000Z', signResult.releaseId)
    sqlite
      .query(
        `
          INSERT INTO ingestRuns (
            runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(releaseId, phase) DO UPDATE SET
            status = excluded.status,
            stats = excluded.stats,
            error = excluded.error,
            startedAt = excluded.startedAt,
            finishedAt = excluded.finishedAt,
            updatedAt = excluded.updatedAt
        `,
      )
      .run(
        'process-run-running',
        signResult.releaseId,
        'processDataset',
        'running',
        JSON.stringify({
          processedRows: 7168,
        }),
        null,
        '2026-06-24T12:00:00.000Z',
        null,
        '2026-06-24T12:00:00.000Z',
        '2026-06-24T12:00:00.000Z',
      )

    const requeued = await handleRequeueUploadRequest(db, queue, {
      force: true,
      releaseId: signResult.releaseId,
    })
    const release = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(signResult.releaseId) as { status: string } | null

    expect(requeued.status).toBe('queued')
    expect(release?.status).toBe('staged')
    expect(requeued.rowCount).toBe(3)
    expect(queuedMessages).toHaveLength(1)
    expect(queuedMessages[0]).toMatchObject({
      releaseId: signResult.releaseId,
      type: 'division',
    })
  })
})
