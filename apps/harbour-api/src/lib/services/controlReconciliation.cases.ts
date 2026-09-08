import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  createTempDir,
  handlePublishDataset,
  handleReconcileDraftReleaseSets,
  initDb,
  seedSnapshot,
} from './controlFixtures.fixtures.ts'

test('restores missing Overture draft sets from retained geography without stats prerequisites', async () => {
  const sqlite = initDb(join(createTempDir(), 'restore-division-sets.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const cohortKey = '2025-09-24.0'
  sqlite.exec(`INSERT INTO apiCompositionMembers (
    apiCompositionId, domainCode, resourceType, variant, role, isRequired,
    cohortMatchingMode, priority
  ) VALUES ('api-composition-divisions-v1', 'geographic', 'divisionArea',
    'hkgov-censtatd-area', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', 15);`)
  const release = insertFixtureRelease(sqlite, {
    source: 'overture',
    regionCode: 'hk',
    cohortKey,
    type: 'division',
    sourceVersion: cohortKey,
    rawObjectKey: 'hk/overture/division.parquet',
    originalFileName: 'division.parquet',
    status: 'published',
    ingestedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  })
  const snapshotId = seedSnapshot(sqlite, {
    code: `ss-hk-division-${cohortKey}`,
    cohortKey,
    datasetId: 'overture-hk-division',
    resourceType: 'division',
    releaseId: release.releaseId,
    status: 'published',
  })
  sqlite.exec(`INSERT INTO snapshotLineages (
    id, code, regionCode, resourceType, variant, identityMode,
    primaryDatasetId, versionHash, createdAt, updatedAt
  ) VALUES ('restore-overture', 'restore-overture', 'hk', 'division', 'overture',
    'persistent', 'overture-hk-division', 'restore', 1, 1);`)
  sqlite
    .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
    .run('restore-overture', snapshotId)
  const result = await handleReconcileDraftReleaseSets(db, {
    apiFamily: 'divisions',
    regionCode: 'hk',
  })
  expect(result.inspected).toBe(1)
  expect(result.publishedReleaseSetCodes).toEqual([])
  expect(result.pendingReleaseSetCodes).toHaveLength(1)
  const setCount = sqlite.query('SELECT count(*) AS n FROM apiReleaseSets').get()
  const repeated = await handleReconcileDraftReleaseSets(db, {
    apiFamily: 'divisions',
    regionCode: 'hk',
  })
  expect(repeated.pendingReleaseSetCodes).toEqual(result.pendingReleaseSetCodes)
  expect(sqlite.query('SELECT count(*) AS n FROM apiReleaseSets').get()).toEqual(
    setCount,
  )
  sqlite.close()
})

test('reconciles a draft division release set once its required C&SD areas are available', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-had-draft-release-set.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const cohortKey = '2025-09-24.0'
  const releaseSetId = 'd092ef65-1ae3-4a3d-beb2-19f20e8f5904'

  sqlite.exec(`
    UPDATE apiComposition
    SET i18n = '{"geographic":[{"locale":"en","name":"Geographic","description":"Explore the geographical and administrative divisions used to describe Hong Kong, including districts, planning units, new towns, boundaries, and areas."}]}'
    WHERE id = 'api-composition-divisions-v1';

    DELETE FROM apiCompositionMembers
    WHERE apiCompositionId = 'api-composition-divisions-v1';

    INSERT INTO apiCompositionMembers (
      apiCompositionId, domainCode, resourceType, variant, role, isRequired,
      cohortMatchingMode, anchorResourceType, maxLagDays, priority, configJson
    ) VALUES
      ('api-composition-divisions-v1', 'geographic', 'division', 'overture', 'primary', 1, 'exact_ref', null, null, 0, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'overture', 'geometry', 1, 'exact_ref', null, null, 10, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'hkgov-had', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', null, null, 11, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'hkgov-censtatd:2016', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', null, null, 12, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'hkgov-censtatd:2021', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', null, null, 13, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'hkgov-censtatd-area', 'geometry', 1, 'latest_at_or_before_cohort_per_dataset', null, null, 15, null),
      ('api-composition-divisions-v1', 'geographic', 'divisionBoundary', 'overture', 'geometry', 1, 'exact_ref', null, null, 20, null);

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
      'geographic',
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
      theme, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES
      ('overture-hk-divisionArea', 'publisher-overture', 'ds-hk-overture-division-area', 'hk', 'static', 'monthly', 'divisions', 'https://docs.overturemaps.org/', 'vh-overture-area', 1761264000001, 1761264000001),
      ('overture-hk-divisionBoundary', 'publisher-overture', 'ds-hk-overture-division-boundary', 'hk', 'static', 'monthly', 'divisions', 'https://docs.overturemaps.org/', 'vh-overture-boundary', 1761264000001, 1761264000001),
      ('hkgov-had-hk-district', 'publisher-hkgov-had', 'ds-hk-hkgov-had-division-area-district', 'hk', 'static', 'as-needed', 'divisions', 'https://data.gov.hk/', 'vh-had-district', 1761264000001, 1761264000001);

    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'overture-hk-divisionArea' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionBoundary') WHERE id = 'overture-hk-divisionBoundary' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionBoundary');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-had-hk-district' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
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
    INSERT INTO sourceReleases
      (id, datasetId, code, sourceVersion, cohortKey, status)
    VALUES (
      '${hadArea.releaseId}', 'hkgov-had-hk-district',
      'sr-${hadArea.releaseCode}', '2022', '2022', 'staged'
    );
    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion, cohortKey, rawObjectKey,
      originalFileName, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      '${hadArea.releaseId}',
      '${hadArea.releaseId}',
      'hkgov-had-hk-district',
      'divisionArea',
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
  sqlite.exec(`
    INSERT INTO snapshotLineages (
      id, code, regionCode, resourceType, variant, identityMode,
      primaryDatasetId, versionHash, createdAt, updatedAt
    ) VALUES
      ('lineage-overture-division', 'sl-ds-hk-overture-division', 'hk', 'division', 'overture', 'persistent', 'overture-hk-division', 'vh-lineage-overture-division', 1761264000001, 1761264000001),
      ('lineage-overture-division-area', 'sl-ds-hk-overture-division-area', 'hk', 'divisionArea', 'overture', 'persistent', 'overture-hk-divisionArea', 'vh-lineage-overture-division-area', 1761264000001, 1761264000001),
      ('lineage-overture-division-boundary', 'sl-ds-hk-overture-division-boundary', 'hk', 'divisionBoundary', 'overture', 'persistent', 'overture-hk-divisionBoundary', 'vh-lineage-overture-division-boundary', 1761264000001, 1761264000001),
      ('lineage-hkgov-had-division-area', 'sl-ds-hk-hkgov-had-division-area-district', 'hk', 'divisionArea', 'hkgov-had', 'persistent', 'hkgov-had-hk-district', 'vh-lineage-hkgov-had-division-area', 1761264000001, 1761264000001);

    UPDATE snapshots
    SET snapshotLineageId = CASE id
      WHEN 'snapshot-${division.releaseId}' THEN 'lineage-overture-division'
      WHEN 'snapshot-${overtureArea.releaseId}' THEN 'lineage-overture-division-area'
      WHEN 'snapshot-${boundary.releaseId}' THEN 'lineage-overture-division-boundary'
      WHEN '${hadSnapshotId}' THEN 'lineage-hkgov-had-division-area'
    END
    WHERE id IN (
      'snapshot-${division.releaseId}',
      'snapshot-${overtureArea.releaseId}',
      'snapshot-${boundary.releaseId}',
      '${hadSnapshotId}'
    );
  `)

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

  sqlite.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt) VALUES
      ('publisher-hkgov-censtatd', 'hkgov-censtatd', 'vh-publisher-hkgov-censtatd', 1761264000001, 1761264000001);

    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES (
      'hkgov-censtatd-hk-district', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district', 'hk', 'static', 'five-yearly', 'divisions', 'https://www.censtatd.gov.hk/', 'vh-censtatd-district', 1761264000001, 1761264000001
    ), (
      'hkgov-censtatd-hk-district-annual', 'publisher-hkgov-censtatd', 'ds-hk-hkgov-censtatd-division-statistic-population-households-district', 'hk', 'static', 'yearly', 'divisions', 'https://www.censtatd.gov.hk/', 'vh-censtatd-district-annual', 1761264000001, 1761264000001
    );

    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-district' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-district-annual' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
  `)
  for (const year of ['2016', '2021']) {
    const releaseId = `release-dr-hk-hkgov-censtatd-division-area-district-${year}`
    sqlite.exec(`
      INSERT INTO sourceReleases (
        id, datasetId, code, sourceVersion, sourceSchemaVersion, cohortKey, status,
        ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${releaseId}', 'hkgov-censtatd-hk-district',
        'sr-hk-hkgov-censtatd-division-area-district-${year}', '${year}', '1.0', '${year}',
        'published', '2026-06-05T00:01:00.000Z',
        '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
      );

      INSERT INTO releases (
        id, sourceReleaseId, datasetId, resourceType, code, sourceVersion,
        sourceSchemaVersion, cohortKey,
        rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
      ) VALUES (
        '${releaseId}', '${releaseId}', 'hkgov-censtatd-hk-district', 'divisionArea',
        'dr-hk-hkgov-censtatd-division-area-district-${year}', '${year}', '1.0', '${year}',
        'hk/hkgov-censtatd/${year}/division-area.gml', 'division-area.gml', 'published',
        '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
      );

      INSERT INTO snapshotLineages (
        id, code, regionCode, resourceType, variant, identityMode,
        primaryDatasetId, versionHash, createdAt, updatedAt
      ) VALUES (
        'lineage-censtatd-${year}', 'sl-ds-hk-hkgov-censtatd-division-area-district-${year}', 'hk', 'divisionArea', 'hkgov-censtatd:${year}', 'persistent', 'hkgov-censtatd-hk-district', 'vh-lineage-censtatd-${year}', 1761264000001, 1761264000001
      );
    `)
    const snapshotId = seedSnapshot(sqlite, {
      code: `ss-hk-division-area-district-${year}`,
      cohortKey: year,
      datasetId: 'hkgov-censtatd-hk-district',
      resourceType: 'divisionArea',
      releaseId,
      status: 'published',
    })
    sqlite
      .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
      .run(`lineage-censtatd-${year}`, snapshotId)
  }

  sqlite.exec(`
    INSERT INTO sourceReleases (
      id, datasetId, code, sourceVersion, sourceSchemaVersion, cohortKey, status,
      ingestedAt, createdAt, updatedAt
    ) VALUES (
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'hkgov-censtatd-hk-district-annual',
      'sr-hk-hkgov-censtatd-division-area-district-annual-2024',
      '2024', '1.0', '2024', 'published', '2026-06-05T00:01:00.000Z',
      '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
    );

    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion,
      sourceSchemaVersion, cohortKey,
      rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'hkgov-censtatd-hk-district-annual', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-area-district-annual-2024', '2024', '1.0', '2024',
      'hk/hkgov-censtatd/2024/division-area.gml', 'division-area.gml', 'published',
      '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z', '2026-06-05T00:01:00.000Z'
    );
    INSERT INTO snapshotLineages (
      id, code, regionCode, resourceType, variant, identityMode,
      primaryDatasetId, versionHash, createdAt, updatedAt
    ) VALUES (
      'lineage-censtatd-annual-2024',
      'sl-ds-hk-hkgov-censtatd-division-area-district-annual',
      'hk', 'divisionArea', 'hkgov-censtatd', 'persistent',
      'hkgov-censtatd-hk-district-annual', 'vh-lineage-censtatd-annual-2024',
      1761264000001, 1761264000001
    );
  `)
  const annualSnapshotId = seedSnapshot(sqlite, {
    code: 'ss-hk-division-area-district-annual-2024',
    cohortKey: '2024',
    datasetId: 'hkgov-censtatd-hk-district-annual',
    resourceType: 'divisionArea',
    releaseId: 'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
    status: 'published',
  })
  sqlite
    .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
    .run('lineage-censtatd-annual-2024', annualSnapshotId)

  const incompleteReconciliation = await handleReconcileDraftReleaseSets(db, {
    apiFamily: 'divisions',
    regionCode: 'hk',
  })
  const stillDraftSet = sqlite
    .query('SELECT status FROM apiReleaseSets WHERE id = ?')
    .get(releaseSetId) as { status: string }

  sqlite.exec(`
    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency,
      theme, sourceVariant, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES (
      'hkgov-censtatd-hk-permanent-living-quarters', 'publisher-hkgov-censtatd',
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
      'hk', 'static', 'half-yearly', 'divisions', 'hkgov-censtatd-area',
      'https://www.censtatd.gov.hk/', 'vh-censtatd-permanent-living-quarters',
      1761264000001, 1761264000001
    );

    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-censtatd-hk-permanent-living-quarters' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');

    INSERT INTO sourceReleases (
      id, datasetId, code, sourceVersion, sourceSchemaVersion, cohortKey, status,
      ingestedAt, createdAt, updatedAt
    ) VALUES (
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'hkgov-censtatd-hk-permanent-living-quarters',
      'sr-hkgov-censtatd-permanent-living-quarters-2023-H2',
      '2023-H2', '1.0', '2023-H2', 'published', '2026-06-05T00:02:00.000Z',
      '2026-06-05T00:02:00.000Z', '2026-06-05T00:02:00.000Z'
    );

    INSERT INTO releases (
      id, sourceReleaseId, datasetId, resourceType, code, sourceVersion,
      sourceSchemaVersion, cohortKey,
      rawObjectKey, originalFileName, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
      'hkgov-censtatd-hk-permanent-living-quarters', 'divisionArea',
      'dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2',
      '2023-H2', '1.0', '2023-H2',
      'hk/hkgov-censtatd/2023-H2/division-area.parquet', 'division-area.parquet',
      'published', '2026-06-05T00:02:00.000Z',
      '2026-06-05T00:02:00.000Z', '2026-06-05T00:02:00.000Z'
    );

    INSERT INTO snapshotLineages (
      id, code, regionCode, resourceType, variant, identityMode,
      primaryDatasetId, versionHash, createdAt, updatedAt
    ) VALUES (
      'lineage-censtatd-area-type', 'sl-ds-hk-hkgov-censtatd-area-type',
      'hk', 'divisionArea', 'hkgov-censtatd-area', 'persistent',
      'hkgov-censtatd-hk-permanent-living-quarters', 'vh-lineage-censtatd-area-type',
      1761264000001, 1761264000001
    );
  `)
  const areaTypeSnapshotId = seedSnapshot(sqlite, {
    code: 'ss-hk-division-area-hkgov-censtatd-area-2023-H2',
    cohortKey: '2023-H2',
    datasetId: 'hkgov-censtatd-hk-permanent-living-quarters',
    resourceType: 'divisionArea',
    releaseId: 'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
    status: 'published',
  })
  sqlite
    .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
    .run('lineage-censtatd-area-type', areaTypeSnapshotId)
  sqlite
    .query(
      'INSERT INTO snapshotSources (snapshotId, datasetId, resourceReleaseId, role) VALUES (?, ?, ?, ?)',
    )
    .run(
      areaTypeSnapshotId,
      'hkgov-censtatd-hk-district-annual',
      'release-dr-hk-hkgov-censtatd-division-area-district-annual-2024',
      'supporting',
    )

  // Initialisation stages the Overture members as draft r0 sets until every
  // required C&SD area is ready. Publishing the final provider with the
  // deferral must preserve that r0 rather than minting an enrichment r1.
  const deferredPublication = await handlePublishDataset(db, {
    deferApiReleaseSet: true,
    releaseId: 'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
  })
  const revisionRowsBeforeReconciliation = sqlite
    .query(
      'SELECT code, revision, status FROM apiReleaseSets WHERE cohortKey = ? ORDER BY revision',
    )
    .all(cohortKey) as Array<{ code: string; revision: number; status: string }>

  const reconciliation = await handleReconcileDraftReleaseSets(db, {
    apiFamily: 'divisions',
    regionCode: 'hk',
  })
  const reconciledSet = sqlite
    .query('SELECT status FROM apiReleaseSets WHERE id = ?')
    .get(releaseSetId) as { status: string }

  expect(result.apiReleaseSetId).toBe(releaseSetId)
  expect(result.apiReleaseSetStatus).toBe('draft')
  expect(publishedSet.status).toBe('draft')
  expect(hadRelease.status).toBe('published')
  expect(hadSnapshot.status).toBe('published')
  expect(incompleteReconciliation).toMatchObject({
    inspected: 1,
    pendingReleaseSetCodes: [`data-hk-divisions-${cohortKey}`],
    publishedReleaseSetCodes: [],
  })
  expect(stillDraftSet.status).toBe('draft')
  expect(deferredPublication).toMatchObject({
    apiReleaseSetCode: `data-hk-divisions-${cohortKey}`,
    apiReleaseSetStatus: 'draft',
    metadataDelta: {
      snapshots: [
        {
          id: areaTypeSnapshotId,
          status: 'published',
          publishedAt: expect.any(String),
          validFrom: expect.any(String),
          validTo: null,
        },
      ],
    },
  })
  expect(revisionRowsBeforeReconciliation).toEqual([
    {
      code: `data-hk-divisions-${cohortKey}`,
      revision: 0,
      status: 'draft',
    },
  ])
  expect(reconciliation).toMatchObject({
    inspected: 1,
    pendingReleaseSetCodes: [],
    publishedReleaseSetCodes: [`data-hk-divisions-${cohortKey}`],
    publishedReleaseSetPublications: [
      {
        apiFamily: 'divisions',
        apiReleaseSetCode: `data-hk-divisions-${cohortKey}`,
        cohortKey,
        description:
          'Explore the geographical and administrative divisions used to describe Hong Kong, including districts, planning units, new towns, boundaries, and areas.',
        domainCode: 'geographic',
        domainName: 'Geographic',
        publisherName: 'overture',
        regionCode: 'hk',
        revision: 0,
      },
    ],
  })
  expect(reconciledSet.status).toBe('current')
  const statsRecovery = await handleReconcileDraftReleaseSets(db, {
    apiFamily: 'divisions',
    regionCode: 'hk',
  })
  expect(statsRecovery.publishedReleaseSetStatsTargets).toContainEqual({
    apiReleaseSetId: releaseSetId,
    cohortKey,
    family: 'division',
    releaseCode: division.releaseCode,
    releaseId: division.releaseId,
    snapshotId: expect.any(String),
  })
  const deferredAfterReconciliation = await handlePublishDataset(db, {
    deferApiReleaseSet: true,
    releaseId: 'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
  })
  const revisionRowsAfterReconciliation = sqlite
    .query(
      'SELECT code, revision, status FROM apiReleaseSets WHERE cohortKey = ? ORDER BY revision',
    )
    .all(cohortKey) as Array<{ code: string; revision: number; status: string }>

  expect(deferredAfterReconciliation).toMatchObject({
    releaseId: 'release-dr-hk-hkgov-censtatd-permanent-living-quarters-2023-H2',
    snapshotId: areaTypeSnapshotId,
    status: 'published',
  })
  expect(revisionRowsAfterReconciliation).toEqual([
    {
      code: `data-hk-divisions-${cohortKey}`,
      revision: 0,
      status: 'current',
    },
  ])
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
  sqlite.close()
})
