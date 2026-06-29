import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/meta-fixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/local-db'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir)

const {
  handlePublishDataset,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
} = await import('./control')

const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-control-test-'))
  tempDirs.push(dir)
  return dir
}

function initDb(dbPath: string) {
  const db = new Database(dbPath)
  db.exec(migrationSql.replaceAll('--> statement-breakpoint', ''))
  seedFixtureCatalog(db)
  return db
}

function seedSnapshot(
  sqlite: Database,
  {
    code,
    cohortKey = 'fixture-cohort',
    datasetId = 'overture-hk-division',
    resourceType = 'division',
    releaseId,
    snapshotId = `snapshot-${releaseId}`,
    status = 'draft',
    timestamp = 1761264000000,
  }: {
    code: string
    cohortKey?: string
    datasetId?: string
    resourceType?: string
    releaseId: string
    snapshotId?: string
    status?: 'draft' | 'published'
    timestamp?: number
  },
) {
  const publishedAt = status === 'published' ? timestamp : 'null'

  sqlite.exec(`
    INSERT INTO snapshots (
      id, resourceType, code, cohortKey, status, publishedAt, validFrom, validTo, notes, createdAt, updatedAt
    ) VALUES (
      '${snapshotId}',
      '${resourceType}',
      '${code}',
      '${cohortKey}',
      '${status}',
      ${publishedAt},
      ${publishedAt},
      null,
      null,
      ${timestamp},
      ${timestamp}
    );

    INSERT INTO snapshotSources (
      snapshotId, datasetId, sourceReleaseId, role, createdAt
    ) VALUES (
      '${snapshotId}',
      '${datasetId}',
      '${releaseId}',
      'primary',
      ${timestamp}
    );
  `)

  return snapshotId
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('control service', () => {
  test('updates the running ingest run in place when a phase completes or fails', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'extractDivisions',
    })
    await handleStageCompleted(db, {
      releaseId,
      phase: 'extractDivisions',
      stats: {
        processedRows: 1810,
      },
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'publishDataset',
    })
    await handleStageFailed(db, {
      releaseId,
      phase: 'publishDataset',
      error: 'Network connection lost.',
    })

    const ingestRuns = sqlite
      .query(
        'SELECT ir.phase, ir.status, ir.stats, ir.error, ir.finishedAt FROM ingestRuns ir INNER JOIN releases r ON r.id = ir.releaseId WHERE r.code = ? ORDER BY ir.startedAt ASC',
      )
      .all('overture-hk-2025-09-24.0-division') as Array<{
      phase: string
      status: string
      stats: string | null
      error: string | null
      finishedAt: string | null
    }>
    const release = sqlite
      .query('SELECT status FROM releases WHERE code = ?')
      .get('overture-hk-2025-09-24.0-division') as {
      status: string
    }

    sqlite.close()

    expect(ingestRuns).toHaveLength(2)
    const extractRun = ingestRuns[0]
    const publishRun = ingestRuns[1]

    expect(extractRun).toBeDefined()
    expect(publishRun).toBeDefined()

    if (!extractRun || !publishRun) {
      throw new Error('Expected two ingest runs to be written.')
    }

    expect(extractRun.phase).toBe('extractDivisions')
    expect(extractRun.status).toBe('completed')
    expect(extractRun.stats).toBe('{"processedRows":1810}')
    expect(extractRun.finishedAt).not.toBeNull()
    expect(publishRun.phase).toBe('publishDataset')
    expect(publishRun.status).toBe('error')
    expect(publishRun.error).toBe('"{\\"message\\":\\"Network connection lost.\\"}"')
    expect(publishRun.finishedAt).not.toBeNull()
    expect(release.status).toBe('failed')
  })

  test('preserves the original startedAt when a running phase completes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-started-at.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'extractDivisions',
    })

    const startedRun = sqlite
      .query('SELECT startedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?')
      .get(releaseId, 'extractDivisions') as { startedAt: string } | null

    await handleStageCompleted(db, {
      releaseId,
      phase: 'extractDivisions',
      stats: {
        processedRows: 1810,
      },
    })

    const completedRun = sqlite
      .query(
        'SELECT startedAt, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .get(releaseId, 'extractDivisions') as {
      finishedAt: string | null
      startedAt: string
    } | null

    sqlite.close()

    expect(startedRun?.startedAt).toBeDefined()
    expect(completedRun?.startedAt).toBe(startedRun?.startedAt)
    expect(completedRun?.finishedAt).not.toBeNull()
  })

  test('updates running phase stats in place when progress is reported again', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-progress.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'extractDivisions',
      stats: {
        processedRows: 64,
      },
    })
    await handleStageRunning(db, {
      releaseId,
      phase: 'extractDivisions',
      stats: {
        processedRows: 128,
      },
    })

    const ingestRuns = sqlite
      .query(
        'SELECT phase, status, stats, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .all(releaseId, 'extractDivisions') as Array<{
      finishedAt: string | null
      phase: string
      stats: string | null
      status: string
    }>

    sqlite.close()

    expect(ingestRuns).toHaveLength(1)
    expect(ingestRuns[0]).toEqual({
      finishedAt: null,
      phase: 'extractDivisions',
      stats: '{"processedRows":128}',
      status: 'running',
    })
  })

  test('treats retried stage callbacks as idempotent per release phase', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-retries.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-address',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'address',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/address.parquet',
      originalFileName: 'address.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'extractAddresses',
    })
    await handleStageRunning(db, {
      releaseId,
      phase: 'extractAddresses',
    })
    await handleStageCompleted(db, {
      releaseId,
      phase: 'extractAddresses',
      stats: {
        processedRows: 12,
      },
    })
    await handleStageCompleted(db, {
      releaseId,
      phase: 'extractAddresses',
      stats: {
        processedRows: 12,
      },
    })

    const ingestRuns = sqlite
      .query(
        'SELECT phase, status, stats, finishedAt FROM ingestRuns WHERE releaseId = ? ORDER BY startedAt ASC',
      )
      .all(releaseId) as Array<{
      finishedAt: string | null
      phase: string
      stats: string | null
      status: string
    }>

    sqlite.close()

    expect(ingestRuns).toHaveLength(1)
    expect(ingestRuns[0]).toMatchObject({
      phase: 'extractAddresses',
      status: 'completed',
      stats: '{"processedRows":12}',
    })
    expect(ingestRuns[0]?.finishedAt).not.toBeNull()
  })

  test('falls back to releaseCode when the queued releaseId no longer resolves', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-release-code.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    const result = await handleStageRunning(db, {
      releaseCode: 'overture-hk-2025-09-24.0-division',
      releaseId: '62f558b9-6fad-413f-8283-287a90febcac',
      phase: 'extractDivisions',
    })

    const ingestRun = sqlite
      .query('SELECT phase, status FROM ingestRuns WHERE releaseId = ? AND phase = ?')
      .get('release-overture-hk-2025-09-24.0-division', 'extractDivisions') as {
      phase: string
      status: string
    } | null

    sqlite.close()

    expect(result).toMatchObject({
      phase: 'extractDivisions',
      releaseCode: 'overture-hk-2025-09-24.0-division',
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      status: 'running',
    })
    expect(ingestRun).toEqual({
      phase: 'extractDivisions',
      status: 'running',
    })
  })

  test('reopens a failed phase as running when processing is retried', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-reopen.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2025-09-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'failed',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    await handleStageRunning(db, {
      releaseId,
      phase: 'processDataset',
    })
    await handleStageFailed(db, {
      releaseId,
      phase: 'processDataset',
      error: 'Shard mapping not found.',
    })
    await handleStageRunning(db, {
      releaseId,
      phase: 'processDataset',
    })

    const ingestRun = sqlite
      .query(
        'SELECT phase, status, error, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .get(releaseId, 'processDataset') as {
      error: string | null
      finishedAt: string | null
      phase: string
      status: string
    } | null
    const release = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(releaseId) as { status: string } | null

    sqlite.close()

    expect(ingestRun).toMatchObject({
      phase: 'processDataset',
      status: 'running',
      error: null,
      finishedAt: null,
    })
    expect(release?.status).toBe('processing')
  })

  test('marks the superseded monthly dataset historic when publishing a new current dataset', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-historic.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-01-21.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-01',
      type: 'division',
      sourceVersion: '2026-01-21.0',
      rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-01-21.0',
      releaseId: 'release-overture-hk-2026-01-21.0-division',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-02-18.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-02',
      type: 'division',
      sourceVersion: '2026-02-18.0',
      rawObjectKey: 'hk/overture/2026-02-18.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:01:00.000Z',
      createdAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:01:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-02-18.0',
      releaseId: 'release-overture-hk-2026-02-18.0-division',
      status: 'draft',
      timestamp: 1762300860000,
    })

    const result = await handlePublishDataset(db, {
      releaseId: 'release-overture-hk-2026-02-18.0-division',
    })

    const rows = sqlite
      .query(
        'SELECT code AS datasetId, status, revokedAt, revocationReason FROM releases ORDER BY code',
      )
      .all() as Array<{
      datasetId: string
      status: string
      revokedAt: number | null
      revocationReason: string | null
    }>
    const provenanceRows = sqlite
      .query(
        'SELECT apiField, sourceFieldPath FROM apiFieldProvenance afp INNER JOIN apiReleaseSets ars ON ars.id = afp.apiReleaseSetId ORDER BY apiField',
      )
      .all() as Array<{
      apiField: string
      sourceFieldPath: string
    }>

    sqlite.close()

    expect(result).toEqual({
      datasetId: 'overture-hk-2026-02-18.0-division',
      releaseCode: 'overture-hk-2026-02-18.0-division',
      releaseId: 'release-overture-hk-2026-02-18.0-division',
      phase: null,
      status: 'current',
    })
    expect(rows).toEqual([
      {
        datasetId: 'overture-hk-2026-01-21.0-division',
        status: 'superseded',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'overture-hk-2026-02-18.0-division',
        status: 'published',
        revokedAt: null,
        revocationReason: null,
      },
    ])
    expect(provenanceRows).toEqual([
      {
        apiField: 'division.attributes.divisionType',
        sourceFieldPath: 'subtype',
      },
      {
        apiField: 'division.attributes.i18n.en.name',
        sourceFieldPath: 'names.primary.en',
      },
      {
        apiField: 'division.attributes.i18n.zhHant.name',
        sourceFieldPath: 'names.primary.zh-Hant',
      },
      {
        apiField: 'division.id',
        sourceFieldPath: 'id',
      },
    ])
  })

  test('publishes address and place releases when api field fixtures are unavailable', async () => {
    for (const datasetType of ['address', 'place'] as const) {
      const tempDir = createTempDir()
      const dbPath = join(tempDir, `harbour-publish-${datasetType}-fixture-gap.sqlite`)
      const sqlite = initDb(dbPath)
      const db = createLocalHarbourDb(sqlite)
      const releaseId = `release-overture-hk-2026-06-24.0-${datasetType}`
      const releaseCode = `overture-hk-2026-06-24.0-${datasetType}`
      const snapshotId = `snapshot-${releaseId}`

      if (datasetType === 'place') {
        sqlite.exec(`
          INSERT OR IGNORE INTO datasets (
            id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, versionHash, createdAt, updatedAt
          ) VALUES (
            'overture-hk-place',
            'publisher-overture',
            'ds-hk-overture-place',
            'hk',
            'static',
            'monthly',
            'places',
            'place',
            'https://docs.overturemaps.org/schema/reference/places/place/',
            'vh-dataset-overture-hk-place-v1',
            1718236800000,
            1718236800000
          );
        `)
      }

      insertFixtureRelease(sqlite, {
        releaseId,
        source: 'overture',
        regionCode: 'hk',
        cohortKey: '2026-06',
        type: datasetType,
        sourceVersion: '2026-06-24.0',
        rawObjectKey: `hk/overture/2026-06-24.0/${datasetType}.parquet`,
        originalFileName: `${datasetType}.parquet`,
        status: 'staged',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      seedSnapshot(sqlite, {
        code: `ss-hk-${datasetType}-2026-06-24.0`,
        datasetId: `overture-hk-${datasetType}`,
        resourceType: datasetType,
        releaseId,
        snapshotId,
        status: 'draft',
        timestamp: 1762300860000,
      })

      const result = await handlePublishDataset(db, {
        releaseId,
      })

      const releaseRow = sqlite
        .query('SELECT status FROM releases WHERE id = ?')
        .get(releaseId) as { status: string }
      const snapshotRow = sqlite
        .query('SELECT status, publishedAt FROM snapshots WHERE id = ?')
        .get(snapshotId) as {
        publishedAt: number | null
        status: string
      }
      const provenanceCount = sqlite
        .query(
          `
            SELECT COUNT(*) AS count
            FROM apiFieldProvenance afp
            INNER JOIN apiReleaseSetSnapshots arss ON arss.apiReleaseSetId = afp.apiReleaseSetId
            WHERE arss.snapshotId = ?
          `,
        )
        .get(snapshotId) as { count: number }

      sqlite.close()

      expect(result).toEqual({
        datasetId: releaseCode,
        releaseCode,
        releaseId,
        phase: null,
        status: 'current',
      })
      expect(releaseRow).toEqual({
        status: 'published',
      })
      expect(snapshotRow.status).toBe('published')
      expect(snapshotRow.publishedAt).not.toBeNull()
      expect(provenanceCount.count).toBe(0)
    }
  })

  test('revokes the superseded dataset only for corrected same-release publishes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-revoked.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-02-18.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-02',
      type: 'division',
      sourceVersion: '2026-02-18.0',
      rawObjectKey: 'hk/overture/2026-02-18.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-02-18.0',
      releaseId: 'release-overture-hk-2026-02-18.0-division',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-02-18.1-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-02',
      type: 'division',
      sourceVersion: '2026-02-18.1',
      rawObjectKey: 'hk/overture/2026-02-18.1/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:01:00.000Z',
      createdAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:01:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-02-18.1',
      releaseId: 'release-overture-hk-2026-02-18.1-division',
      status: 'draft',
      timestamp: 1762300860000,
    })

    const result = await handlePublishDataset(db, {
      releaseId: 'release-overture-hk-2026-02-18.1-division',
    })

    const rows = sqlite
      .query(
        'SELECT code AS datasetId, status, revokedAt, revocationReason FROM releases ORDER BY code',
      )
      .all() as Array<{
      datasetId: string
      status: string
      revokedAt: number | null
      revocationReason: string | null
    }>

    sqlite.close()

    expect(result).toEqual({
      datasetId: 'overture-hk-2026-02-18.1-division',
      releaseCode: 'overture-hk-2026-02-18.1-division',
      releaseId: 'release-overture-hk-2026-02-18.1-division',
      phase: null,
      status: 'current',
    })
    expect(rows[0]).toMatchObject({
      datasetId: 'overture-hk-2026-02-18.0-division',
      status: 'revoked',
      revocationReason:
        'Superseded by corrected release overture-hk-2026-02-18.1-division.',
    })
    expect(rows[0]?.revokedAt).not.toBeNull()
    expect(rows[1]).toEqual({
      datasetId: 'overture-hk-2026-02-18.1-division',
      status: 'published',
      revokedAt: null,
      revocationReason: null,
    })
  })

  test('marks the superseded dataset historic for same-cohort releases with different source dates', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-same-cohort.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-06-17.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-06',
      type: 'division',
      sourceVersion: '2026-06-17.0',
      rawObjectKey: 'hk/overture/2026-06-17.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-06-17.0',
      releaseId: 'release-overture-hk-2026-06-17.0-division',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-overture-hk-2026-06-24.0-division',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-06',
      type: 'division',
      sourceVersion: '2026-06-24.0',
      rawObjectKey: 'hk/overture/2026-06-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'staged',
      ingestedAt: '2026-06-05T00:01:00.000Z',
      createdAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:01:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-06-24.0',
      releaseId: 'release-overture-hk-2026-06-24.0-division',
      status: 'draft',
      timestamp: 1762300860000,
    })

    await handlePublishDataset(db, {
      releaseId: 'release-overture-hk-2026-06-24.0-division',
    })

    const rows = sqlite
      .query(
        'SELECT code AS datasetId, status, revokedAt, revocationReason FROM releases ORDER BY code',
      )
      .all() as Array<{
      datasetId: string
      status: string
      revokedAt: number | null
      revocationReason: string | null
    }>

    sqlite.close()

    expect(rows).toEqual([
      {
        datasetId: 'overture-hk-2026-06-17.0-division',
        status: 'superseded',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'overture-hk-2026-06-24.0-division',
        status: 'published',
        revokedAt: null,
        revocationReason: null,
      },
    ])
  })
})
