import { expect, test } from 'bun:test'
import { join } from 'node:path'
import divisionFixtureOverture116To118 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@overture-1.16-to-1.18.json'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import { getDatasetRecordByReleaseId } from '@repo/core/db/metaRegistry'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  createTempDir,
  handlePublishDataset,
  initDb,
  seedCompleteDivisionSourceSignature,
  seedSnapshot,
  sortProvenanceRows,
} from './controlFixtures.fixtures.ts'

test('retains a dataset source variant when reading a release for publication', async () => {
  const tempDir = createTempDir()
  const sqlite = initDb(join(tempDir, 'harbour-control-source-variant.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const releaseId = 'release-hkgov-censtatd-hma-2021'
  sqlite.exec(`
    INSERT OR IGNORE INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES ('publisher-hkgov-censtatd', 'hkgov-censtatd', 'vh-publisher-hkgov-censtatd', 1761264000000, 1761264000000);

    INSERT OR IGNORE INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES (
      'hkgov-censtatd-hk-hma', 'publisher-hkgov-censtatd',
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'hk', 'static', 'five-yearly', 'divisions', 'hkgov-censtatd-hma',
      'https://www.censtatd.gov.hk/', 'vh-dataset-hkgov-censtatd-hma', 1761264000000, 1761264000000
    );

    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
      rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
    )
    SELECT
      '${releaseId}', '${releaseId}', id, 'divisionArea', 'dr-hk-hkgov-censtatd-hma-2021', '2021', '2021',
      'hk/hkgov-censtatd/2021/division-area.parquet', 'division-area.parquet', 'staged',
      '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
    FROM datasets
    WHERE code = 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups';

    INSERT INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    SELECT
      '${releaseId}', id, 'sr-${releaseId}', '2021', '2021', 'staged'
    FROM datasets
    WHERE code = 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups';
  `)

  const release = await getDatasetRecordByReleaseId(db, releaseId)
  sqlite.close()

  expect(release?.sourceVariant).toBe('hkgov-censtatd-hma')
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
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
    sourceVersion: '2026-02-18.0',
    overtureSchemaVersion: '1.16.0',
  })

  const result = await handlePublishDataset(db, {
    releaseId: 'release-dr-hk-overture-division-2026-02-18.0',
  })

  const rows = sqlite
    .query(
      `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM releases
       WHERE datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
       ORDER BY code`,
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
      divisionFixtureOverture116To118.fields.map(field => ({
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
    seedCompleteDivisionSourceSignature(sqlite, {
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
      sourceVersion: '2026-02-18.0',
      overtureSchemaVersion: '1.16.0',
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
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.1',
    sourceVersion: '2026-02-18.1',
    overtureSchemaVersion: '1.16.0',
  })

  const result = await handlePublishDataset(db, {
    releaseId: 'release-dr-hk-overture-division-2026-02-18.1',
  })

  const rows = sqlite
    .query(
      `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM releases
       WHERE datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
       ORDER BY code`,
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
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: 'snapshot-release-dr-hk-overture-division-2026-06-24.0',
    sourceVersion: '2026-06-24.0',
    overtureSchemaVersion: '1.17.0',
  })

  await handlePublishDataset(db, {
    releaseId: 'release-dr-hk-overture-division-2026-06-24.0',
  })

  const rows = sqlite
    .query(
      `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM releases
       WHERE datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
       ORDER BY code`,
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
