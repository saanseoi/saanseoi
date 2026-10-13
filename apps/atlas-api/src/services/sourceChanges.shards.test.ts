import { releaseFixtureSchemaSql } from '../../../../libs/core/src/testing/releaseFixtures'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { listSourceChanges } from './sourceChanges'
import { listSourceRecords } from './sourceRecords'
import { SourceChangesQuerySchema } from '../schema/sourceChanges'

function binding(db: Database) {
  return {
    prepare: (sql: string) => ({
      bind: (...values: any[]) => ({
        all: async () => ({ results: db.query(sql).all(...values) }),
      }),
    }),
  }
}

test('resolves inherited annual source shards and compares a year-boundary baseline completely', async () => {
  const meta = new Database(':memory:')
  const old = new Database(':memory:')
  const current = new Database(':memory:')
  try {
    meta.exec(`
      CREATE TABLE publishers(id, code);
      CREATE TABLE datasets(id, code, publisherId, regionCode, sourceVariant);
      ;
      ${releaseFixtureSchemaSql()};
      CREATE TABLE releaseShardAssignments(resourceReleaseId, dataShardId);
      CREATE TABLE dataShards(id, bindingName, shardType, status);
      INSERT INTO publishers VALUES('publisher','overture');
      INSERT INTO datasets VALUES('dataset','ds-hk-overture-division','publisher','hk',NULL);
      INSERT INTO sourceReleases (id, code, status, revokedAt) VALUES('dec','dec','archived',NULL),('jan','jan','archived',NULL),('feb','feb','current',NULL),('future','future','current',NULL);
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('dec', 'dataset', 'source-' || 'dec', '2025-12', 'archived');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2025-12' WHERE id = 'dec';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status, revokedAt) VALUES ('dec', 'dec', 'dec', 'division', 'archived', NULL);
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('jan', 'dataset', 'source-' || 'jan', '2026-01', 'archived');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2026-01' WHERE id = 'jan';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status, revokedAt) VALUES ('jan', 'jan', 'jan', 'division', 'archived', NULL);
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('feb', 'dataset', 'source-' || 'feb', '2026-02', 'current');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2026-02' WHERE id = 'feb';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status, revokedAt) VALUES ('feb', 'feb', 'feb', 'division', 'current', NULL);
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('future', 'dataset', 'source-' || 'future', '2027-01', 'current');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2027-01' WHERE id = 'future';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status, revokedAt) VALUES ('future', 'future', 'future', 'division', 'current', NULL);
INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('dec', 'dataset', 'source-' || 'other-type', '2025-12', 'archived');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2025-12' WHERE id = 'dec';
INSERT INTO resourceReleases (id, code, sourceReleaseId, resourceType, status, revokedAt) VALUES ('other-type', 'other-type', 'dec', 'divisionArea', 'archived', NULL);
      INSERT INTO dataShards VALUES('old','DB_SOURCE_HK_2025','source','active'),('new','DB_SOURCE_HK_2026','source','active'),('future','DB_SOURCE_HK_2027','source','active'),('other','DB_SOURCE_OTHER','source','active');
      INSERT INTO releaseShardAssignments VALUES('dec','old'),('jan','new'),('feb','new'),('future','future'),('other-type','other');
    `)
    for (const db of [old, current])
      db.exec(
        'CREATE TABLE overtureDivisions(sourceRecordId,versionHash,properties,sourceGeometry,validFromRelease,validToRelease)',
      )
    for (let i = 0; i < 4200; i++)
      old.run('INSERT INTO overtureDivisions VALUES(?,?,?,NULL,?,NULL)', [
        `retained-${String(i).padStart(3, '0')}`,
        'same',
        JSON.stringify({ name: `Retained ${i}` }),
        '2025-12',
      ])
    old.run('INSERT INTO overtureDivisions VALUES(?,?,?,NULL,?,?)', [
      'changed',
      'old',
      JSON.stringify({ name: 'Before' }),
      '2025-12',
      '2026-02',
    ])
    current.run('INSERT INTO overtureDivisions VALUES(?,?,?,NULL,?,NULL)', [
      'changed',
      'new',
      JSON.stringify({ name: 'After' }),
      '2026-02',
    ])
    current.run('INSERT INTO overtureDivisions VALUES(?,?,?,NULL,?,NULL)', [
      'added',
      'new',
      JSON.stringify({ name: 'Added' }),
      '2026-02',
    ])
    // An identical assertion retained in both annual shards is one record.
    current.run('INSERT INTO overtureDivisions VALUES(?,?,?,NULL,?,NULL)', [
      'retained-000',
      'same',
      JSON.stringify({ name: 'Retained 0' }),
      '2026-01',
    ])
    const args = {
      env: {
        DB_SOURCE_HK_2025: binding(old),
        DB_SOURCE_HK_2026: binding(current),
      } as never,
      metaDb: { $client: binding(meta) } as never,
      family: 'divisions' as const,
      includeGeometry: false,
    }
    const baseline = await listSourceRecords({
      ...args,
      sourceReleaseCode: 'jan',
      limit: 100,
    })
    expect(baseline?.records).toHaveLength(100)
    expect(baseline?.nextCursor).not.toBeNull()
    const query = SourceChangesQuerySchema.parse({
      fromRelease: 'jan',
      toRelease: 'feb',
      limit: 1,
    })
    const first = await listSourceChanges({ ...args, query })
    expect(first.records.map(row => [row.sourceRecordId, row.type])).toEqual([
      ['added', 'added'],
    ])
    expect(first.nextCursor).not.toBeNull()
    const second = await listSourceChanges({
      ...args,
      query: { ...query, cursor: first.nextCursor! },
    })
    expect(second.records.map(row => [row.sourceRecordId, row.type])).toEqual([
      ['changed', 'changed'],
    ])
    expect(second.nextCursor).toBeNull()
    const added = await listSourceChanges({
      ...args,
      query: { ...query, type: 'added' },
    })
    expect(added.records.map(row => row.sourceRecordId)).toEqual(['added'])
    expect(added.nextCursor).toBeNull()
    expect(
      await listSourceRecords({
        ...args,
        env: { DB_SOURCE_HK_2026: binding(current) } as never,
        sourceReleaseCode: 'jan',
      }),
    ).toBeNull()
  } finally {
    meta.close()
    old.close()
    current.close()
  }
})
