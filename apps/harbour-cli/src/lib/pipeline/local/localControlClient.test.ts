import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../../libs/core/src/testing/metaFixtures'
import { createLocalControlClient } from './localControlClient.ts'

test.each([
  'processDataset',
  'normaliseAddressSql',
  'generateAddressSqlSource',
  'generateAddressSqlHistory',
  'generateAddressSqlCurrent',
])('reopens completed %s using the shared stage policy', async phase => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(
        resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
        ['meta'],
      ).replaceAll('--> statement-breakpoint', ''),
    )
    seedFixtureCatalog(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'stage-retry-test',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      resourceType: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    const client = createLocalControlClient(createLocalHarbourDb(sqlite), {
      publishClient: {
        async publishDataset() {},
        async stageRunning() {},
        async stageCompleted() {},
        async stageFailed() {},
      },
    })
    await client.stageCompleted(releaseId, phase, { processedRows: 100 })
    await client.stageRunning(releaseId, phase, { processedRows: 0 })
    expect(
      sqlite
        .query(
          'SELECT status, stats, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
        )
        .get(releaseId, phase),
    ).toMatchObject({
      status: 'running',
      stats: JSON.stringify({ processedRows: 0 }),
      finishedAt: null,
    })
    await client.stageFailed(releaseId, phase, 'retry failed')
    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get(releaseId),
    ).toEqual({ status: 'published' })
  } finally {
    sqlite.close()
  }
})
