import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { assertPlaceAddressDependencies } from './control'

test('Place publication requires an exact supplementary dependency and explicit completed review', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE snapshotAssemblies(snapshotId TEXT PRIMARY KEY, reviewRequired INTEGER);
    CREATE TABLE snapshotDependencies(snapshotId TEXT, dependencySnapshotId TEXT, role TEXT, PRIMARY KEY(snapshotId,role));
    CREATE TABLE snapshots(id TEXT PRIMARY KEY, snapshotLineageId TEXT, resourceType TEXT, status TEXT);
    CREATE TABLE snapshotLineages(id TEXT PRIMARY KEY, variant TEXT);
    CREATE TABLE snapshotResourceReleases(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, role TEXT,
      selectedByRule TEXT, selectionMode TEXT, anchorReleaseId TEXT, sourceCohortKey TEXT, createdAt TEXT);
    INSERT INTO snapshotAssemblies VALUES ('place',NULL);
    INSERT INTO snapshots VALUES ('supplementary','lineage','address','published');
    INSERT INTO snapshotLineages VALUES ('lineage','overture-places');
    INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role,anchorReleaseId)
      VALUES ('supplementary','address-release','primary','place-release');
    INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role,selectedByRule)
      VALUES ('place','address-release','lookup','api-composition:places/overture:place/default->address/overture-places');
  `)
  const db = createLocalHarbourDb(sqlite)
  const check = () => assertPlaceAddressDependencies(db, 'place', 'place-release')
  try {
    await expect(check()).rejects.toThrow('completed supplementary Address analysis')
    sqlite.exec(
      "INSERT INTO snapshotDependencies VALUES ('place','supplementary','supplementaryAddress')",
    )
    await expect(check()).rejects.toThrow('completed supplementary Address analysis')
    sqlite.exec('UPDATE snapshotAssemblies SET reviewRequired=2')
    await expect(check()).rejects.toThrow('outstanding identity reviews')
    sqlite.exec('UPDATE snapshotAssemblies SET reviewRequired=0')
    await check()
    sqlite.exec(
      "UPDATE snapshotResourceReleases SET anchorReleaseId='different-release' WHERE snapshotId='supplementary'",
    )
    await expect(check()).rejects.toThrow('does not belong to this Place release')
  } finally {
    sqlite.close()
  }
})
