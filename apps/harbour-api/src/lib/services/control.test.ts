import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Database } from 'bun:sqlite'

import divisionFixture20260218 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@ss-hk-division-2026-02-18.0.json'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'

const migrationsDir = resolve(import.meta.dir, '../../../../../libs/db/migrations')
const migrationSql = loadMigrationSql(migrationsDir, ['meta'])

const {
  handlePublishDataset,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
  isTransientControlError,
} = await import('./control')

const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'harbour-control-test-'))
  tempDirs.push(dir)
  return dir
}

function sortProvenanceRows(
  rows: Array<{
    apiField: string
    sourceFieldPath: string
  }>,
) {
  return rows
    .slice()
    .sort(
      (left, right) =>
        left.apiField.localeCompare(right.apiField) ||
        left.sourceFieldPath.localeCompare(right.sourceFieldPath),
    )
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
  test('classifies transient D1 lock and internal errors as retryable control failures', () => {
    const lockedError = new Error('Failed query: select "runId" from "ingestRuns"')
    lockedError.cause = new Error(
      'D1_ERROR: Failed to parse body as JSON, got: Error: internal error; reference = abc123',
    )

    expect(isTransientControlError(new Error('SQLITE_BUSY: database is locked'))).toBe(
      true,
    )
    expect(isTransientControlError(lockedError)).toBe(true)
    expect(isTransientControlError(new Error('Dataset not found.'))).toBe(false)
  })

  test('updates the running ingest run in place when a phase completes or fails', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      .all('dr-hk-overture-division-2025-09-24.0') as Array<{
      phase: string
      status: string
      stats: string | null
      error: string | null
      finishedAt: string | null
    }>
    const release = sqlite
      .query('SELECT status FROM releases WHERE code = ?')
      .get('dr-hk-overture-division-2025-09-24.0') as {
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

  test('reopens completed address SQL generation phases on running progress', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-sql-generation.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-hkgov-dpo-address-2025-09.0',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'address',
      sourceVersion: '2025-09.0',
      rawObjectKey: 'hk/hkgov-dpo/2025-09.0/address.parquet',
      originalFileName: 'address.parquet',
      status: 'processing',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })

    sqlite.exec(`
      INSERT INTO ingestRuns (
        runId, releaseId, phase, status, stats, error, startedAt, finishedAt, createdAt, updatedAt
      ) VALUES (
        'run-generate-current',
        '${releaseId}',
        'generateAddressSqlCurrent',
        'completed',
        '{"processedRows":1024,"sqlArtifactCount":2}',
        null,
        '2026-06-27T00:00:00.000Z',
        '2026-06-27T00:01:00.000Z',
        1760000000000,
        1760000060000
      );
    `)

    await handleStageRunning(db, {
      releaseId,
      phase: 'generateAddressSqlCurrent',
      stats: {
        processedRows: 2048,
        sqlArtifactCount: 3,
      },
    })

    const row = sqlite
      .query(
        'SELECT status, stats, startedAt, finishedAt FROM ingestRuns WHERE releaseId = ? AND phase = ?',
      )
      .get(releaseId, 'generateAddressSqlCurrent') as {
      finishedAt: string | null
      startedAt: string
      stats: string | null
      status: string
    }

    sqlite.close()

    expect(row).toEqual({
      finishedAt: null,
      startedAt: '2026-06-27T00:00:00.000Z',
      stats: '{"processedRows":2048,"sqlArtifactCount":3}',
      status: 'running',
    })
  })

  test('preserves the original startedAt when a running phase completes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-control-started-at.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const { releaseId } = insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      releaseId: 'release-dr-hk-hkgov-dpo-address-2025-09.0',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      cohortKey: '2025-09',
      type: 'address',
      sourceVersion: '2025-09.0',
      rawObjectKey: 'hk/hkgov-dpo/2025-09.0/address.parquet',
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
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      releaseCode: 'dr-hk-overture-division-2025-09-24.0',
      releaseId: '62f558b9-6fad-413f-8283-287a90febcac',
      phase: 'extractDivisions',
    })

    const ingestRun = sqlite
      .query('SELECT phase, status FROM ingestRuns WHERE releaseId = ? AND phase = ?')
      .get('release-dr-hk-overture-division-2025-09-24.0', 'extractDivisions') as {
      phase: string
      status: string
    } | null

    sqlite.close()

    expect(result).toMatchObject({
      phase: 'extractDivisions',
      releaseCode: 'dr-hk-overture-division-2025-09-24.0',
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      releaseId: 'release-dr-hk-overture-division-2025-09-24.0',
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
      releaseId: 'release-dr-hk-overture-division-2026-01-21.0',
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
      releaseId: 'release-dr-hk-overture-division-2026-01-21.0',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
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
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      status: 'draft',
      timestamp: 1762300860000,
    })

    const result = await handlePublishDataset(db, {
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
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
    const publishedReleaseSet = sqlite
      .query(
        `
          SELECT ars.id AS apiReleaseSetId
          FROM apiReleaseSetSnapshots arss
          INNER JOIN apiReleaseSets ars ON ars.id = arss.apiReleaseSetId
          WHERE arss.snapshotId = ?
          LIMIT 1
        `,
      )
      .get('snapshot-release-dr-hk-overture-division-2026-02-18.0') as {
      apiReleaseSetId: string
    }
    const provenanceRows = sqlite
      .query(
        'SELECT apiField, sourceFieldPath FROM apiFieldProvenance WHERE apiReleaseSetId = ? ORDER BY apiField',
      )
      .all(publishedReleaseSet.apiReleaseSetId) as Array<{
      apiField: string
      sourceFieldPath: string
    }>

    sqlite.close()

    expect(result).toMatchObject({
      apiReleaseSetId: publishedReleaseSet.apiReleaseSetId,
      datasetId: 'dr-hk-overture-division-2026-02-18.0',
      releaseCode: 'dr-hk-overture-division-2026-02-18.0',
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      phase: null,
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
      status: 'current',
    })
    expect(rows).toEqual([
      {
        datasetId: 'dr-hk-overture-division-2026-01-21.0',
        status: 'superseded',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'dr-hk-overture-division-2026-02-18.0',
        status: 'published',
        revokedAt: null,
        revocationReason: null,
      },
    ])
    expect(sortProvenanceRows(provenanceRows)).toEqual(
      sortProvenanceRows(
        divisionFixture20260218.fields.map(field => ({
          apiField: field.apiField,
          sourceFieldPath: field.sourceFieldPath,
        })),
      ),
    )
  })

  test('waits briefly for imported snapshot metadata before publishing', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-delayed-snapshot.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const releaseId = 'release-dr-hk-overture-division-2026-02-18.0'

    insertFixtureRelease(sqlite, {
      releaseId,
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

    setTimeout(() => {
      seedSnapshot(sqlite, {
        code: 'ss-hk-division-2026-02-18.0',
        releaseId,
        status: 'draft',
        timestamp: 1762300860000,
      })
    }, 25)

    const result = await handlePublishDataset(db, {
      releaseId,
    })

    sqlite.close()

    expect(result).toMatchObject({
      apiReleaseSetId: expect.any(String),
      datasetId: 'dr-hk-overture-division-2026-02-18.0',
      releaseCode: 'dr-hk-overture-division-2026-02-18.0',
      releaseId,
      phase: null,
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
      status: 'current',
    })
  })

  test('publishes addresses with provenance and places without bundled provenance', async () => {
    for (const datasetType of ['address', 'place'] as const) {
      const tempDir = createTempDir()
      const dbPath = join(tempDir, `harbour-publish-${datasetType}-fixture-gap.sqlite`)
      const sqlite = initDb(dbPath)
      const db = createLocalHarbourDb(sqlite)
      const source = datasetType === 'address' ? 'hkgov-dpo' : 'overture'
      const datasetId =
        datasetType === 'address' ? 'hkgov-dpo-hk-address' : 'overture-hk-place'
      const releaseCode = `dr-hk-${source}-${datasetType}-2026-06-24.0`
      const releaseId = `release-${releaseCode}`
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
        source,
        regionCode: 'hk',
        cohortKey: '2026-06',
        type: datasetType,
        sourceVersion: '2026-06-24.0',
        rawObjectKey: `hk/${source}/2026-06-24.0/${datasetType}.parquet`,
        originalFileName: `${datasetType}.parquet`,
        status: 'staged',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      sqlite
        .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
        .run('1.17.0', releaseId)
      if (datasetType === 'address') {
        sqlite
          .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
          .run('3.2', releaseId)
      }
      seedSnapshot(sqlite, {
        code: `ss-hk-${datasetType}-2026-06-24.0`,
        datasetId,
        resourceType: datasetType,
        releaseId,
        snapshotId,
        status: 'draft',
        timestamp: 1762300860000,
      })

      if (datasetType === 'address') {
        const divisionReleaseId = 'release-dr-hk-overture-division-2026-06-17.0'
        insertFixtureRelease(sqlite, {
          releaseId: divisionReleaseId,
          source: 'overture',
          regionCode: 'hk',
          cohortKey: '2026-06',
          type: 'division',
          sourceVersion: '2026-06-17.0',
          rawObjectKey: 'hk/overture/2026-06-17.0/division.parquet',
          originalFileName: 'division.parquet',
          status: 'published',
          ingestedAt: '2026-06-05T00:01:00.000Z',
          createdAt: '2026-06-05T00:01:00.000Z',
          updatedAt: '2026-06-05T00:01:00.000Z',
        })
        const divisionDataset = sqlite
          .query('SELECT datasetId FROM releases WHERE id = ?')
          .get(divisionReleaseId) as { datasetId: string }
        seedSnapshot(sqlite, {
          code: 'ss-hk-division-2026-06-17.0',
          cohortKey: '2026-06',
          datasetId: divisionDataset.datasetId,
          releaseId: divisionReleaseId,
          status: 'published',
          timestamp: 1762300800000,
        })
        const { listCurrentApiCompositionMembersForType } = await import(
          '@repo/core/db/metaRegistry'
        )
        expect(
          await listCurrentApiCompositionMembersForType(db, 'address'),
        ).toContainEqual(
          expect.objectContaining({
            resourceType: 'division',
            role: 'supporting',
            variant: 'overture',
          }),
        )
      }

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
      const publishedReleaseSet = sqlite
        .query(
          `
            SELECT arss.apiReleaseSetId AS apiReleaseSetId, ss.datasetId AS datasetId
            FROM apiReleaseSetSnapshots arss
            INNER JOIN snapshotSources ss ON ss.snapshotId = arss.snapshotId
            WHERE arss.snapshotId = ? AND ss.role = 'primary'
            LIMIT 1
          `,
        )
        .get(snapshotId) as {
        apiReleaseSetId: string
        datasetId: string
      }
      const provenanceCount = sqlite
        .query(
          `
            SELECT COUNT(*) AS count
            FROM apiFieldProvenance
            WHERE apiReleaseSetId = ?
              AND sourceDatasetId = ?
          `,
        )
        .get(publishedReleaseSet.apiReleaseSetId, publishedReleaseSet.datasetId) as {
        count: number
      }
      const supportingSnapshots = sqlite
        .query(
          `
            SELECT s.code, arss.role
            FROM apiReleaseSetSnapshots arss
            INNER JOIN snapshots s ON s.id = arss.snapshotId
            WHERE arss.apiReleaseSetId = ?
              AND arss.role = 'supporting'
            ORDER BY s.code
          `,
        )
        .all(publishedReleaseSet.apiReleaseSetId) as Array<{
        code: string
        role: string
      }>

      sqlite.close()

      expect(result).toMatchObject({
        apiReleaseSetId: publishedReleaseSet.apiReleaseSetId,
        datasetId: releaseCode,
        releaseCode,
        releaseId,
        phase: null,
        snapshotId: `snapshot-${releaseId}`,
        status: 'current',
      })
      expect(releaseRow).toEqual({
        status: 'published',
      })
      expect(snapshotRow.status).toBe('published')
      expect(snapshotRow.publishedAt).not.toBeNull()
      expect(provenanceCount.count).toBe(datasetType === 'address' ? 22 : 0)
      expect(supportingSnapshots).toEqual(
        datasetType === 'address'
          ? [{ code: 'ss-hk-division-2026-06-17.0', role: 'supporting' }]
          : [],
      )
    }
  })

  test('uses a cohort-independent HAD area to complete the compatible draft division release set', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-had-draft-release-set.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const cohortKey = '2025-09-24.0'
    const releaseSetId = 'd092ef65-1ae3-4a3d-beb2-19f20e8f5904'

    sqlite.exec(`
      DELETE FROM apiCompositionMembers
      WHERE apiCompositionId = 'api-composition-divisions-v1';

      INSERT INTO apiCompositionMembers (
        apiCompositionId, domainCode, resourceType, variant, role, isRequired,
        cohortMatchingMode, anchorResourceType, maxLagDays, priority, configJson
      ) VALUES
        ('api-composition-divisions-v1', 'overture', 'division', 'overture', 'primary', 1, 'exact_ref', null, null, 0, null),
        ('api-composition-divisions-v1', 'overture', 'divisionArea', 'overture', 'geometry', 1, 'exact_ref', null, null, 10, null),
        ('api-composition-divisions-v1', 'overture', 'divisionArea', 'hkgov-had', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', null, null, 11, null),
        ('api-composition-divisions-v1', 'overture', 'divisionBoundary', 'overture', 'geometry', 1, 'exact_ref', null, null, 20, null);

      INSERT INTO apiReleaseSets (
        id, apiVersionId, apiCompositionId, code, regionCode, domainCode,
        cohortKey, revision, schemaVersion, rulesetVersion, status,
        publishedAt, validFrom, validTo, notes, versionHash, createdAt, updatedAt
      ) VALUES (
        '${releaseSetId}',
        'api-version-api-divisions-v0.1',
        'api-composition-divisions-v1',
        'data-hk-divisions-${cohortKey}',
        'hk',
        'overture',
        '${cohortKey}',
        0,
        'sv-division-v1',
        'rs-division-merge-v1',
        'draft',
        null, null, null, null,
        'vh-had-draft-release-set',
        1761264000001,
        1761264000001
      );

      INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt) VALUES
        ('publisher-hkgov-had', 'hkgov-had', 'vh-publisher-hkgov-had', 1761264000001, 1761264000001);

      INSERT INTO datasets (
        id, publisherId, code, regionCode, releaseType, releaseFrequency,
        theme, type, sourceUrl, versionHash, createdAt, updatedAt
      ) VALUES
        ('overture-hk-divisionArea', 'publisher-overture', 'ds-hk-overture-division-area', 'hk', 'static', 'monthly', 'divisions', 'divisionArea', 'https://docs.overturemaps.org/', 'vh-overture-area', 1761264000001, 1761264000001),
        ('overture-hk-divisionBoundary', 'publisher-overture', 'ds-hk-overture-division-boundary', 'hk', 'static', 'monthly', 'divisions', 'divisionBoundary', 'https://docs.overturemaps.org/', 'vh-overture-boundary', 1761264000001, 1761264000001),
        ('hkgov-had-hk-district', 'publisher-hkgov-had', 'ds-hk-hkgov-had-division-area-district', 'hk', 'static', 'as-needed', 'divisions', 'divisionArea', 'https://data.gov.hk/', 'vh-had-district', 1761264000001, 1761264000001);
    `)

    const division = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey,
      type: 'division',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    const overtureArea = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey,
      type: 'divisionArea',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division-area.parquet',
      originalFileName: 'division-area.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    const boundary = insertFixtureRelease(sqlite, {
      source: 'overture',
      regionCode: 'hk',
      cohortKey,
      type: 'divisionBoundary',
      sourceVersion: '2025-09-24.0',
      rawObjectKey: 'hk/overture/2025-09-24.0/division-boundary.parquet',
      originalFileName: 'division-boundary.parquet',
      status: 'published',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    const hadArea = {
      releaseCode: 'dr-hk-hkgov-had-division-area-district-2022',
      releaseId: 'release-dr-hk-hkgov-had-division-area-district-2022',
    }
    sqlite.exec(`
      INSERT INTO releases (
        id, datasetId, code, sourceVersion, cohortKey, rawObjectKey,
        originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${hadArea.releaseId}',
        'hkgov-had-hk-district',
        '${hadArea.releaseCode}',
        '2022', '2022', 'hk/hkgov-had/2022/division-area.geojson',
        'division-area.geojson', 'staged',
        '2026-06-05T00:01:00.000Z',
        '2026-06-05T00:01:00.000Z',
        '2026-06-05T00:01:00.000Z'
      );
    `)

    sqlite.exec(`
      UPDATE releases SET sourceSchemaVersion = '1.12.0'
      WHERE id IN ('${division.releaseId}', '${overtureArea.releaseId}', '${boundary.releaseId}');
      UPDATE releases SET sourceSchemaVersion = '1.2'
      WHERE id = '${hadArea.releaseId}';
    `)

    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2025-09-24.0',
      cohortKey,
      releaseId: division.releaseId,
      status: 'published',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-area-2025-09-24.0',
      cohortKey,
      datasetId: 'overture-hk-divisionArea',
      resourceType: 'divisionArea',
      releaseId: overtureArea.releaseId,
      status: 'published',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-boundary-2025-09-24.0',
      cohortKey,
      datasetId: 'overture-hk-divisionBoundary',
      resourceType: 'divisionBoundary',
      releaseId: boundary.releaseId,
      status: 'published',
    })
    const hadSnapshotId = seedSnapshot(sqlite, {
      code: 'ss-hk-division-area-2022',
      cohortKey: '2022',
      datasetId: 'hkgov-had-hk-district',
      resourceType: 'divisionArea',
      releaseId: hadArea.releaseId,
    })

    const result = await handlePublishDataset(db, { releaseId: hadArea.releaseId })
    const publishedSet = sqlite
      .query('SELECT status FROM apiReleaseSets WHERE id = ?')
      .get(releaseSetId) as { status: string }
    const members = sqlite
      .query(
        `
          SELECT s.code, arss.variant, anchor.code AS anchorCode
          FROM apiReleaseSetSnapshots arss
          INNER JOIN snapshots s ON s.id = arss.snapshotId
          LEFT JOIN snapshots anchor ON anchor.id = arss.anchorSnapshotId
          WHERE arss.apiReleaseSetId = ?
          ORDER BY arss.variant, s.code
        `,
      )
      .all(releaseSetId) as Array<{
      anchorCode: string | null
      code: string
      variant: string
    }>
    const hadRelease = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(hadArea.releaseId) as { status: string }
    const hadSnapshot = sqlite
      .query('SELECT status FROM snapshots WHERE id = ?')
      .get(hadSnapshotId) as { status: string }

    sqlite.close()

    expect(result.apiReleaseSetId).toBe(releaseSetId)
    expect(result.apiReleaseSetStatus).toBe('current')
    expect(publishedSet.status).toBe('current')
    expect(hadRelease.status).toBe('published')
    expect(hadSnapshot.status).toBe('published')
    expect(members).toEqual([
      {
        anchorCode: null,
        code: 'ss-hk-division-area-2022',
        variant: 'hkgov-had',
      },
      {
        anchorCode: null,
        code: 'ss-hk-division-2025-09-24.0',
        variant: 'overture',
      },
      {
        anchorCode: null,
        code: 'ss-hk-division-area-2025-09-24.0',
        variant: 'overture',
      },
      {
        anchorCode: null,
        code: 'ss-hk-division-boundary-2025-09-24.0',
        variant: 'overture',
      },
    ])
  })

  test('revokes the superseded dataset only for corrected same-release publishes', async () => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-revoked.sqlite')
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
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
      releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2026-02-18.1',
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
    sqlite
      .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
      .run('1.16.0', 'release-dr-hk-overture-division-2026-02-18.1')
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-02-18.1',
      releaseId: 'release-dr-hk-overture-division-2026-02-18.1',
      status: 'draft',
      timestamp: 1762300860000,
    })

    const result = await handlePublishDataset(db, {
      releaseId: 'release-dr-hk-overture-division-2026-02-18.1',
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

    expect(result).toMatchObject({
      apiReleaseSetId: expect.any(String),
      datasetId: 'dr-hk-overture-division-2026-02-18.1',
      releaseCode: 'dr-hk-overture-division-2026-02-18.1',
      releaseId: 'release-dr-hk-overture-division-2026-02-18.1',
      phase: null,
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.1',
      status: 'current',
    })
    expect(rows[0]).toMatchObject({
      datasetId: 'dr-hk-overture-division-2026-02-18.0',
      status: 'revoked',
      revocationReason:
        'Superseded by corrected release dr-hk-overture-division-2026-02-18.1.',
    })
    expect(rows[0]?.revokedAt).not.toBeNull()
    expect(rows[1]).toEqual({
      datasetId: 'dr-hk-overture-division-2026-02-18.1',
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
      releaseId: 'release-dr-hk-overture-division-2026-06-17.0',
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
      releaseId: 'release-dr-hk-overture-division-2026-06-17.0',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      releaseId: 'release-dr-hk-overture-division-2026-06-24.0',
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
    sqlite
      .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
      .run('1.17.0', 'release-dr-hk-overture-division-2026-06-24.0')
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-06-24.0',
      releaseId: 'release-dr-hk-overture-division-2026-06-24.0',
      status: 'draft',
      timestamp: 1762300860000,
    })

    await handlePublishDataset(db, {
      releaseId: 'release-dr-hk-overture-division-2026-06-24.0',
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
        datasetId: 'dr-hk-overture-division-2026-06-17.0',
        status: 'superseded',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'dr-hk-overture-division-2026-06-24.0',
        status: 'published',
        revokedAt: null,
        revocationReason: null,
      },
    ])
  })
})
