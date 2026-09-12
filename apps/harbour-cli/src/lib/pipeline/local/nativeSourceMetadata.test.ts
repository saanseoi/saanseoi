import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { buildMetaInsertStatements } from './nativeSourceSql.ts'

test('native metadata replays skip equal rows and preserve lifecycle and source selection changes', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,status TEXT,publishedAt TEXT,updatedAt TEXT);
    CREATE TABLE snapshotSources(snapshotId TEXT,resourceReleaseId TEXT,selectionMode TEXT,anchorReleaseId TEXT,PRIMARY KEY(snapshotId,resourceReleaseId));
    CREATE TABLE releaseShardAssignments(releaseId TEXT,dataShardId TEXT,PRIMARY KEY(releaseId,dataShardId));`)
  const changes = () =>
    db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count ?? 0
  const snapshot = {
    id: 'snapshot',
    status: 'draft',
    publishedAt: null as string | null,
    updatedAt: 'first',
  }
  const source = {
    snapshotId: 'snapshot',
    resourceReleaseId: 'release',
    selectionMode: 'contributed_geometry',
    anchorReleaseId: null as string | null,
  }
  const replay = () => {
    db.exec(
      [
        ...buildMetaInsertStatements(
          'snapshots',
          Object.keys(snapshot),
          [snapshot],
          ['id'],
        ),
        ...buildMetaInsertStatements(
          'snapshotSources',
          Object.keys(source),
          [source],
          ['snapshotId', 'resourceReleaseId'],
        ),
        ...buildMetaInsertStatements(
          'releaseShardAssignments',
          ['releaseId', 'dataShardId'],
          [{ releaseId: 'release', dataShardId: 'source' }],
          [],
        ),
      ].join('\n'),
    )
  }
  try {
    replay()
    expect(changes()).toBe(3)
    replay()
    expect(changes()).toBe(3)
    source.selectionMode = 'verified_identical_geometry'
    source.anchorReleaseId = 'primary'
    replay()
    expect(changes()).toBe(4)
    snapshot.status = 'published'
    snapshot.publishedAt = 'published'
    snapshot.updatedAt = 'published'
    replay()
    expect(changes()).toBe(5)
    expect(db.query('SELECT * FROM snapshots').get()).toEqual(snapshot)
    expect(db.query('SELECT * FROM snapshotSources').get()).toEqual(source)
    source.anchorReleaseId = null
    replay()
    expect(changes()).toBe(6)
    replay()
    expect(changes()).toBe(6)
    // A timestamp change is still meaningful in lifecycle metadata.
    snapshot.updatedAt = 'heartbeat'
    replay()
    expect(changes()).toBe(7)
  } finally {
    db.close()
  }
})
