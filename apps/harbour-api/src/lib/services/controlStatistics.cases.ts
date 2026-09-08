import { expect, test } from 'bun:test'
import { join } from 'node:path'
import {
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  createTempDir,
  handleBootstrapStatsReleaseSets,
  handlePublishDataset,
  handleStageFailed,
  initDb,
} from './controlFixtures.fixtures.ts'

test('publishes a dataset snapshot without finalising a shared source release', async () => {
  const tempDir = createTempDir()
  const sqlite = initDb(join(tempDir, 'harbour-control-statistic.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const datasetCode =
    'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
  sqlite.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES (
      'publisher-hkgov-censtatd', 'hkgov-censtatd',
      'vh-publisher-hkgov-censtatd', 1761264000000, 1761264000000
    );
    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, versionHash, createdAt, updatedAt
    ) VALUES (
      'dataset-censtatd-density', 'publisher-hkgov-censtatd', '${datasetCode}',
      'hk', 'static', 'yearly', 'stats', 'official-statistics',
      'vh-dataset-censtatd-density', 1761264000000, 1761264000000
    );
    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, versionHash, createdAt, updatedAt
    ) VALUES (
      'dataset-censtatd-population', 'publisher-hkgov-censtatd',
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
      'hk', 'static', 'yearly', 'stats', 'official-statistics',
      'vh-dataset-censtatd-population', 1761264000000, 1761264000000
    );
    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionStatistic') WHERE id = 'dataset-censtatd-density' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionStatistic');
    INSERT INTO apiVersions (
      id, code, familyType, version, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (
      'api-version-stats-v0.1', 'api-stats-v0.1', 'stats', '0.1', 'current',
      1761264000000, 'vh-api-stats-v0.1', 1761264000000, 1761264000000
    );
    INSERT INTO apiComposition (
      id, apiVersionId, code, version, primaryResourceType, defaultDomainCode,
      status, versionHash, createdAt, updatedAt
    ) VALUES (
      'api-composition-stats-v1', 'api-version-stats-v0.1', 'comp-stats-v1', 1,
      'divisionStatistic', 'government', 'current', 'vh-comp-stats-v1',
      1761264000000, 1761264000000
    );
    INSERT INTO apiCompositionMembers (
      apiCompositionId, domainCode, resourceType, variant, role, isRequired,
      cohortMatchingMode, priority
    ) VALUES
      (
        'api-composition-stats-v1', 'government', 'divisionStatistic',
        '${datasetCode}', 'primary', 0, 'exact_ref', 0
      ),
      (
        'api-composition-stats-v1', 'government', 'divisionStatistic',
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        'primary', 0, 'exact_ref', 1
      );
  `)
  const dataset = sqlite
    .query('SELECT id FROM datasets WHERE code = ?')
    .get(datasetCode) as { id: string }
  const releaseId = 'release-hkgov-censtatd-district-statistic-2022'
  sqlite
    .query(
      `INSERT INTO sourceReleases
       (id, datasetId, code, sourceVersion, cohortKey, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(releaseId, dataset.id, `sr-${releaseId}`, '2022', '2022', 'processing')
  sqlite
    .query(
      `INSERT INTO releases (
        id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
        rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      releaseId,
      releaseId,
      dataset.id,
      'divisionStatistic',
      'dr-hk-hkgov-censtatd-division-statistic-land-area-population-density-district-2022',
      '2022',
      '2022',
      'hk/hkgov-censtatd/2022/division-statistic.parquet',
      'division-statistic.parquet',
      'processing',
      '2026-08-16T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
    )
  const snapshot = await ensureDraftSnapshotForRelease(db, 'divisionStatistic', {
    cohortKey: '2022',
    datasetCode,
    datasetId: dataset.id,
    regionCode: 'hk',
    sourceReleaseId: releaseId,
    variant: datasetCode,
  })
  sqlite
    .query(
      'INSERT INTO releaseProvenance (releaseId, manifestHash, byteLength, applicationCount) VALUES (?, ?, ?, ?)',
    )
    .run(releaseId, `sha256:${'0'.repeat(64)}`, 1, 1)
  await upsertSnapshotSource(db, snapshot.id, dataset.id, releaseId, 'primary')

  const result = await handlePublishDataset(db, {
    deferSourcePublish: true,
    releaseId,
  })
  const release = sqlite
    .query('SELECT status FROM releases WHERE id = ?')
    .get(releaseId) as { status: string }

  expect(result).toMatchObject({
    apiReleaseSetCode: 'data-hk-stats-2022',
    apiReleaseSetStatus: 'current',
    releaseId,
    snapshotId: snapshot.id,
    metadataDelta: {
      releases: [],
      snapshots: [
        {
          id: snapshot.id,
          status: 'published',
        },
      ],
    },
    status: 'processing',
  })
  if (!result.apiReleaseSetId) throw new Error('Expected an API release-set ID.')
  expect(
    sqlite
      .query('SELECT cohortKey FROM apiReleaseSets WHERE id = ?')
      .get(result.apiReleaseSetId),
  ).toEqual({ cohortKey: '2022' })
  expect(release.status).toBe('processing')
  sqlite.close()
})

test('bootstraps one cohort-complete initial Statistics release set', async () => {
  const tempDir = createTempDir()
  const sqlite = initDb(join(tempDir, 'harbour-control-statistics-bootstrap.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const datasetCodes = [
    'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
  ] as const
  const releaseIds: string[] = []

  sqlite.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt)
    VALUES ('publisher-hkgov-censtatd', 'hkgov-censtatd', 'vh-publisher', 1761264000000, 1761264000000);
    INSERT INTO apiVersions (
      id, code, familyType, version, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES (
      'api-version-stats-v0.1', 'api-stats-v0.1', 'stats', '0.1', 'current',
      1761264000000, 'vh-api-stats-v0.1', 1761264000000, 1761264000000
    );
    INSERT INTO apiComposition (
      id, apiVersionId, code, version, primaryResourceType, defaultDomainCode,
      status, versionHash, createdAt, updatedAt
    ) VALUES (
      'api-composition-stats-v1', 'api-version-stats-v0.1', 'comp-stats-v1', 1,
      'divisionStatistic', 'government', 'current', 'vh-comp-stats-v1',
      1761264000000, 1761264000000
    );
  `)

  for (const [index, datasetCode] of datasetCodes.entries()) {
    const datasetId = `dataset-${index}`
    const releaseId = `release-${index}`
    releaseIds.push(releaseId)
    sqlite.exec(`
      INSERT INTO datasets (
        id, publisherId, code, regionCode, releaseType, releaseFrequency,
        theme, sourceVariant, versionHash, createdAt, updatedAt
      ) VALUES (
        '${datasetId}', 'publisher-hkgov-censtatd', '${datasetCode}',
        'hk', 'static', 'five-yearly', 'stats', 'official-statistics',
        'vh-dataset-${index}', 1761264000000, 1761264000000
      );
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionStatistic') WHERE id = '${datasetId}' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionStatistic');
      INSERT INTO apiCompositionMembers (
        apiCompositionId, domainCode, resourceType, variant, role, isRequired,
        cohortMatchingMode, priority
      ) VALUES (
        'api-composition-stats-v1', 'government', 'divisionStatistic', '${datasetCode}',
        'primary', 0, 'exact_ref', ${index}
      );
      INSERT INTO sourceReleases
        (id, datasetId, code, sourceVersion, cohortKey, status)
      VALUES (
        '${releaseId}', '${datasetId}', 'sr-${releaseId}', '2026-Q2', '2026-Q2',
        'processing'
      );
      INSERT INTO releases (
        id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
        rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${releaseId}', '${releaseId}', '${datasetId}', 'divisionStatistic', 'dr-hk-test-${index}-2026-Q2',
        '2026-Q2', '2026-Q2', 'hk/test/2026-Q2/${index}.parquet', '${index}.parquet',
        'processing', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z',
        '2026-08-25T00:00:00.000Z'
      );
      INSERT INTO releaseProvenance (releaseId, manifestHash, byteLength, applicationCount)
      VALUES ('${releaseId}', 'sha256:${'0'.repeat(64)}', 1, 1);
    `)
    const snapshot = await ensureDraftSnapshotForRelease(db, 'divisionStatistic', {
      cohortKey: '2026-Q2',
      datasetCode,
      datasetId,
      regionCode: 'hk',
      sourceReleaseId: releaseId,
      variant: datasetCode,
    })
    await upsertSnapshotSource(db, snapshot.id, datasetId, releaseId, 'primary')
  }

  const sharedReleaseId = releaseIds[0]
  if (!sharedReleaseId) throw new Error('Expected a shared Statistics release.')
  const deferredSharedRelease = await handlePublishDataset(db, {
    deferSourcePublish: true,
    deferStatsReleaseSet: true,
    releaseId: sharedReleaseId,
  })
  expect(deferredSharedRelease).toMatchObject({
    metadataDelta: { releases: [] },
    status: 'processing',
  })
  expect(
    sqlite.query('SELECT status FROM releases WHERE id = ?').get(sharedReleaseId),
  ).toEqual({ status: 'processing' })

  for (const releaseId of releaseIds) {
    await handlePublishDataset(db, { deferStatsReleaseSet: true, releaseId })
  }
  const firstReleaseId = releaseIds[0]
  if (!firstReleaseId) throw new Error('Expected a Statistics source release.')
  await handleStageFailed(db, {
    error: 'Late worker failure after deferred publication.',
    phase: 'processDataset',
    releaseId: firstReleaseId,
  })
  expect(
    sqlite.query(`SELECT status FROM releases WHERE id = ?`).get(firstReleaseId),
  ).toEqual({ status: 'published' })
  // A C&SD source can materialise both geometry and Statistics snapshots. The
  // source release may be classified as geometry, but its linked Statistics
  // snapshot must still enter the cohort release set; the geometry snapshot
  // itself must not.
  const geometrySnapshot = await ensureDraftSnapshotForRelease(db, 'divisionArea', {
    cohortKey: '2026-Q2',
    datasetCode: datasetCodes[0],
    datasetId: 'dataset-0',
    regionCode: 'hk',
    sourceReleaseId: firstReleaseId,
    variant: 'hkgov-censtatd',
  })
  await upsertSnapshotSource(
    db,
    geometrySnapshot.id,
    'dataset-0',
    firstReleaseId,
    'primary',
  )
  sqlite.exec(`
    UPDATE snapshots SET status = 'published' WHERE id = '${geometrySnapshot.id}';
    UPDATE releases SET resourceType = 'divisionArea' WHERE id = '${firstReleaseId}';
  `)
  expect(
    sqlite
      .query(
        "SELECT count(*) AS count FROM apiReleaseSets WHERE code LIKE 'data-hk-stats-2026-q2%'",
      )
      .get(),
  ).toEqual({ count: 0 })

  const result = await handleBootstrapStatsReleaseSets(db)

  expect(result).toEqual({
    createdReleaseSetCodes: ['data-hk-stats-2026-q2'],
    inspectedSnapshots: 1,
    skippedCohortKeys: [],
  })
  expect(
    sqlite
      .query(
        `SELECT status, revision FROM apiReleaseSets WHERE code = 'data-hk-stats-2026-q2'`,
      )
      .get(),
  ).toEqual({ revision: 0, status: 'current' })
  expect(
    sqlite
      .query(
        `SELECT count(*) AS count FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = (
          SELECT id FROM apiReleaseSets WHERE code = 'data-hk-stats-2026-q2'
        )`,
      )
      .get(),
  ).toEqual({ count: 1 })
  expect(
    sqlite
      .query(`SELECT count(*) AS count FROM releases WHERE status = 'published'`)
      .get(),
  ).toEqual({ count: 1 })

  expect(await handleBootstrapStatsReleaseSets(db)).toEqual({
    createdReleaseSetCodes: [],
    inspectedSnapshots: 1,
    skippedCohortKeys: ['2026-Q2'],
  })
  expect(
    sqlite
      .query(
        `SELECT count(*) AS count
         FROM apiReleaseSets
         WHERE code LIKE 'data-hk-stats-2026-q2%'`,
      )
      .get(),
  ).toEqual({ count: 1 })

  sqlite.exec(`
    INSERT INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    VALUES (
      'legacy-release-2022', 'dataset-0', 'sr-legacy-release-2022',
      '2022', '2022', 'processing'
    );
    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
      rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      'legacy-release-2022', 'legacy-release-2022', 'dataset-0', 'divisionStatistic', 'dr-hk-test-2022',
      '2022', '2022', 'hk/test/2022/legacy.parquet', 'legacy.parquet',
      'processing', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z',
      '2026-08-25T00:00:00.000Z'
    );
  `)
  const legacySnapshot = await ensureDraftSnapshotForRelease(db, 'divisionStatistic', {
    cohortKey: '2022',
    datasetCode: datasetCodes[0],
    datasetId: 'dataset-0',
    regionCode: 'hk',
    sourceReleaseId: 'legacy-release-2022',
    variant: datasetCodes[0],
  })
  await upsertSnapshotSource(
    db,
    legacySnapshot.id,
    'dataset-0',
    'legacy-release-2022',
    'primary',
  )
  sqlite.exec(`
    INSERT INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    VALUES (
      'staged-release-2023', 'dataset-0', 'sr-staged-release-2023',
      '2023', '2023', 'staged'
    );
    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey,
      rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      'staged-release-2023', 'staged-release-2023', 'dataset-0', 'divisionStatistic', 'dr-hk-test-2023',
      '2023', '2023', 'hk/test/2023/staged.parquet', 'staged.parquet',
      'staged', '2026-08-25T00:00:00.000Z', '2026-08-25T00:00:00.000Z',
      '2026-08-25T00:00:00.000Z'
    );
  `)
  const stagedSnapshot = await ensureDraftSnapshotForRelease(db, 'divisionStatistic', {
    cohortKey: '2023',
    datasetCode: datasetCodes[0],
    datasetId: 'dataset-0',
    regionCode: 'hk',
    sourceReleaseId: 'staged-release-2023',
    variant: datasetCodes[0],
  })
  await upsertSnapshotSource(
    db,
    stagedSnapshot.id,
    'dataset-0',
    'staged-release-2023',
    'primary',
  )

  expect(await handleBootstrapStatsReleaseSets(db)).toEqual({
    createdReleaseSetCodes: [],
    inspectedSnapshots: 1,
    skippedCohortKeys: ['2026-Q2'],
  })
  expect(
    sqlite.query(`SELECT status FROM releases WHERE id = 'legacy-release-2022'`).get(),
  ).toEqual({ status: 'processing' })
  expect(
    sqlite.query(`SELECT status FROM releases WHERE id = 'staged-release-2023'`).get(),
  ).toEqual({ status: 'staged' })
  expect(
    sqlite.query(`SELECT status FROM snapshots WHERE id = ?`).get(legacySnapshot.id),
  ).toEqual({ status: 'draft' })
  expect(
    sqlite.query(`SELECT status FROM snapshots WHERE id = ?`).get(stagedSnapshot.id),
  ).toEqual({ status: 'draft' })
  expect(
    sqlite
      .query(
        `SELECT count(*) AS count
         FROM apiReleaseSets
         WHERE code IN ('data-hk-stats-2022', 'data-hk-stats-2023')`,
      )
      .get(),
  ).toEqual({ count: 0 })

  sqlite.exec(
    "UPDATE releases SET status = 'published' WHERE id = 'legacy-release-2022'",
  )
  const legacyReleaseSet = await ensureDraftReleaseSetForRelease(
    db,
    'divisionStatistic',
    { cohortKey: '2022', regionCode: 'hk' },
    { domainCode: 'government' },
  )
  expect(legacyReleaseSet.code).toBe('data-hk-stats-2022')

  expect(await handleBootstrapStatsReleaseSets(db)).toEqual({
    createdReleaseSetCodes: [],
    inspectedSnapshots: 2,
    skippedCohortKeys: ['2022', '2026-Q2'],
  })
  expect(
    sqlite
      .query(
        `SELECT count(*) AS count FROM apiReleaseSets WHERE code = 'data-hk-stats-2022'`,
      )
      .get(),
  ).toEqual({ count: 1 })
  sqlite.close()
})
