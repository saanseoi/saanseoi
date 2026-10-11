import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  createTempDir,
  handleStageCompleted,
  handleStageFailed,
  handleStageRunning,
  initDb,
  isTransientControlError,
} from './controlFixtures.fixtures.ts'

test('classifies transient D1 lock and internal errors as retryable control failures', () => {
  const lockedError = new Error('Failed query: select "runId" from "processingRuns"')
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
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
  })
  await handleStageCompleted(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
    results: {
      processedRows: 1810,
    },
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'publishDataset',
  })
  await handleStageFailed(db, {
    resourceReleaseId,
    phase: 'publishDataset',
    error: 'Network connection lost.',
  })

  const processingRuns = sqlite
    .query(
      'SELECT ir.phase, ir.status, ir.results, ir.error, ir.finishedAt FROM processingRuns ir INNER JOIN resourceReleases r ON r.id = ir.resourceReleaseId WHERE r.code = ? ORDER BY ir.startedAt ASC',
    )
    .all('dr-hk-overture-division-2025-09-24.0') as Array<{
    phase: string
    status: string
    results: string | null
    error: string | null
    finishedAt: string | null
  }>
  const release = sqlite
    .query('SELECT status FROM resourceReleases WHERE code = ?')
    .get('dr-hk-overture-division-2025-09-24.0') as {
    status: string
  }

  sqlite.close()

  expect(processingRuns).toHaveLength(2)
  const extractRun = processingRuns[0]
  const publishRun = processingRuns[1]

  expect(extractRun).toBeDefined()
  expect(publishRun).toBeDefined()

  if (!extractRun || !publishRun) {
    throw new Error('Expected two ingest runs to be written.')
  }

  expect(extractRun.phase).toBe('extractDivisions')
  expect(extractRun.status).toBe('completed')
  expect(extractRun.results).toBe('{"processedRows":1810}')
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
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-hkgov-dpo-address-2025-09.0',
    source: 'hkgov-dpo',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'address',
    sourceVersion: '2025-09.0',
    rawObjectKey: 'hk/hkgov-dpo/2025-09.0/address.parquet',
    originalFileName: 'address.parquet',
    status: 'processing',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  sqlite.exec(`
    INSERT INTO processingRuns (stage,
      runId, resourceReleaseId, phase, status, results, error, startedAt, finishedAt, createdAt, updatedAt
    ) VALUES ('assembly',
      'run-generate-current',
      '${resourceReleaseId}',
      'generateAddressSqlCurrent',
      'completed',
      '{"processedRows":1024,"sqlArtefactCount":2}',
      null,
      '2026-06-27T00:00:00.000Z',
      '2026-06-27T00:01:00.000Z',
      1760000000000,
      1760000060000
    );
  `)

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'generateAddressSqlCurrent',
    results: {
      processedRows: 2048,
      sqlArtefactCount: 3,
    },
  })

  const row = sqlite
    .query(
      'SELECT status, results, startedAt, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .get(resourceReleaseId, 'generateAddressSqlCurrent') as {
    finishedAt: string | null
    startedAt: string
    results: string | null
    status: string
  }

  sqlite.close()

  expect(row).toEqual({
    finishedAt: null,
    startedAt: expect.any(String),
    results: '{"processedRows":2048,"sqlArtefactCount":3}',
    status: 'running',
  })
})

test('reopens a completed processing phase for the next shared resource', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-shared-resource.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'processing',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })
  sqlite.exec(`
    INSERT INTO processingRuns (stage,
      runId, resourceReleaseId, phase, status, results, error, startedAt, finishedAt, createdAt, updatedAt
    ) VALUES ('assembly',
      'run-process-shared-resource',
      '${resourceReleaseId}',
      'processDataset',
      'completed',
      '{"resourceType":"divisionStatistic"}',
      null,
      '2026-06-27T00:00:00.000Z',
      '2026-06-27T00:01:00.000Z',
      1760000000000,
      1760000060000
    );
  `)

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'processDataset',
    results: { resourceType: 'divisionArea' },
  })

  expect(
    sqlite
      .query(
        'SELECT status, results, startedAt, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
      )
      .get(resourceReleaseId, 'processDataset'),
  ).toEqual({
    finishedAt: null,
    startedAt: expect.any(String),
    results: '{"resourceType":"divisionArea"}',
    status: 'running',
  })
  sqlite.close()
})

test('preserves the original startedAt when a running phase completes', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-started-at.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
  })

  const startedRun = sqlite
    .query(
      'SELECT startedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .get(resourceReleaseId, 'extractDivisions') as { startedAt: string } | null

  await handleStageCompleted(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
    results: {
      processedRows: 1810,
    },
  })

  const completedRun = sqlite
    .query(
      'SELECT startedAt, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .get(resourceReleaseId, 'extractDivisions') as {
    finishedAt: string | null
    startedAt: string
  } | null

  sqlite.close()

  expect(startedRun?.startedAt).toBeDefined()
  expect(completedRun?.startedAt).toBe(startedRun?.startedAt)
  expect(completedRun?.finishedAt).not.toBeNull()
})

test('updates running phase results in place when progress is reported again', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-progress.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
    results: {
      processedRows: 64,
    },
  })
  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractDivisions',
    results: {
      processedRows: 128,
    },
  })

  const processingRuns = sqlite
    .query(
      'SELECT phase, status, results, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .all(resourceReleaseId, 'extractDivisions') as Array<{
    finishedAt: string | null
    phase: string
    results: string | null
    status: string
  }>

  sqlite.close()

  expect(processingRuns).toHaveLength(1)
  expect(processingRuns[0]).toEqual({
    finishedAt: null,
    phase: 'extractDivisions',
    results: '{"processedRows":128}',
    status: 'running',
  })
})

test('treats retried stage callbacks as idempotent per release phase', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-retries.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-hkgov-dpo-address-2025-09.0',
    source: 'hkgov-dpo',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'address',
    sourceVersion: '2025-09.0',
    rawObjectKey: 'hk/hkgov-dpo/2025-09.0/address.parquet',
    originalFileName: 'address.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractAddresses',
  })
  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'extractAddresses',
  })
  await handleStageCompleted(db, {
    resourceReleaseId,
    phase: 'extractAddresses',
    results: {
      processedRows: 12,
    },
  })
  await handleStageCompleted(db, {
    resourceReleaseId,
    phase: 'extractAddresses',
    results: {
      processedRows: 12,
    },
  })

  const processingRuns = sqlite
    .query(
      'SELECT phase, status, results, finishedAt FROM processingRuns WHERE resourceReleaseId = ? ORDER BY startedAt ASC',
    )
    .all(resourceReleaseId) as Array<{
    finishedAt: string | null
    phase: string
    results: string | null
    status: string
  }>

  sqlite.close()

  expect(processingRuns).toHaveLength(1)
  expect(processingRuns[0]).toMatchObject({
    phase: 'extractAddresses',
    status: 'completed',
    results: '{"processedRows":12}',
  })
  expect(processingRuns[0]?.finishedAt).not.toBeNull()
})

test('falls back to releaseCode when the queued resourceReleaseId no longer resolves', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-release-code.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)

  insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
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
    resourceReleaseId: '62f558b9-6fad-413f-8283-287a90febcac',
    phase: 'extractDivisions',
  })

  const processingRun = sqlite
    .query(
      'SELECT phase, status FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .get('release-dr-hk-overture-division-2025-09-24.0', 'extractDivisions') as {
    phase: string
    status: string
  } | null

  sqlite.close()

  expect(result).toMatchObject({
    phase: 'extractDivisions',
    releaseCode: 'dr-hk-overture-division-2025-09-24.0',
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    status: 'running',
  })
  expect(processingRun).toEqual({
    phase: 'extractDivisions',
    status: 'running',
  })
})

test('reopens a failed phase as running when processing is retried', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-control-reopen.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2025-09-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'failed',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })

  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'processDataset',
  })
  await handleStageFailed(db, {
    resourceReleaseId,
    phase: 'processDataset',
    error: 'Shard mapping not found.',
  })
  await handleStageRunning(db, {
    resourceReleaseId,
    phase: 'processDataset',
  })

  const processingRun = sqlite
    .query(
      'SELECT phase, status, error, finishedAt FROM processingRuns WHERE resourceReleaseId = ? AND phase = ?',
    )
    .get(resourceReleaseId, 'processDataset') as {
    error: string | null
    finishedAt: string | null
    phase: string
    status: string
  } | null
  const release = sqlite
    .query('SELECT status FROM resourceReleases WHERE id = ?')
    .get(resourceReleaseId) as { status: string } | null

  sqlite.close()

  expect(processingRun).toMatchObject({
    phase: 'processDataset',
    status: 'running',
    error: null,
    finishedAt: null,
  })
  expect(release?.status).toBe('processing')
})
