import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '../../testing/localDb'
import { assertCuratedReleaseInputs } from './curatedReleaseInputs'

test('curated build inputs require matching Overture companion releases', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE publishers (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE datasets (id TEXT PRIMARY KEY, publisherId TEXT);
    CREATE TABLE resourceReleases (id TEXT PRIMARY KEY, datasetId TEXT, resourceType TEXT, code TEXT);
    CREATE TABLE snapshots (id TEXT PRIMARY KEY, resourceType TEXT, status TEXT);
    CREATE TABLE snapshotResourceReleases (snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT, selectedByRule TEXT);
    INSERT INTO publishers VALUES ('overture', 'overture');
    INSERT INTO datasets VALUES ('division-dataset', 'overture'), ('area-dataset', 'overture');
    INSERT INTO resourceReleases VALUES
      ('division-release', 'division-dataset', 'division', 'division-v1'),
      ('area-release', 'area-dataset', 'divisionArea', 'area-v1'),
      ('later-area-release', 'area-dataset', 'divisionArea', 'area-v2');
    INSERT INTO snapshots VALUES
      ('curated', 'division', 'published'),
      ('division', 'division', 'published'),
      ('area', 'divisionArea', 'published');
    INSERT INTO snapshotResourceReleases VALUES
      ('curated', 'division-dataset', 'division-release', 'enrichment', 'provenance:curated-division:build-inputs:v1'),
      ('curated', 'area-dataset', 'area-release', 'enrichment', 'provenance:curated-division:build-inputs:v1'),
      ('division', 'division-dataset', 'division-release', 'primary', 'assembly:division:source-release:v1'),
      ('area', 'area-dataset', 'area-release', 'primary', 'assembly:division-geometry:source-release:v1');
  `)
  try {
    const db = createLocalHarbourDb(sqlite)
    const snapshots = [
      { snapshotId: 'curated', resourceType: 'division', variant: 'saanseoi' },
      { snapshotId: 'division', resourceType: 'division', variant: 'overture' },
      { snapshotId: 'area', resourceType: 'divisionArea', variant: 'overture' },
    ] as const
    await expect(assertCuratedReleaseInputs(db, snapshots)).resolves.toBeUndefined()
    sqlite.exec(
      `UPDATE snapshotResourceReleases SET resourceReleaseId = 'later-area-release' WHERE snapshotId = 'area'`,
    )
    await expect(assertCuratedReleaseInputs(db, snapshots)).rejects.toThrow(
      'API Overture divisionArea selection does not match retained inputs',
    )
    sqlite.exec(
      `DELETE FROM snapshotResourceReleases WHERE snapshotId = 'curated' AND datasetId = 'division-dataset'`,
    )
    await expect(assertCuratedReleaseInputs(db, snapshots)).rejects.toThrow(
      'API Overture division selection does not match retained inputs',
    )
  } finally {
    sqlite.close()
  }
})
