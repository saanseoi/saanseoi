import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import type { ParquetInspection } from '@repo/core'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'
import type { DatasetProcessingQueue } from './ingest'

const migrationSql = await Bun.file(
  resolve(
    import.meta.dir,
    '../../../../../libs/db/migrations/20260602105608_ordinary_true_believers.sql',
  ),
).text()
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

mock.module('@repo/core/parquet-inspector', () => ({
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
        queuedMessages.push(message as Record<string, string>)
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
    formData.set('snapshotMonth', '2026-05')
    formData.set('sourceVersion', '2026-05-24.0')

    const result = await handleUploadRequest(db, bucket, queue, formData)
    const ingestRuns = sqlite
      .query(
        'SELECT phase, status FROM ingestRuns WHERE datasetId = ? ORDER BY startedAt ASC',
      )
      .all('overture-hk-2026-05-24.0-division') as Array<{
      phase: string
      status: string
    }>

    sqlite.close()

    expect(result.plan.datasetId).toBe('overture-hk-2026-05-24.0-division')
    expect(queuedMessages).toEqual([
      {
        datasetId: 'overture-hk-2026-05-24.0-division',
        rawObjectKey: 'hk/overture/2026-05-24.0/division.parquet',
        regionCode: 'hk',
        snapshotMonth: '2026-05',
        source: 'overture',
        sourceVersion: '2026-05-24.0',
        theme: 'divisions',
        type: 'division',
      },
    ])
    expect(ingestRuns.map(run => [run.phase, run.status])).toEqual([
      ['registerDataset', 'completed'],
      ['stageDataset', 'completed'],
    ])
  })
})
