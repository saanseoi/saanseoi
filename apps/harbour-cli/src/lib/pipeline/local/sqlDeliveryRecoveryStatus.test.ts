import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { sqlDeliveryRecoveryStatusSql } from './sqlDeliveryRecoveryStatus.ts'

test('recovery reopens only failed resources without published snapshots', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE releases (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE snapshots (id TEXT, status TEXT);
      CREATE TABLE snapshotSources (snapshotId TEXT, resourceReleaseId TEXT);
      INSERT INTO releases VALUES ('failed','failed'), ('published','published'), ('superseded','superseded'), ('poisoned','failed'), ('staged','staged'), ('quoted''id','failed');
      INSERT INTO snapshots VALUES ('snapshot','published');
      INSERT INTO snapshotSources VALUES ('snapshot','poisoned');`)
    for (const id of [
      'failed',
      'published',
      'superseded',
      'poisoned',
      'staged',
      "quoted'id",
      'missing',
    ])
      db.exec(sqlDeliveryRecoveryStatusSql(id))
    expect(db.query('SELECT * FROM releases ORDER BY id').all()).toEqual([
      { id: 'failed', status: 'processing' },
      { id: 'poisoned', status: 'failed' },
      { id: 'published', status: 'published' },
      { id: "quoted'id", status: 'processing' },
      { id: 'staged', status: 'staged' },
      { id: 'superseded', status: 'superseded' },
    ])
  } finally {
    db.close()
  }
})
