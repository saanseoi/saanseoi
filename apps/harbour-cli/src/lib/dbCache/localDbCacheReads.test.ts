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
  const meta = completionMeta()
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
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(resourceReleaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO snapshots VALUES ('snapshot','lineage','divisionArea','draft',0,'2026');
      INSERT INTO snapshotResourceReleases VALUES ('snapshot','contributor','release','contributed_geometry','assembly:division-geometry:source-release:v1','release');
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
        status: 'current',
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
    meta.exec(
      "UPDATE snapshotResourceReleases SET selectionMode='verified_identical_geometry', selectedByRule='provenance:censtatd-geometry:verified-identical-geometry:v1'",
    )
    expect(await check()).toEqual([])
    meta.exec("UPDATE snapshotResourceReleases SET selectedByRule='unrecognised'")
    expect(await check()).toEqual([
      'geometry: missing published snapshot lineage/source membership',
    ])
    meta.exec(
      "UPDATE snapshotResourceReleases SET selectedByRule='provenance:censtatd-geometry:verified-identical-geometry:v1'",
    )
    current.exec('DELETE FROM divisionAreas')
    expect(await check()).toEqual([])
    current.exec('UPDATE divisionAreaPublicationState SET preparedAt = NULL')
    expect(await check()).toEqual([
      'geometry: current snapshot has no complete delivery receipt',
    ])

    // A new revision inherits the contributor and replaces the one current
    // receipt for this lineage/cohort; the old release remains complete.
    meta.exec(`
      INSERT INTO snapshots VALUES ('replacement','lineage','divisionArea','published',1,'2026');
      INSERT INTO snapshotResourceReleases VALUES ('replacement','contributor','release','carried_forward_companion','provenance:censtatd-geometry:carried-forward-contributors:v1',NULL);
      INSERT INTO snapshotShardAssignments VALUES ('replacement');
    `)
    current.exec(
      "UPDATE divisionAreaPublicationState SET snapshotId='replacement', preparedAt='complete', status='current'",
    )
    expect(await check()).toEqual([])
    current.exec("UPDATE divisionAreaPublicationState SET scopeId='wrong-scope'")
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
  const meta = completionMeta()
  const currentPath = join(directory, 'DB_CURRENT.sqlite')
  const current = new Database(currentPath)
  try {
    meta.exec(`
      CREATE TABLE resourceReleases(id TEXT, code TEXT, datasetId TEXT, resourceType TEXT, status TEXT);
      CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT, resourceType TEXT, status TEXT, revision INTEGER, cohortKey TEXT);
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(resourceReleaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO resourceReleases VALUES ('release','landsd','dataset','division','current');
      INSERT INTO resourceReleases VALUES ('older','landsd-older','dataset','division','archived');
      INSERT INTO snapshots VALUES ('snapshot','lineage','division','published',0,'2026');
      INSERT INTO snapshotResourceReleases VALUES ('snapshot','dataset','release',NULL,NULL,NULL);
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
    // Cleanup can remove a completed, unselected native projection.
    current.exec('DELETE FROM divisionPublicationState')
    meta.exec(`
      UPDATE snapshotResourceReleases SET selectionMode='exact_ref', selectedByRule='assembly:division:source-release:v1';
      INSERT INTO processingRuns VALUES ('release','sql:division-data','completed','1','2');
      INSERT INTO processingRuns VALUES ('release','publishDataset','completed','2','3');
    `)
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    for (const status of ['draft', 'current']) {
      meta.exec(`INSERT INTO apiReleaseSets VALUES ('api','api');
        INSERT INTO apiVersionReleaseSets (id, apiReleaseSetId, status) VALUES ('api-association','api','${status}');
        INSERT INTO apiReleaseSetSnapshots VALUES ('api','snapshot');`)
      expect(await completed()).toEqual(
        status === 'current' ? ['landsd-older'] : ['landsd', 'landsd-older'],
      )
      if (status === 'current') {
        // Address companions use immutable history after a later Division
        // cohort replaces CURRENT. The native delivery must still be complete.
        meta.exec("UPDATE apiVersionReleaseSets SET apiVersionId='address-api'")
        expect(await completed()).toEqual(['landsd', 'landsd-older'])
        meta.exec(
          "UPDATE processingRuns SET status='error' WHERE phase='sql:division-data'",
        )
        expect(await completed()).toEqual(['landsd-older'])
        meta.exec(
          "UPDATE processingRuns SET status='completed' WHERE phase='sql:division-data'",
        )
      }
      meta.exec(
        'DELETE FROM apiReleaseSets; DELETE FROM apiVersionReleaseSets; DELETE FROM apiReleaseSetSnapshots',
      )
    }
    meta.exec(
      "INSERT INTO apiReleaseSets VALUES ('api','api'); INSERT INTO apiVersionReleaseSets (id, apiReleaseSetId, status) VALUES ('api-association','api','archived'); INSERT INTO apiReleaseSetSnapshots VALUES ('api','snapshot')",
    )
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    for (const status of ['running', 'error']) {
      meta.exec(
        `UPDATE processingRuns SET status='${status}' WHERE phase='sql:division-data'`,
      )
      expect(await completed()).toEqual(['landsd-older'])
    }
    meta.exec(
      "UPDATE processingRuns SET status='completed'; UPDATE processingRuns SET finishedAt='1' WHERE phase='publishDataset'",
    )
    expect(await completed()).toEqual(['landsd-older'])
    meta.exec("UPDATE processingRuns SET finishedAt='3' WHERE phase='publishDataset'")
    meta.exec(
      "INSERT INTO processingRuns VALUES ('release','sql:division-data-rebuild-new','error','4',NULL)",
    )
    expect(await completed()).toEqual(['landsd-older'])
    meta.exec(
      "UPDATE processingRuns SET status='completed', finishedAt='5' WHERE phase='sql:division-data-rebuild-new'; UPDATE processingRuns SET finishedAt='6' WHERE phase='publishDataset'",
    )
    expect(await completed()).toEqual(['landsd', 'landsd-older'])
    current.exec(
      "INSERT INTO divisionPublicationState VALUES ('snapshot','wrong-scope','publishing',NULL,'delivery')",
    )
    expect(await completed()).toEqual(['landsd-older'])
  } finally {
    current.close()
    meta.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('curated division delivery proves completion of its retained native baseline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'completed-curated-divisions-'))
  const meta = completionMeta()
  const currentPath = join(directory, 'DB_CURRENT.sqlite')
  const current = new Database(currentPath)
  try {
    meta.exec(`
      CREATE TABLE resourceReleases(id TEXT, code TEXT, datasetId TEXT, resourceType TEXT, status TEXT);
      CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT, resourceType TEXT, status TEXT, revision INTEGER, cohortKey TEXT);
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT, datasetId TEXT, resourceReleaseId TEXT, selectionMode TEXT, selectedByRule TEXT, anchorReleaseId TEXT);
      CREATE TABLE snapshotLineages(id TEXT, resourceType TEXT, primaryDatasetId TEXT);
      CREATE TABLE releaseShardAssignments(resourceReleaseId TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT);
      INSERT INTO resourceReleases VALUES ('release','native','dataset','division','current');
      INSERT INTO snapshots VALUES ('native','native-lineage','division','published',1,'2026-08');
      INSERT INTO snapshots VALUES ('curated','curated-lineage','division','published',0,'2026-09');
      INSERT INTO snapshotResourceReleases VALUES ('native','dataset','release','exact_ref','assembly:division:source-release:v1','release');
      INSERT INTO snapshotResourceReleases VALUES ('curated','dataset','release','exact_ref','saanseoi-curated-division-assembly-v1','curated-release');
      INSERT INTO snapshotLineages VALUES ('native-lineage','division','dataset'),('curated-lineage','division','curated-dataset');
      INSERT INTO releaseShardAssignments VALUES ('release'),('release'),('release');
      INSERT INTO snapshotShardAssignments VALUES ('native'),('curated');
    `)
    current.exec(`
      CREATE TABLE divisionPublicationState(snapshotId TEXT, scopeId TEXT, status TEXT, preparedAt TEXT, publicationToken TEXT);
      INSERT INTO divisionPublicationState VALUES ('curated','curated-lineage','current','complete','delivery');
    `)
    const completed = () =>
      listCompletedReleaseCodes(directory, { DB_CURRENT: currentPath }, meta)
    expect(await completed()).toEqual(['native'])
    current.exec('UPDATE divisionPublicationState SET preparedAt = NULL')
    expect(await completed()).toEqual([])
    current.exec("UPDATE divisionPublicationState SET preparedAt = 'complete'")
    meta.exec(
      "UPDATE snapshotResourceReleases SET selectedByRule = 'unrecognised' WHERE snapshotId = 'curated'",
    )
    expect(await completed()).toEqual([])
    meta.exec(`
      UPDATE snapshotResourceReleases SET selectedByRule = 'saanseoi-curated-division-assembly-v1' WHERE snapshotId = 'curated';
      INSERT INTO resourceReleases VALUES ('curated-release','curated','curated-dataset','division','current');
      INSERT INTO snapshotResourceReleases VALUES ('curated','curated-dataset','curated-release','exact_ref','saanseoi-curated-division-assembly-v1',NULL);
    `)
    // Derived releases retain an archive and snapshot history, without a
    // separately ingested source-row shard.
    expect(await completed()).toEqual(['curated', 'native'])
    meta.exec("DELETE FROM snapshotShardAssignments WHERE snapshotId = 'curated'")
    expect(await completed()).toEqual([])
  } finally {
    current.close()
    meta.close()
    await rm(directory, { recursive: true, force: true })
  }
})

function completionMeta() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE apiReleaseSets(id TEXT, code TEXT);
    CREATE TABLE apiVersionReleaseSets(id TEXT, apiReleaseSetId TEXT, status TEXT, apiVersionId TEXT DEFAULT 'division-api');
    CREATE TABLE apiVersions(id TEXT, familyType TEXT);
    INSERT INTO apiVersions VALUES ('division-api','divisions'),('address-api','addresses');
    CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT, snapshotId TEXT);
    CREATE TABLE processingRuns(resourceReleaseId TEXT, phase TEXT, status TEXT, startedAt TEXT, finishedAt TEXT);
  `)
  return db
}
