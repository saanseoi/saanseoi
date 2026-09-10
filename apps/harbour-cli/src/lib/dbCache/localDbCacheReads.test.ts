import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findIncompletePublishedReleases } from './localDbCacheReads.ts'

test('completed geometry contributors can precede shared composition publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-geometry-'))
  const meta = new Database(':memory:')
  const currentPath = join(directory, 'DB_CURRENT.sqlite')
  const current = new Database(currentPath)
  try {
    current.exec(
      "CREATE TABLE divisionAreas(snapshotId TEXT); INSERT INTO divisionAreas VALUES ('snapshot');",
    )
    meta.exec(`
      CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT, resourceType TEXT, status TEXT, revision INTEGER);
      CREATE TABLE snapshotSources(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(releaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO snapshots VALUES ('snapshot','lineage','divisionArea','draft',0);
      INSERT INTO snapshotSources VALUES ('snapshot','contributor','release','contributed_geometry','snapshot-assembly-division-geometry-v1','release');
      INSERT INTO snapshotLineages VALUES ('lineage','divisionArea','primary');
      INSERT INTO releaseShardAssignments VALUES ('release'),('release'),('release');
      INSERT INTO snapshotShardAssignments VALUES ('snapshot');
    `)
    const releases = [
      {
        id: 'release',
        code: 'geometry',
        datasetId: 'contributor',
        type: 'divisionArea',
        status: 'published',
      },
    ]
    const check = () =>
      findIncompletePublishedReleases(
        directory,
        { DB_CURRENT: currentPath },
        meta,
        releases,
      )
    expect(await check()).toEqual([])
    meta.exec("UPDATE snapshotSources SET selectionMode='verified_identical_geometry'")
    expect(await check()).toEqual([])
    meta.exec("UPDATE snapshotSources SET selectedByRule='unrecognised'")
    expect(await check()).toEqual([
      'geometry: missing published snapshot lineage/source membership',
    ])
    meta.exec(
      "UPDATE snapshotSources SET selectedByRule='snapshot-assembly-division-geometry-v1'",
    )
    current.exec('DELETE FROM divisionAreas')
    expect(await check()).toEqual(['geometry: current snapshot is not materialised'])
  } finally {
    current.close()
    meta.close()
    await rm(directory, { recursive: true, force: true })
  }
})
