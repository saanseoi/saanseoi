import { releaseFixtureSchemaSql } from '../../../../../../libs/core/src/testing/releaseFixtures'
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { retainCuratedSourceReleases } from './sourceReleases'

const source = {
  datasetCode: 'upstream',
  releaseCode: 'upstream-v1',
  sourceVersion: 'v1',
  resourceType: 'division',
  rawObjectKey: 'by-source/upstream.zip',
  contentHash: 'a'.repeat(64),
  releaseNotesUrl: '/sources/upstream/v1',
}
test('pins upstream archives and source releases independently of synthetic release notes', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE datasets(id TEXT PRIMARY KEY, code TEXT);
    ;
    ${releaseFixtureSchemaSql()};
    CREATE TABLE assets(resourceReleaseId TEXT, sourceReleaseId TEXT, assetKey TEXT, contentHash TEXT, role TEXT);
    CREATE TABLE snapshotResourceReleases(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT, anchorReleaseId TEXT, selectedByRule TEXT, selectionMode TEXT, sourceCohortKey TEXT, createdAt TEXT, PRIMARY KEY(snapshotId,resourceReleaseId));
    INSERT INTO datasets VALUES ('upstream-id','upstream');
    INSERT INTO sourceReleases (id, releaseNotesUrl) VALUES ('source-input','/sources/upstream/v1'),('synthetic','/sources/saanseoi/v1');
    INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('source-input', 'upstream-id', 'source-' || 'upstream-v1', 'v1', 'archived');
UPDATE sourceReleases SET sourceVersion = 'v1' WHERE id = 'source-input';
INSERT INTO resourceReleases (id, datasetId, sourceReleaseId, code, resourceType, status) VALUES ('input', 'upstream-id', 'source-input', 'upstream-v1', 'division', 'archived');`)
  sqlite
    .query(
      'INSERT INTO assets (resourceReleaseId, assetKey, contentHash, role) VALUES (?,?,?,?)',
    )
    .run('input', source.rawObjectKey, source.contentHash, 'releaseSourceArchive')
  try {
    const db = createLocalHarbourDb(sqlite)
    await retainCuratedSourceReleases(db, 'snapshot', 'synthetic-resource', [source])
    expect(
      sqlite
        .query(
          'SELECT resourceReleaseId, role, anchorReleaseId, selectedByRule, selectionMode FROM snapshotResourceReleases',
        )
        .all(),
    ).toEqual([
      {
        resourceReleaseId: 'input',
        role: 'enrichment',
        anchorReleaseId: 'synthetic-resource',
        selectedByRule: 'provenance:curated-division:build-inputs:v1',
        selectionMode: 'exact_ref',
      },
    ])
    expect(
      sqlite.query('SELECT releaseNotesUrl FROM sourceReleases ORDER BY id').all(),
    ).toEqual([
      { releaseNotesUrl: '/sources/upstream/v1' },
      { releaseNotesUrl: '/sources/saanseoi/v1' },
    ])
    await expect(
      retainCuratedSourceReleases(db, 'another', 'synthetic-resource', [
        { ...source, contentHash: 'b'.repeat(64) },
      ]),
    ).rejects.toThrow('pinned by the manifest')
    expect(
      sqlite
        .query("SELECT * FROM snapshotResourceReleases WHERE snapshotId='another'")
        .all(),
    ).toEqual([])
  } finally {
    sqlite.close()
  }
})
