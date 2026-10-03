import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import composition from '../../../../../fixtures/meta/apiCompositions/api-divisions-comp-v2.json'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  handlePublishDataset as publishDataset,
  handleReconcileDraftReleaseSets,
  initDb,
  seedSnapshot,
} from './controlFixtures.fixtures'

// An isolated API version exercises the real composition's first four members
// without depending on the full production field-provenance source signature.
function handlePublishDataset(
  db: Parameters<typeof publishDataset>[0],
  request: Parameters<typeof publishDataset>[1],
) {
  return publishDataset(db, request, undefined, { apiVersion: 'api-divisions-v9.9' })
}

function curatedPublicationFixture() {
  const sqlite = initDb(':memory:')
  const db = createLocalHarbourDb(sqlite)
  sqlite
    .query(
      `INSERT INTO publishers (id, code, versionHash) VALUES ('publisher-saanseoi', 'saanseoi', 'fixture')`,
    )
    .run()
  sqlite
    .query(`INSERT INTO datasets (id, publisherId, code, regionCode, resourceTypes, releaseType, releaseFrequency, theme, versionHash) VALUES
      ('saanseoi-division', 'publisher-saanseoi', 'ds-hk-saanseoi-division', 'hk', '["division"]', 'static', 'monthly', 'divisions', 'fixture'),
      ('saanseoi-area', 'publisher-saanseoi', 'ds-hk-saanseoi-division-area', 'hk', '["divisionArea"]', 'static', 'monthly', 'divisions', 'fixture')`)
    .run()
  sqlite
    .query(`INSERT INTO apiVersions (id, code, familyType, version, status, versionHash)
      VALUES ('api-v02', 'api-divisions-v9.9', 'divisions', '9.9', 'current', 'fixture')`)
    .run()
  sqlite
    .query(`INSERT INTO apiComposition (id, apiVersionId, code, version, primaryResourceType, defaultDomainCode, status, versionHash)
      VALUES ('composition-v02', 'api-v02', 'comp-divisions-v2', 2, 'division', 'geographic', 'current', 'fixture')`)
    .run()
  for (const member of requireDefined(composition.domains[0]).members.slice(0, 4)) {
    sqlite
      .query(`INSERT INTO apiCompositionMembers
      (apiCompositionId, domainCode, resourceType, variant, role, isRequired, cohortMatchingMode, priority)
      VALUES ('composition-v02', 'geographic', ?, ?, ?, ?, ?, ?)`)
      .run(
        member.resourceType,
        member.variant,
        member.role,
        Number(member.isRequired),
        member.cohortMatchingMode,
        member.priority,
      )
  }
  const seed = (
    source: 'saanseoi' | 'overture',
    resourceType: 'division' | 'divisionArea',
    version: string,
  ) => {
    const release = insertFixtureRelease(sqlite, {
      source,
      resourceType,
      regionCode: 'hk',
      cohortKey: version,
      sourceVersion: version,
      rawObjectKey: `${source}/${resourceType}/${version}.zip`,
      originalFileName: 'fixture.zip',
      status:
        source === 'overture' || resourceType === 'divisionArea'
          ? 'current'
          : 'staged',
      ingestedAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    sqlite
      .query('UPDATE resourceReleases SET sourceSchemaVersion = ? WHERE id = ?')
      .run(source === 'saanseoi' ? '1.0' : '1.17.0', release.resourceReleaseId)
    const datasetId = (
      sqlite
        .query('SELECT datasetId FROM resourceReleases WHERE id = ?')
        .get(release.resourceReleaseId) as { datasetId: string }
    ).datasetId
    const snapshotId = seedSnapshot(sqlite, {
      code: `ss-${source}-${resourceType}-${version}`,
      resourceType,
      datasetId,
      resourceReleaseId: release.resourceReleaseId,
      cohortKey: version,
      status:
        source === 'overture' || resourceType === 'divisionArea'
          ? 'published'
          : 'draft',
    })
    const lineageId = `lineage-${source}-${resourceType}`
    sqlite
      .query(`INSERT OR IGNORE INTO snapshotLineages
      (id, code, regionCode, resourceType, variant, identityMode, primaryDatasetId, versionHash)
      VALUES (?, ?, 'hk', ?, ?, 'persistent', ?, 'fixture')`)
      .run(lineageId, lineageId, resourceType, source, datasetId)
    sqlite
      .query('UPDATE snapshots SET snapshotLineageId = ? WHERE id = ?')
      .run(lineageId, snapshotId)
    return { ...release, datasetId, snapshotId, resourceType }
  }
  const inventory = seed('overture', 'division', '2026-09-23.0')
  const area = seed('overture', 'divisionArea', '2026-09-23.0')
  const curated = seed('saanseoi', 'division', '2026-10-01.0')
  const curatedArea = seed('saanseoi', 'divisionArea', '2026-10-01.0')
  for (const snapshot of [curated, curatedArea]) {
    for (const input of [inventory, area]) {
      sqlite
        .query(`INSERT INTO snapshotResourceReleases
        (snapshotId, datasetId, resourceReleaseId, role, selectedByRule, selectionMode)
        VALUES (?, ?, ?, 'enrichment', 'provenance:curated-division:build-inputs:v1', 'exact_ref')`)
        .run(snapshot.snapshotId, input.datasetId, input.resourceReleaseId)
    }
  }
  return { sqlite, db, seed, inventory, area, curated, curatedArea }
}

test('curated publication selects the latest cohort inputs and freezes their snapshot IDs', async () => {
  const fixture = curatedPublicationFixture()
  const { sqlite, db, seed, curated, inventory, area } = fixture
  try {
    seed('overture', 'division', '2026-08-19.0')
    seed('overture', 'divisionArea', '2026-10-21.0')
    const result = await handlePublishDataset(db, {
      resourceReleaseId: curated.resourceReleaseId,
    })
    expect(result.apiReleaseSetStatus).toBe('current')
    expect(
      sqlite
        .query(`SELECT snapshotId, cohortMatchingMode FROM apiReleaseSetSnapshots
      WHERE apiReleaseSetId = ? AND variant = 'overture' ORDER BY snapshotId`)
        .all(requireDefined(result.apiReleaseSetId)),
    ).toEqual(
      [inventory, area]
        .map(input => ({
          snapshotId: input.snapshotId,
          cohortMatchingMode: 'latest_at_or_before_cohort_per_dataset',
        }))
        .sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)),
    )
  } finally {
    sqlite.close()
  }
})

test.each(['division', 'divisionArea'] as const)(
  'curated publication rejects a mismatched %s companion before publishing',
  async resourceType => {
    const { sqlite, db, seed, curated } = curatedPublicationFixture()
    try {
      const wrong = seed('overture', resourceType, '2026-08-19.0')
      await expect(
        handlePublishDataset(db, {
          resourceReleaseId: curated.resourceReleaseId,
          carriedSnapshots: [
            { resourceType, snapshotId: wrong.snapshotId, variant: 'overture' },
          ],
        }),
      ).rejects.toThrow(
        `API Overture ${resourceType} selection does not match retained inputs`,
      )
      expect(
        sqlite
          .query('SELECT status FROM snapshots WHERE id = ?')
          .get(curated.snapshotId),
      ).toEqual({ status: 'draft' })
      expect(
        sqlite
          .query('SELECT status FROM resourceReleases WHERE id = ?')
          .get(curated.resourceReleaseId),
      ).toEqual({ status: 'staged' })
      expect(
        sqlite.query('SELECT count(*) AS count FROM apiCatalogRevisions').get(),
      ).toEqual({ count: 0 })
    } finally {
      sqlite.close()
    }
  },
)

test('curated publication preserves explicit matching inputs when a newer eligible snapshot exists', async () => {
  const { sqlite, db, seed, inventory, area, curated } = curatedPublicationFixture()
  try {
    const newer = seed('overture', 'division', '2026-09-30.0')
    await expect(
      handlePublishDataset(db, { resourceReleaseId: curated.resourceReleaseId }),
    ).rejects.toThrow('API Overture division selection does not match retained inputs')
    const result = await handlePublishDataset(db, {
      resourceReleaseId: curated.resourceReleaseId,
      carriedSnapshots: [inventory, area].map(input => ({
        snapshotId: input.snapshotId,
        resourceType: input.resourceType,
        variant: 'overture',
      })),
    })
    expect(result.apiReleaseSetStatus).toBe('current')
    expect(
      sqlite
        .query(
          'SELECT count(*) AS count FROM apiReleaseSetSnapshots WHERE apiReleaseSetId = ? AND snapshotId = ?',
        )
        .get(requireDefined(result.apiReleaseSetId), newer.snapshotId),
    ).toEqual({ count: 0 })
  } finally {
    sqlite.close()
  }
})

test('reconciliation validates the curated build inputs on a deferred release set', async () => {
  const { sqlite, db, seed, curated } = curatedPublicationFixture()
  try {
    const wrong = seed('overture', 'divisionArea', '2026-09-30.0')
    const draft = await handlePublishDataset(db, {
      resourceReleaseId: curated.resourceReleaseId,
      deferApiReleaseSet: true,
      carriedSnapshots: [
        {
          resourceType: 'divisionArea',
          snapshotId: wrong.snapshotId,
          variant: 'overture',
        },
      ],
    })
    expect(draft.apiReleaseSetStatus).toBe('draft')
    await expect(
      handleReconcileDraftReleaseSets(db, { apiFamily: 'divisions', regionCode: 'hk' }),
    ).rejects.toThrow(
      'API Overture divisionArea selection does not match retained inputs',
    )
    expect(
      sqlite
        .query('SELECT status FROM apiVersionReleaseSets WHERE apiReleaseSetId = ?')
        .get(requireDefined(draft.apiReleaseSetId)),
    ).toEqual({ status: 'draft' })
  } finally {
    sqlite.close()
  }
})

test('curated publication requires recorded build inputs for each selected curated snapshot', async () => {
  const { sqlite, db, curated, curatedArea, area } = curatedPublicationFixture()
  try {
    sqlite
      .query(
        'DELETE FROM snapshotResourceReleases WHERE snapshotId = ? AND resourceReleaseId = ?',
      )
      .run(curatedArea.snapshotId, area.resourceReleaseId)
    await expect(
      handlePublishDataset(db, { resourceReleaseId: curated.resourceReleaseId }),
    ).rejects.toThrow(
      `selection does not match retained inputs for curated snapshot ${curatedArea.snapshotId}. Expected: missing`,
    )
    expect(
      sqlite.query('SELECT count(*) AS count FROM apiCatalogRevisions').get(),
    ).toEqual({ count: 0 })
  } finally {
    sqlite.close()
  }
})
