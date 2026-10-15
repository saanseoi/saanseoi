import { readFixtureLineage } from './controlFixtures.fixtures'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import divisionFixtureOverture116To118 from '../../../../../fixtures/meta/apiFields/api-divisions-v0.1@geographic-v2.json'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import { getDatasetRecordByReleaseId } from '@repo/core/db/metaRegistry'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  createTempDir,
  handlePublishDataset,
  initDb,
  seedCompleteDivisionSourceSignature,
  seedSnapshot,
  seedCompletedAudits,
} from './controlFixtures.fixtures.ts'

test('retains a dataset source variant when reading a release for publication', async () => {
  const tempDir = createTempDir()
  const sqlite = initDb(join(tempDir, 'harbour-control-source-variant.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const resourceReleaseId = 'release-hkgov-censtatd-hma-2021'
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

    INSERT INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    SELECT
      '${resourceReleaseId}', id, 'sr-${resourceReleaseId}', '2021', '2021', 'staged'
    FROM datasets
    WHERE code = 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups';

    INSERT INTO resourceReleases (
      id, sourceReleaseId, resourceType, code,
      status, ingestedAt, createdAt, updatedAt
    )
    SELECT
      '${resourceReleaseId}', '${resourceReleaseId}', 'divisionArea', 'dr-hk-hkgov-censtatd-hma-2021',
      'staged',
      '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'
    FROM datasets
    WHERE code = 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups';
  `)

  const release = await getDatasetRecordByReleaseId(db, resourceReleaseId)
  sqlite.close()

  expect(release?.sourceVariant).toBe('hkgov-censtatd-hma')
})

test.each([false, true])(
  'publishes release sets and source history with catalogue deferral=%s',
  async deferApiCatalogRevision => {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, 'harbour-publish-historic.sqlite')
    const sqlite = initDb(dbPath)
    sqlite.exec(`DELETE FROM apiCatalogRevisionReleaseSets;
      DELETE FROM apiCatalogRevisions;
      DELETE FROM apiVersionReleaseSets;
      DELETE FROM apiReleaseSets;`)
    const db = createLocalHarbourDb(sqlite)

    insertFixtureRelease(sqlite, {
      resourceReleaseId: 'release-dr-hk-overture-division-2026-01-21.0',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-01',
      resourceType: 'division',
      sourceVersion: '2026-01-21.0',
      rawObjectKey: 'hk/overture/2026-01-21.0/division.parquet',
      originalFileName: 'division.parquet',
      status: 'current',
      ingestedAt: '2026-06-05T00:00:00.000Z',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    })
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-01-21.0',
      resourceReleaseId: 'release-dr-hk-overture-division-2026-01-21.0',
      status: 'published',
      timestamp: 1762300800000,
    })
    insertFixtureRelease(sqlite, {
      resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      source: 'overture',
      regionCode: 'hk',
      cohortKey: '2026-02',
      resourceType: 'division',
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
      resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      status: 'draft',
      timestamp: 1762300860000,
    })
    seedCompleteDivisionSourceSignature(sqlite, {
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
      sourceVersion: '2026-02-18.0',
      overtureSchemaVersion: '1.16.0',
    })

    const result = await handlePublishDataset(db, {
      resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      deferApiCatalogRevision,
    })

    const rows = sqlite
      .query(
        `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM resourceReleaseDetails AS resourceReleases
       WHERE resourceType = 'division' AND datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
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
    const provenanceRows = (await readFixtureLineage(
      sqlite,
      publishedReleaseSet.apiReleaseSetId,
    ))!.fields
      .map(field => ({
        ...field,
        composition: JSON.stringify(field.provenance.composition),
      }))
      .sort((a, b) => a.apiField.localeCompare(b.apiField))

    expect(
      sqlite.query('SELECT COUNT(*) AS count FROM apiCatalogRevisions').get(),
    ).toEqual({
      count: deferApiCatalogRevision ? 0 : 1,
    })
    expect(
      sqlite
        .query('SELECT status FROM apiVersionReleaseSets WHERE apiReleaseSetId = ?')
        .get(publishedReleaseSet.apiReleaseSetId),
    ).toEqual({ status: 'current' })
    expect(
      sqlite.query('SELECT status FROM snapshots WHERE id = ?').get(result.snapshotId!),
    ).toEqual({ status: 'published' })
    expect(Boolean(result.apiCatalogRevisionCode)).toBe(!deferApiCatalogRevision)

    sqlite.close()

    expect(result).toMatchObject({
      apiReleaseSetId: publishedReleaseSet.apiReleaseSetId,
      datasetId: 'dr-hk-overture-division-2026-02-18.0',
      releaseCode: 'dr-hk-overture-division-2026-02-18.0',
      resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
      phase: null,
      snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.0',
      status: 'current',
    })
    expect(rows).toEqual([
      {
        datasetId: 'dr-hk-overture-division-2026-01-21.0',
        status: 'archived',
        revokedAt: null,
        revocationReason: null,
      },
      {
        datasetId: 'dr-hk-overture-division-2026-02-18.0',
        status: 'current',
        revokedAt: null,
        revocationReason: null,
      },
    ])
    const keys = provenanceRows
      .map(row => JSON.stringify([row.resourceType, row.apiField, row.variant ?? null]))
      .sort()
    const expected = divisionFixtureOverture116To118.resources.flatMap(group =>
      group.fields.map(field =>
        JSON.stringify([group.resourceType, field.apiField, field.variant ?? null]),
      ),
    )
    expect(keys).toEqual([...new Set(expected)].sort())
    expect(provenanceRows.every(row => JSON.parse(row.composition).length > 0)).toBe(
      true,
    )
  },
)

test('waits briefly for imported snapshot metadata before publishing', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-delayed-snapshot.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const resourceReleaseId = 'release-dr-hk-overture-division-2026-02-18.0'

  insertFixtureRelease(sqlite, {
    resourceReleaseId,
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-02',
    resourceType: 'division',
    sourceVersion: '2026-02-18.0',
    rawObjectKey: 'hk/overture/2026-02-18.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:01:00.000Z',
    createdAt: '2026-06-05T00:01:00.000Z',
    updatedAt: '2026-06-05T00:01:00.000Z',
  })

  seedCompletedAudits(sqlite)
  setTimeout(() => {
    seedSnapshot(sqlite, {
      code: 'ss-hk-division-2026-02-18.0',
      resourceReleaseId,
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
    resourceReleaseId,
  })

  sqlite.close()

  expect(result).toMatchObject({
    apiReleaseSetId: expect.any(String),
    datasetId: 'dr-hk-overture-division-2026-02-18.0',
    releaseCode: 'dr-hk-overture-division-2026-02-18.0',
    resourceReleaseId,
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
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-02',
    resourceType: 'division',
    sourceVersion: '2026-02-18.0',
    rawObjectKey: 'hk/overture/2026-02-18.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'current',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })
  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-02-18.0',
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.0',
    status: 'published',
    timestamp: 1762300800000,
  })
  insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.1',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-02',
    resourceType: 'division',
    sourceVersion: '2026-02-18.1',
    rawObjectKey: 'hk/overture/2026-02-18.1/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:01:00.000Z',
    createdAt: '2026-06-05T00:01:00.000Z',
    updatedAt: '2026-06-05T00:01:00.000Z',
  })
  sqlite
    .query(
      'UPDATE sourceReleases SET sourceSchemaVersion = ? WHERE id = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ?)',
    )
    .run('1.16.0', 'release-dr-hk-overture-division-2026-02-18.1')
  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-02-18.1',
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.1',
    status: 'draft',
    timestamp: 1762300860000,
  })
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: 'snapshot-release-dr-hk-overture-division-2026-02-18.1',
    sourceVersion: '2026-02-18.1',
    overtureSchemaVersion: '1.16.0',
  })

  const result = await handlePublishDataset(db, {
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.1',
  })

  const rows = sqlite
    .query(
      `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM resourceReleaseDetails AS resourceReleases
       WHERE resourceType = 'division' AND datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
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
    resourceReleaseId: 'release-dr-hk-overture-division-2026-02-18.1',
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
    status: 'current',
    revokedAt: null,
    revocationReason: null,
  })
})

test('rebuilds a published Geographic snapshot into a new API release-set revision', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-rebuild.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const resourceReleaseId = 'release-dr-hk-overture-division-2026-07-22.0'
  const firstSnapshotId = 'snapshot-release-dr-hk-overture-division-2026-07-22.0'
  const rebuiltSnapshotId = `${firstSnapshotId}-r1`

  insertFixtureRelease(sqlite, {
    resourceReleaseId,
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-07',
    resourceType: 'division',
    sourceVersion: '2026-07-22.0',
    rawObjectKey: 'hk/overture/2026-07-22.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })
  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-07-22.0',
    resourceReleaseId,
    snapshotId: firstSnapshotId,
    status: 'draft',
    timestamp: 1762300800000,
  })
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: firstSnapshotId,
    sourceVersion: '2026-07-22.0',
    overtureSchemaVersion: '1.16.0',
  })

  const firstPublication = await handlePublishDataset(db, { resourceReleaseId })

  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-07-22.0-r1',
    resourceReleaseId,
    snapshotId: rebuiltSnapshotId,
    status: 'draft',
    timestamp: 1762300860000,
  })
  sqlite
    .query('UPDATE snapshots SET parentSnapshotId = ? WHERE id = ?')
    .run(firstSnapshotId, rebuiltSnapshotId)
  sqlite
    .query(
      `INSERT INTO snapshotResourceReleases (snapshotId, resourceReleaseId, role)
       SELECT ?, resourceReleaseId, role
       FROM snapshotResourceReleases
       WHERE snapshotId = ? AND role = 'supporting'`,
    )
    .run(rebuiltSnapshotId, firstSnapshotId)

  const rebuiltPublication = await handlePublishDataset(db, {
    rebuildPublishedSnapshot: true,
    resourceReleaseId,
  })

  const snapshotRows = sqlite
    .query(
      'SELECT id, status, parentSnapshotId FROM snapshots WHERE id IN (?, ?) ORDER BY id',
    )
    .all(firstSnapshotId, rebuiltSnapshotId) as Array<{
    id: string
    status: string
    parentSnapshotId: string | null
  }>

  sqlite.close()

  expect(rebuiltPublication).toMatchObject({
    apiReleaseSetStatus: 'current',
    datasetId: 'dr-hk-overture-division-2026-07-22.0',
    resourceReleaseId,
    snapshotId: rebuiltSnapshotId,
    status: 'current',
  })
  expect(rebuiltPublication.apiReleaseSetCode).toBeDefined()
  expect(rebuiltPublication.apiReleaseSetCode).not.toBe(
    firstPublication.apiReleaseSetCode,
  )
  expect(snapshotRows).toEqual([
    { id: firstSnapshotId, status: 'published', parentSnapshotId: null },
    {
      id: rebuiltSnapshotId,
      status: 'published',
      parentSnapshotId: firstSnapshotId,
    },
  ])
})

test.each([
  ['ds-hk-hkgov-pland-division-new-town', 'hkgov-pland-new-town'],
  [
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
    'hkgov-censtatd-hma',
  ],
])(
  'rebuilds native administrative ancestry for %s without mutating its published API set',
  async (datasetCode, variant) => {
    const sqlite = initDb(join(createTempDir(), 'native-hierarchy-revision.sqlite'))
    const db = createLocalHarbourDb(sqlite)
    try {
      const publisher =
        variant === 'hkgov-pland-new-town'
          ? 'hkgov-pland'
          : variant === 'hkgov-censtatd-hma'
            ? 'hkgov-censtatd'
            : 'hkgov-landsd'
      sqlite
        .query(
          `INSERT OR IGNORE INTO publishers(id,code,versionHash,createdAt,updatedAt) VALUES(?,?,'native-publisher',0,0)`,
        )
        .run(publisher, publisher)
      sqlite
        .query(`INSERT OR IGNORE INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,sourceVariant,versionHash,createdAt,updatedAt)
      VALUES(?,(SELECT id FROM publishers WHERE code=?),?,'hk','static','as-needed','divisions',?,'native-dataset',0,0)`)
        .run(variant, publisher, datasetCode, variant)
      const dataset = sqlite
        .query<{ id: string }, [string]>('SELECT id FROM datasets WHERE code=?')
        .get(datasetCode)!
      sqlite
        .query(`INSERT OR IGNORE INTO apiCompositionMembers(apiCompositionId,domainCode,resourceType,variant,role,isRequired,cohortMatchingMode,priority)
      SELECT apiCompositionId,?,'division',?,'primary',1,'exact_ref',0 FROM apiCompositionMembers
      WHERE domainCode='geographic' AND resourceType='division' LIMIT 1`)
        .run(variant, variant)
      const version = variant === 'hkgov-landsd' ? '2026-06-10.0' : '2021'
      sqlite
        .query(`INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,sourceSchemaVersion,cohortKey,status)
      VALUES('native-source',?,'native-source',?,'1.0',?,'staged')`)
        .run(dataset.id, version, version)
      sqlite.exec(`INSERT INTO resourceReleases(id,sourceReleaseId,resourceType,code,status)
      VALUES('native-release','native-source','division','native-resource','staged')`)
      if (variant !== 'hkgov-landsd') {
        sqlite
          .query(`INSERT OR IGNORE INTO apiCompositionMembers(apiCompositionId,domainCode,resourceType,variant,role,isRequired,cohortMatchingMode,priority)
        SELECT apiCompositionId,?,'divisionArea',?,'geometry',1,'exact_ref',0 FROM apiCompositionMembers
        WHERE domainCode='geographic' AND resourceType='division' LIMIT 1`)
          .run(variant, variant)
        sqlite.exec(`INSERT INTO resourceReleases(id,sourceReleaseId,resourceType,code,status)
        VALUES('native-area-release','native-source','divisionArea','native-area-resource','current')`)
        seedSnapshot(sqlite, {
          code: `ss-hk-division-area-${variant}-${version}`,
          cohortKey: version,
          datasetId: dataset.id,
          resourceType: 'divisionArea',
          resourceReleaseId: 'native-area-release',
          snapshotId: 'native-area',
          status: 'published',
        })
      }
      seedSnapshot(sqlite, {
        code: `ss-hk-division-${variant}-${version}`,
        cohortKey: version,
        datasetId: dataset.id,
        resourceReleaseId: 'native-release',
        snapshotId: 'native-first',
      })
      const first = await handlePublishDataset(db, {
        resourceReleaseId: 'native-release',
      })
      seedSnapshot(sqlite, {
        code: `ss-hk-division-${variant}-${version}-r1`,
        cohortKey: version,
        datasetId: dataset.id,
        resourceReleaseId: 'native-release',
        snapshotId: 'native-rebuilt',
        timestamp: 1762300860000,
      })
      sqlite.exec(
        "UPDATE snapshots SET parentSnapshotId='native-first' WHERE id='native-rebuilt'",
      )
      const rebuilt = await handlePublishDataset(db, {
        resourceReleaseId: 'native-release',
        rebuildPublishedSnapshot: true,
      })
      expect(rebuilt.apiReleaseSetStatus).toBe('current')
      expect(rebuilt.apiReleaseSetCode).not.toBe(first.apiReleaseSetCode)
      expect(
        sqlite.query("SELECT status FROM snapshots WHERE id='native-first'").get(),
      ).toEqual({ status: 'published' })
      expect(rebuilt.snapshotId).toBe('native-rebuilt')
    } finally {
      sqlite.close()
    }
  },
)

test('marks the superseded dataset historic for same-cohort releases with different source dates', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-same-cohort.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)

  insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2026-06-17.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-06',
    resourceType: 'division',
    sourceVersion: '2026-06-17.0',
    rawObjectKey: 'hk/overture/2026-06-17.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'current',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })
  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-06-17.0',
    resourceReleaseId: 'release-dr-hk-overture-division-2026-06-17.0',
    status: 'published',
    timestamp: 1762300800000,
  })
  insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-overture-division-2026-06-24.0',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-06',
    resourceType: 'division',
    sourceVersion: '2026-06-24.0',
    rawObjectKey: 'hk/overture/2026-06-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-05T00:01:00.000Z',
    createdAt: '2026-06-05T00:01:00.000Z',
    updatedAt: '2026-06-05T00:01:00.000Z',
  })
  sqlite
    .query(
      'UPDATE sourceReleases SET sourceSchemaVersion = ? WHERE id = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ?)',
    )
    .run('1.17.0', 'release-dr-hk-overture-division-2026-06-24.0')
  seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-06-24.0',
    resourceReleaseId: 'release-dr-hk-overture-division-2026-06-24.0',
    status: 'draft',
    timestamp: 1762300860000,
  })
  seedCompleteDivisionSourceSignature(sqlite, {
    snapshotId: 'snapshot-release-dr-hk-overture-division-2026-06-24.0',
    sourceVersion: '2026-06-24.0',
    overtureSchemaVersion: '1.17.0',
  })

  await handlePublishDataset(db, {
    resourceReleaseId: 'release-dr-hk-overture-division-2026-06-24.0',
  })

  const rows = sqlite
    .query(
      `SELECT code AS datasetId, status, revokedAt, revocationReason
       FROM resourceReleaseDetails AS resourceReleases
       WHERE resourceType = 'division' AND datasetId = (SELECT id FROM datasets WHERE code = 'ds-hk-overture-division')
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
      status: 'archived',
      revokedAt: null,
      revocationReason: null,
    },
    {
      datasetId: 'dr-hk-overture-division-2026-06-24.0',
      status: 'current',
      revokedAt: null,
      revocationReason: null,
    },
  ])
})

test('publishes an Overture baseline independently of the curated geographic API member', async () => {
  const sqlite = initDb(join(createTempDir(), 'curated-baseline.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  sqlite.exec(`UPDATE apiCompositionMembers SET variant='saanseoi'
    WHERE domainCode='geographic' AND resourceType='division' AND role='primary'`)
  const resourceReleaseId = 'release-curated-baseline'
  insertFixtureRelease(sqlite, {
    resourceReleaseId,
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-08-19.0',
    resourceType: 'division',
    sourceVersion: '2026-08-19.0',
    rawObjectKey: 'hk/overture/2026-08-19.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'processing',
    ingestedAt: '2026-09-23T00:00:00.000Z',
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  })
  insertFixtureRelease(sqlite, {
    resourceReleaseId: 'previous-baseline',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-07-22.0',
    resourceType: 'division',
    sourceVersion: '2026-07-22.0',
    rawObjectKey: 'previous.parquet',
    originalFileName: 'previous.parquet',
    status: 'current',
    ingestedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  })
  const snapshotId = seedSnapshot(sqlite, { code: 'ss-baseline', resourceReleaseId })
  const before = sqlite.query('SELECT count(*) n FROM apiReleaseSets').get()
  const deferred = await handlePublishDataset(db, {
    resourceReleaseId,
    deferSourcePublish: true,
  })
  expect(deferred.status).toBe('processing')
  expect(
    sqlite.query('SELECT status FROM snapshots WHERE id=?').get(snapshotId),
  ).toEqual({ status: 'draft' })
  const result = await handlePublishDataset(db, { resourceReleaseId })
  expect(result.status).toBe('current')
  expect(
    sqlite.query('SELECT status FROM snapshots WHERE id=?').get(snapshotId),
  ).toEqual({ status: 'published' })
  expect(
    sqlite
      .query('SELECT status FROM resourceReleases WHERE id=?')
      .get(resourceReleaseId),
  ).toEqual({ status: 'current' })
  expect(sqlite.query('SELECT count(*) n FROM apiReleaseSets').get()).toEqual(before)
  expect(
    sqlite
      .query(
        'SELECT status, supersededByResourceReleaseId FROM resourceReleases WHERE id=?',
      )
      .get('previous-baseline'),
  ).toEqual({ status: 'archived', supersededByResourceReleaseId: resourceReleaseId })
  sqlite.close()
})

test('native Division publication uses the current API when v0.1 is archived', async () => {
  const sqlite = initDb(join(createTempDir(), 'current-division-api.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  sqlite.exec(`
    INSERT INTO apiVersions (id, code, familyType, version, status, versionHash, createdAt, updatedAt)
      SELECT 'current-divisions-v02', 'api-divisions-v0.2', familyType, '0.2', 'current', versionHash, createdAt, updatedAt
      FROM apiVersions WHERE code='api-divisions-v0.1';
    UPDATE apiComposition SET apiVersionId='current-divisions-v02'
      WHERE apiVersionId=(SELECT id FROM apiVersions WHERE code='api-divisions-v0.1');
    UPDATE apiVersions SET status='archived' WHERE code='api-divisions-v0.1';
    UPDATE apiCompositionMembers SET role='inventory'
      WHERE domainCode='geographic' AND resourceType='division' AND variant='overture';
    INSERT INTO apiCompositionMembers (apiCompositionId, domainCode, resourceType, variant, role, isRequired, cohortMatchingMode, priority)
      SELECT apiCompositionId, domainCode, resourceType, 'saanseoi', 'primary', 1, 'exact_ref', 0
      FROM apiCompositionMembers WHERE domainCode='geographic' AND resourceType='division' AND variant='overture';
  `)
  const resourceReleaseId = 'native-division-current-api'
  insertFixtureRelease(sqlite, {
    resourceReleaseId,
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2025-09-24.0',
    resourceType: 'division',
    sourceVersion: '2025-09-24.0',
    rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
    originalFileName: 'division.parquet',
    status: 'processing',
    ingestedAt: '2026-10-02T00:00:00.000Z',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  })
  const snapshotId = seedSnapshot(sqlite, {
    code: 'native-current-api',
    resourceReleaseId,
  })
  const before = sqlite.query('SELECT count(*) n FROM apiReleaseSets').get()
  const result = await handlePublishDataset(db, {
    resourceReleaseId,
    deferApiReleaseSet: true,
  })
  expect(result.status).toBe('current')
  expect(
    sqlite.query('SELECT status FROM snapshots WHERE id=?').get(snapshotId),
  ).toEqual({ status: 'published' })
  expect(sqlite.query('SELECT count(*) n FROM apiReleaseSets').get()).toEqual(before)
  sqlite.close()
})
