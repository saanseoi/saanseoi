import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { assertPlaceAddressDependencies } from './control'

test('Place publication requires an exact completed supplementary dependency', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE snapshotDependencies(snapshotId TEXT, dependencySnapshotId TEXT, role TEXT, PRIMARY KEY(snapshotId,role));
    CREATE TABLE snapshots(
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT NOT NULL,
      status TEXT
    );
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
    CREATE TABLE snapshotResourceReleases(snapshotId TEXT, resourceReleaseId TEXT, role TEXT,
      selectedByRule TEXT, selectionMode TEXT, anchorReleaseId TEXT, createdAt TEXT);
    INSERT INTO snapshotLineages (id,variant) VALUES ('lineage','overture-places');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('lineage','lineage','address','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='address' WHERE id='lineage' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, status) VALUES
('supplementary', 'lineage', 'published');

    INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role,anchorReleaseId)
      VALUES ('supplementary','address-release','primary','place-release');
    INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role,selectedByRule)
      VALUES ('place','address-release','lookup','api-composition:places/overture:place/overture->address/overture-places');
  `)
  const db = createLocalHarbourDb(sqlite)
  const check = () => assertPlaceAddressDependencies(db, 'place', 'place-release')
  try {
    await expect(check()).rejects.toThrow('completed supplementary Address dependency')
    sqlite.exec(
      "INSERT INTO snapshotDependencies VALUES ('place','supplementary','supplementaryAddress')",
    )
    await check()
    sqlite.exec(
      "UPDATE snapshotResourceReleases SET anchorReleaseId='different-release' WHERE snapshotId='supplementary'",
    )
    await expect(check()).rejects.toThrow('does not belong to this Place release')
  } finally {
    sqlite.close()
  }
})
