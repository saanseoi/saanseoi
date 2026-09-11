import { test, expect } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findIncompletePublishedReleases,
  listCompletedReleaseCodes,
} from './localDbCacheReads.ts'

test('completed geometry contributors can precede shared composition publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-geometry-'))
  const meta = new Database(':memory:')
  const currentPath = join(directory, 'DB_CURRENT.sqlite')
  const current = new Database(currentPath)
  try {
    current.exec(
      `CREATE TABLE divisionAreas(snapshotId TEXT);
       INSERT INTO divisionAreas VALUES ('["lineage","2026"]');
       CREATE TABLE divisionAreaPublicationState(snapshotId TEXT, scopeId TEXT, status TEXT, preparedAt TEXT, publicationToken TEXT);
       INSERT INTO divisionAreaPublicationState VALUES ('snapshot','["lineage","2026"]','publishing','complete','delivery');`,
    )
    meta.exec(`
      CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT, resourceType TEXT, status TEXT, revision INTEGER, cohortKey TEXT);
      CREATE TABLE snapshotSources(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(releaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO snapshots VALUES ('snapshot','lineage','divisionArea','draft',0,'2026');
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
        resourceType: 'divisionArea',
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
    expect(await check()).toEqual([])
    current.exec('UPDATE divisionAreaPublicationState SET preparedAt = NULL')
    expect(await check()).toEqual([
      'geometry: current snapshot has no complete delivery receipt',
    ])
  } finally {
    current.close()
    meta.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('initialisation skips published divisions only after their exact delivery is complete', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-divisions-'))
  const meta = new Database(':memory:')
  const currentPath = join(directory, 'DB_CURRENT.sqlite')
  const current = new Database(currentPath)
  try {
    meta.exec(`
      CREATE TABLE releases(id TEXT, code TEXT, datasetId TEXT, resourceType TEXT, status TEXT);
      CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT, resourceType TEXT, status TEXT, revision INTEGER, cohortKey TEXT);
      CREATE TABLE snapshotSources(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(releaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO releases VALUES ('release','landsd','dataset','division','published');
      INSERT INTO releases VALUES ('older','landsd-older','dataset','division','superseded');
      INSERT INTO snapshots VALUES ('snapshot','lineage','division','published',0,'2026');
      INSERT INTO snapshotSources VALUES ('snapshot','dataset','release',NULL,NULL,NULL);
      INSERT INTO snapshotLineages VALUES ('lineage','division','dataset');
      INSERT INTO releaseShardAssignments VALUES ('release'),('release'),('release');
      INSERT INTO snapshotShardAssignments VALUES ('snapshot');
    `)
    current.exec(`
      CREATE TABLE divisions(snapshotId TEXT);
      INSERT INTO divisions VALUES ('lineage');
      CREATE TABLE divisionPublicationState(snapshotId TEXT, scopeId TEXT, status TEXT, preparedAt TEXT, publicationToken TEXT);
    `)
    const completed = () =>
      listCompletedReleaseCodes(directory, { DB_CURRENT: currentPath }, meta)
    expect(await completed()).toEqual(['landsd-older'])
    current.exec(
      "INSERT INTO divisionPublicationState VALUES ('snapshot','lineage','publishing',NULL,'delivery')",
    )
    expect(await completed()).toEqual(['landsd-older'])
    current.exec("UPDATE divisionPublicationState SET preparedAt = 'complete'")
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    current.exec('DELETE FROM divisions')
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    current.exec("UPDATE divisionPublicationState SET status = 'current'")
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    for (const mutation of [
      "UPDATE divisionPublicationState SET publicationToken = ''",
      "UPDATE divisionPublicationState SET publicationToken = 'delivery', scopeId = 'wrong-lineage'",
      "UPDATE divisionPublicationState SET scopeId = 'lineage', snapshotId = 'another-snapshot'",
    ]) {
      current.exec(mutation)
      expect(await completed()).toEqual(['landsd-older'])
    }
  } finally {
    current.close()
    meta.close()
    await rm(directory, { recursive: true, force: true })
  }
})
