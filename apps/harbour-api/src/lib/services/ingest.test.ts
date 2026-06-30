import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { ParquetInspection } from '@repo/core'
import { requestUpload } from '@repo/core/upload'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'
import type { DatasetProcessingQueue } from './ingest'

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
const inspectParquetMock = mock(async () => fixtureInspection)

mock.module('@repo/core/parquetInspector', () => ({
  inspectParquet: inspectParquetMock,
}))

const { handleUploadRequest } = await import('./ingest')

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-ingest-test-'))
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
    }
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}

afterEach(() => {
  inspectParquetMock.mockClear()

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('direct upload flow', () => {
  test('registers the dataset and queues downstream processing', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const queuedMessages: Array<Record<string, string>> = []
    const queue: DatasetProcessingQueue = {
      async send(message) {
        queuedMessages.push(message as unknown as Record<string, string>)
      },
    }
    const file = new File(
      [new Uint8Array([0x50, 0x41, 0x52, 0x31])],
      'overture-hk-division.parquet',
      {
        type: 'application/octet-stream',
      },
    )
    const formData = new FormData()

    formData.set('file', file)
    formData.set('shardYear', '2026')
    formData.set('cohortKey', '2026-05')
    formData.set('sourceVersion', '2026-05-20.0')

    const result = await handleUploadRequest(db, bucket, queue, formData)

    if (!result.releaseId) {
      throw new Error(
        'Expected non-null releaseId from handleUploadRequest in test setup.',
      )
    }

    const ingestRuns = sqlite
      .query(
        'SELECT ir.phase, ir.status FROM ingestRuns ir INNER JOIN releases r ON r.id = ir.releaseId WHERE r.code = ? ORDER BY ir.startedAt ASC',
      )
      .all('overture-hk-2026-05-20.0-division') as Array<{
      phase: string
      status: string
    }>

    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-20.0-division')
    expect(queuedMessages).toEqual([
      {
        datasetId: 'overture-hk-division',
        datasetCode: 'ds-hk-overture-division',
        rawObjectKey: 'hk/overture/2026-05-20.0/division.parquet',
        releaseCode: 'overture-hk-2026-05-20.0-division',
        releaseId: result.releaseId,
        regionCode: 'hk',
        shardYear: '2026',
        cohortKey: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-20.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
    expect(ingestRuns.map(run => [run.phase, run.status])).toEqual([
      ['registerDataset', 'completed'],
      ['stageDataset', 'completed'],
    ])
  })

  test('force registers over an interrupted uploading session', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-force-ingest.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const bucket = new FakeR2Bucket()
    const queuedMessages: Array<Record<string, string>> = []
    const queue: DatasetProcessingQueue = {
      async send(message) {
        queuedMessages.push(message as unknown as Record<string, string>)
      },
    }

    const interrupted = await requestUpload(db, {
      filePath: 'overture-hk-division.parquet',
      shardYear: '2026',
      cohortKey: '2026-05',
      sourceVersion: '2026-05-20.0',
      inspection: fixtureInspection,
    })
    const file = new File(
      [new Uint8Array([0x50, 0x41, 0x52, 0x31])],
      'overture-hk-division.parquet',
      {
        type: 'application/octet-stream',
      },
    )
    const formData = new FormData()

    formData.set('file', file)
    formData.set('force', 'true')
    formData.set('shardYear', '2026')
    formData.set('cohortKey', '2026-05')
    formData.set('sourceVersion', '2026-05-20.0')

    const result = await handleUploadRequest(db, bucket, queue, formData)
    const dataset = sqlite
      .query('SELECT id, status FROM releases WHERE code = ?')
      .get('overture-hk-2026-05-20.0-division') as {
      id: string
      status: string
    } | null

    sqlite.close()

    expect(result.releaseId).toBe(interrupted.releaseId)
    expect(dataset).toEqual({
      id: interrupted.releaseId,
      status: 'staged',
    })
    expect(queuedMessages).toHaveLength(1)
  })
})
