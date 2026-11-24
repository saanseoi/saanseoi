import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  handlePublishDataset,
  initDb,
  seedCompletedAudits,
  seedSnapshot,
} from './controlFixtures.fixtures'

for (const [source, datasetCode, resourceType] of [
  ['protomaps', 'ds-hk-protomaps-island', 'divisionArea'],
  ['hkgov-rvd', 'ds-hk-hkgov-rvd-division', 'division'],
] as const) {
  test(`publishes ${source} intake without a canonical snapshot or API composition`, async () => {
    const sqlite = initDb(':memory:')
    try {
      const publisher = source === 'hkgov-rvd' ? 'hkgov-rvd' : 'protomaps'
      sqlite
        .query('INSERT OR IGNORE INTO publishers(id,code,versionHash) VALUES (?,?,?)')
        .run(`publisher-${publisher}`, publisher, 'fixture')
      sqlite
        .query(`INSERT OR IGNORE INTO datasets(id,publisherId,code,regionCode,resourceTypes,releaseType,releaseFrequency,theme,versionHash)
        VALUES (?,(SELECT id FROM publishers WHERE code=?),?,'hk',?,'static','monthly','divisions','fixture')`)
        .run(datasetCode, publisher, datasetCode, JSON.stringify([resourceType]))
      const release = insertFixtureRelease(sqlite, {
        datasetCode,
        source,
        resourceType,
        regionCode: 'hk',
        sourceVersion: '2026-10-01.0',
        cohortKey: '2026-10-01.0',
        rawObjectKey: 'fixture.zip',
        originalFileName: 'fixture.zip',
        status: 'staged',
        ingestedAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      })
      const db = createLocalHarbourDb(sqlite)
      seedCompletedAudits(sqlite)
      const countBefore = sqlite
        .query('SELECT count(*) AS count FROM apiReleaseSets')
        .get()
      const deferred = await handlePublishDataset(db, {
        resourceReleaseId: release.resourceReleaseId,
        deferSourcePublish: true,
      })
      expect(deferred.status).toBe('processing')
      expect(
        sqlite
          .query('SELECT status FROM resourceReleases WHERE id=?')
          .get(release.resourceReleaseId),
      ).toEqual({ status: 'staged' })
      sqlite
        .query(
          "UPDATE processingAudits SET stage='preparation' WHERE resourceReleaseId=?",
        )
        .run(release.resourceReleaseId)
      await expect(
        handlePublishDataset(db, { resourceReleaseId: release.resourceReleaseId }),
      ).rejects.toThrow('completed ingestion evidence')
      sqlite
        .query(
          "UPDATE processingAudits SET stage='ingestion', attemptStatus='failed' WHERE resourceReleaseId=?",
        )
        .run(release.resourceReleaseId)
      await expect(
        handlePublishDataset(db, { resourceReleaseId: release.resourceReleaseId }),
      ).rejects.toThrow('failed processing audit')
      sqlite
        .query(
          "UPDATE processingAudits SET attemptStatus='completed' WHERE resourceReleaseId=?",
        )
        .run(release.resourceReleaseId)
      const result = await handlePublishDataset(db, {
        resourceReleaseId: release.resourceReleaseId,
      })
      expect(result.status).toBe('current')
      expect(result.snapshotId).toBeUndefined()
      expect(result.apiReleaseSetId).toBeUndefined()
      expect(
        sqlite
          .query('SELECT status FROM resourceReleases WHERE id=?')
          .get(release.resourceReleaseId),
      ).toEqual({ status: 'current' })
      expect(
        sqlite.query('SELECT count(*) AS count FROM apiReleaseSets').get(),
      ).toEqual(countBefore)
      const snapshotId = seedSnapshot(sqlite, {
        code: `curated-with-${source}`,
        datasetId: datasetCode,
        resourceType,
        resourceReleaseId: release.resourceReleaseId,
      })
      sqlite
        .query(
          "UPDATE snapshotResourceReleases SET role='enrichment' WHERE snapshotId=? AND resourceReleaseId=?",
        )
        .run(snapshotId, release.resourceReleaseId)
      expect(
        (
          await handlePublishDataset(db, {
            resourceReleaseId: release.resourceReleaseId,
          })
        ).status,
      ).toBe('current')
      sqlite
        .query(
          "UPDATE snapshotResourceReleases SET role='primary' WHERE snapshotId=? AND resourceReleaseId=?",
        )
        .run(snapshotId, release.resourceReleaseId)
      await expect(
        handlePublishDataset(db, { resourceReleaseId: release.resourceReleaseId }),
      ).rejects.toThrow('no canonical snapshots')
    } finally {
      sqlite.close()
    }
  })
}
