import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { normaliseReleaseStatuses } from './normaliseReleaseStatuses'

test('normalises only release states and journal transitions, preserving publication evidence', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE sourceReleases(id TEXT, status TEXT, updatedAt TEXT);
      CREATE TABLE resourceReleases(id TEXT, status TEXT, supersededByResourceReleaseId TEXT);
      CREATE TABLE releaseSetLifecycleJournal(resourceReleaseId TEXT, action TEXT, statusFrom TEXT, statusTo TEXT);
      CREATE TABLE snapshots(status TEXT);
      INSERT INTO sourceReleases VALUES ('source','published','original'),('old','superseded','original'),('revoked','revoked','original');
      INSERT INTO resourceReleases VALUES ('release','published',NULL),('old','superseded','release'),('failed','failed',NULL);
      INSERT INTO releaseSetLifecycleJournal VALUES ('release','published',NULL,'published'),('old','replaced','published','superseded'),(NULL,'published',NULL,'published');
      INSERT INTO snapshots VALUES ('published');`)
    expect(normaliseReleaseStatuses(db)).toEqual({
      sourceReleases: 2,
      resourceReleases: 2,
      lifecycleJournal: 2,
    })
    expect(
      db.query("SELECT status FROM sourceReleases WHERE id='source'").get(),
    ).toEqual({ status: 'published' })
    normaliseReleaseStatuses(db, true)
    expect(db.query('SELECT * FROM sourceReleases').all()).toEqual([
      { id: 'source', status: 'current', updatedAt: 'original' },
      { id: 'old', status: 'archived', updatedAt: 'original' },
      { id: 'revoked', status: 'revoked', updatedAt: 'original' },
    ])
    expect(db.query('SELECT * FROM resourceReleases').all()).toEqual([
      { id: 'release', status: 'current', supersededByResourceReleaseId: null },
      { id: 'old', status: 'archived', supersededByResourceReleaseId: 'release' },
      { id: 'failed', status: 'failed', supersededByResourceReleaseId: null },
    ])
    expect(db.query('SELECT * FROM releaseSetLifecycleJournal').all()).toEqual([
      {
        resourceReleaseId: 'release',
        action: 'published',
        statusFrom: null,
        statusTo: 'current',
      },
      {
        resourceReleaseId: 'old',
        action: 'replaced',
        statusFrom: 'current',
        statusTo: 'archived',
      },
      {
        resourceReleaseId: null,
        action: 'published',
        statusFrom: null,
        statusTo: 'published',
      },
    ])
    expect(db.query('SELECT status FROM snapshots').get()).toEqual({
      status: 'published',
    })
    expect(normaliseReleaseStatuses(db, true)).toEqual({
      sourceReleases: 0,
      resourceReleases: 0,
      lifecycleJournal: 0,
    })
  } finally {
    db.close()
  }
})
