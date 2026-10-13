import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '../../testing/localDb'
import { assertCuratedReleaseInputs } from './curatedReleaseInputs'

test('curated build inputs require matching Overture companion releases', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE publishers (id TEXT PRIMARY KEY, code TEXT);
    CREATE TABLE datasets (id TEXT PRIMARY KEY, publisherId TEXT);
    CREATE TABLE resourceReleases (id TEXT PRIMARY KEY, sourceReleaseId TEXT, resourceType TEXT, code TEXT);
    CREATE TABLE sourceReleases(id TEXT PRIMARY KEY,datasetId TEXT);
    CREATE VIEW resourceReleaseDetails AS SELECT r.*,s.datasetId FROM resourceReleases r JOIN sourceReleases s ON s.id=r.sourceReleaseId;
    CREATE VIEW snapshotResourceReleaseDetails AS SELECT m.*,r.datasetId FROM snapshotResourceReleases m JOIN resourceReleaseDetails r ON r.id=m.resourceReleaseId;
    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT NOT NULL DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT NOT NULL,
      status TEXT
    );
    CREATE TABLE snapshotResourceReleases (snapshotId TEXT, resourceReleaseId TEXT, role TEXT, selectedByRule TEXT);
    INSERT INTO publishers VALUES ('overture', 'overture');
    INSERT INTO datasets VALUES ('division-dataset', 'overture'), ('area-dataset', 'overture');
    INSERT INTO sourceReleases VALUES ('division-dataset','division-dataset'),('area-dataset','area-dataset');
    INSERT INTO resourceReleases VALUES
      ('division-release', 'division-dataset', 'division', 'division-v1'),
      ('area-release', 'area-dataset', 'divisionArea', 'area-v1'),
      ('later-area-release', 'area-dataset', 'divisionArea', 'area-v2');
    INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'curated','fixture-lineage-' || 'curated','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'curated' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'division','fixture-lineage-' || 'division','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'division' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'area','fixture-lineage-' || 'area','divisionArea','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionArea' WHERE id='fixture-lineage-' || 'area' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, status) VALUES
('curated', 'fixture-lineage-' || 'curated', 'published'),
('division', 'fixture-lineage-' || 'division', 'published'),
('area', 'fixture-lineage-' || 'area', 'published');
    INSERT INTO snapshotResourceReleases VALUES
      ('curated', 'division-release', 'enrichment', 'provenance:curated-division:build-inputs:v1'),
      ('curated', 'area-release', 'enrichment', 'provenance:curated-division:build-inputs:v1'),
      ('division', 'division-release', 'primary', 'assembly:division:source-release:v1'),
      ('area', 'area-release', 'primary', 'assembly:division-geometry:source-release:v1');
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
      `DELETE FROM snapshotResourceReleases WHERE snapshotId = 'curated' AND resourceReleaseId IN (SELECT id FROM resourceReleaseDetails WHERE datasetId = 'division-dataset')`,
    )
    await expect(assertCuratedReleaseInputs(db, snapshots)).rejects.toThrow(
      'API Overture division selection does not match retained inputs',
    )
  } finally {
    sqlite.close()
  }
})
