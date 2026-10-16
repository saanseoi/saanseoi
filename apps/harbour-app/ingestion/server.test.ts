import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReviewDatabase, decode, SHARED_GROUP, type Shard } from './server'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(extra: Array<{ binding: string; sql: string }>) {
  const root = mkdtempSync(join(tmpdir(), 'ingestion-review-'))
  roots.push(root)
  const specs = [
    {
      binding: 'DB_META',
      sql: `CREATE TABLE resourceReleases(id TEXT, code TEXT); INSERT INTO resourceReleases VALUES ('release','release-code'),('other','other-code'); CREATE TABLE snapshotLineages(id TEXT,code TEXT); INSERT INTO snapshotLineages VALUES ('lineage','lineage-code'); CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT,cohortKey TEXT); INSERT INTO snapshots VALUES ('snap','lineage','2026'),('unrelated','other','2025');`,
    },
    ...extra,
  ]
  const shards: Shard[] = specs.map(s => {
    const path = join(root, `${s.binding}.sqlite`)
    const db = new Database(path)
    db.exec(s.sql)
    db.close()
    return { binding: s.binding, path }
  })
  return new ReviewDatabase(shards)
}
test('source samples include multiple physical shards; summaries cover all rows', () => {
  const sql = `CREATE TABLE records(id TEXT PRIMARY KEY, resourceReleaseId TEXT, value TEXT); INSERT INTO records VALUES ('a','release',NULL),('b','release','present'),('c','other',NULL);`
  const review = fixture([
    { binding: 'DB_SOURCE_HK_2025', sql },
    { binding: 'DB_SOURCE_HK_2026', sql },
  ])
  try {
    const data = review.inspect('SOURCE', 'release', 'records', false, 4)
    expect(data.samples).toHaveLength(4)
    expect(new Set(data.samples.map(r => r.shard)).size).toBe(2)
    expect(data.samples.every(s => s.record.resourceReleaseId === 'release')).toBe(true)
    const summary = review.inspect('SOURCE', 'release', 'records', true)
    expect(summary.columns.find(c => c.name === 'value')).toMatchObject({
      nulls: 2,
      rows: 4,
    })
    expect(() => review.shards[0].db.exec('DELETE FROM resourceReleases')).toThrow()
  } finally {
    review.close()
  }
})
test('history filters snapshots; current includes lineage, cohort and retained scopes only', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `CREATE TABLE records(id TEXT,snapshotId TEXT); INSERT INTO records VALUES ('a','snap'),('b','unrelated');`,
    },
    {
      binding: 'DB_CURRENT',
      sql: `CREATE TABLE records(id TEXT,scopeId TEXT); INSERT INTO records VALUES ('a','lineage'),('b','["lineage","2026"]'),('c','["lineage","snapshot","snap"]'),('d','other');`,
    },
  ])
  try {
    expect(review.inspect('HISTORY', 'lineage', 'records', true).shards[0].count).toBe(
      1,
    )
    expect(review.inspect('CURRENT', 'lineage', 'records', true).shards[0].count).toBe(
      3,
    )
    expect(() => review.inspect('CURRENT', 'invalid', 'records', true)).toThrow(
      'Unknown group',
    )
  } finally {
    review.close()
  }
})
test('supporting table joins follow composite foreign keys in either direction', () => {
  const review = fixture([
    {
      binding: 'DB_SOURCE_HK_2026',
      sql: `
    CREATE TABLE definitions(id TEXT, version TEXT, label TEXT, PRIMARY KEY(id,version));
    CREATE TABLE records(id TEXT PRIMARY KEY, resourceReleaseId TEXT, definitionId TEXT, version TEXT, FOREIGN KEY(definitionId,version) REFERENCES definitions(id,version));
    CREATE TABLE children(id TEXT PRIMARY KEY, parent TEXT REFERENCES records(id));
    CREATE TABLE shared(id TEXT);
    INSERT INTO definitions VALUES ('d','1','wanted'),('d','2','unrelated');
    INSERT INTO records VALUES ('a','release','d','1'),('b','other','d','2');
    INSERT INTO children VALUES ('child-a','a'),('child-b','b'); INSERT INTO shared VALUES ('global');
  `,
    },
  ])
  try {
    expect(
      review.inspect('SOURCE', 'release', 'definitions', true).shards[0].count,
    ).toBe(1)
    expect(
      review
        .inspect('SOURCE', 'release', 'children', false)
        .samples.map(s => s.record.id),
    ).toEqual(['child-a'])
    expect(
      review.inspect('SOURCE', SHARED_GROUP, 'shared', true).shards[0].relation,
    ).toContain('unscoped')
  } finally {
    review.close()
  }
})
test('decodes nested JSON without changing null, malformed JSON, scalar strings or blobs', () => {
  expect(
    decode({
      json: '{"a":null}',
      malformed: '{x',
      scalar: '123',
      missing: null,
      blob: new Uint8Array([1, 2]),
    }),
  ).toEqual({
    json: { a: null },
    malformed: '{x',
    scalar: '123',
    missing: null,
    blob: { type: 'blob', bytes: 2, hex: '0102' },
  })
})

test('statistics and immutable definitions follow lineage release membership', () => {
  const review = fixture([
    {
      binding: 'DB_CURRENT',
      sql: `
    CREATE TABLE statsRecords(id TEXT PRIMARY KEY, sourceReleaseId TEXT, definitionSetId TEXT);
    CREATE TABLE statsDefinitionSets(id TEXT PRIMARY KEY, fieldDefinitionHashes TEXT);
    INSERT INTO statsRecords VALUES ('a','source-a','defs-a'),('b','source-b','defs-b');
    INSERT INTO statsDefinitionSets VALUES ('defs-a','{}'),('defs-b','{}');
  `,
    },
  ])
  try {
    // Fixture setup uses a separate connection; the review connections remain read-only.
    const setup = new Database(review.shards[0].path)
    setup.exec(`ALTER TABLE resourceReleases ADD COLUMN sourceReleaseId TEXT;
      UPDATE resourceReleases SET sourceReleaseId = CASE id WHEN 'release' THEN 'source-a' ELSE 'source-b' END;
      CREATE TABLE snapshotResourceReleases(snapshotId TEXT, resourceReleaseId TEXT);
      INSERT INTO snapshotResourceReleases VALUES ('snap','release'),('unrelated','other');`)
    setup.close()
    expect(
      review.inspect('CURRENT', 'lineage', 'statsRecords', true).shards[0].count,
    ).toBe(1)
    expect(
      review
        .inspect('CURRENT', 'lineage', 'statsDefinitionSets', false)
        .samples.map(s => s.record.id),
    ).toEqual(['defs-a'])
  } finally {
    review.close()
  }
})

test('offers only populated related tables; shared tables have one separate group', () => {
  const review = fixture([
    {
      binding: 'DB_SOURCE_HK_2026',
      sql: `
    CREATE TABLE records(id TEXT PRIMARY KEY,resourceReleaseId TEXT,locale TEXT);
    CREATE TABLE unrelated(id TEXT,resourceReleaseId TEXT);
    CREATE TABLE empty(id TEXT,resourceReleaseId TEXT);
    CREATE TABLE definitions(id TEXT PRIMARY KEY);
    CREATE TABLE child(id TEXT, resourceReleaseId TEXT,definitionId TEXT REFERENCES definitions(id));
    CREATE TABLE shared(id TEXT);
    INSERT INTO records VALUES ('a','release','en'),('b','release','zh-hant');
    INSERT INTO unrelated VALUES ('u','other');
    INSERT INTO definitions VALUES ('d'); INSERT INTO child VALUES ('c','release','d');
    INSERT INTO shared VALUES ('global');
  `,
    },
  ])
  try {
    expect(review.tables('SOURCE', 'release').map(t => t.name)).toEqual([
      'child',
      'records',
      'definitions',
    ])
    expect(review.tables('SOURCE', SHARED_GROUP).map(t => t.name)).toEqual(['shared'])
    expect(review.inspect('SOURCE', 'release', 'unrelated', false).samples).toEqual([])
    const options = review.subsets('SOURCE', 'release', 'records')
    expect(options.map(s => s.label)).toEqual(['locale: en', 'locale: zh-hant'])
    expect(
      review.inspect(
        'SOURCE',
        'release',
        'records',
        true,
        8,
        JSON.stringify(['locale', 'en']),
      ).shards[0].count,
    ).toBe(1)
    expect(() =>
      review.inspect(
        'SOURCE',
        'release',
        'records',
        true,
        8,
        JSON.stringify(['arbitrary SQL', 'en']),
      ),
    ).toThrow('Unsupported subset')
  } finally {
    review.close()
  }
})

test('catalogue removes empty releases and lineage cohorts produce distinct subsets', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `
    CREATE TABLE records(id TEXT,snapshotId TEXT,operation TEXT);
    INSERT INTO records VALUES ('a','snap','upsert'),('b','snap','delete');
  `,
    },
    {
      binding: 'DB_SOURCE_HK_2026',
      sql: `CREATE TABLE records(resourceReleaseId TEXT);INSERT INTO records VALUES ('release');`,
    },
  ])
  try {
    expect(review.catalogue('SOURCE').groups).toEqual([
      { id: 'release', label: 'release-code' },
    ])
    expect(review.catalogue('HISTORY').groups).toEqual([
      { id: 'lineage', label: 'lineage-code' },
    ])
    expect(review.subsets('HISTORY', 'lineage', 'records').map(s => s.label)).toEqual([
      'operation: delete',
      'operation: upsert',
    ])
    const snapshot = review.inspect('HISTORY', 'lineage', 'records', false)
    expect(snapshot.stable).toBe(true)
    const before = snapshot.revision
    const writer = new Database(review.shards[1].path)
    writer.exec("INSERT INTO records VALUES ('c','snap','delete')")
    writer.close()
    expect(review.revision('HISTORY')).not.toBe(before)
  } finally {
    review.close()
  }
})

test('empty WAL housekeeping does not invalidate a data review revision', () => {
  const review = fixture([])
  try {
    const before = review.revision('META')
    const path = `${review.shards[0].path}-wal`
    writeFileSync(path, '')
    utimesSync(path, new Date('2020-01-01'), new Date('2020-01-01'))
    expect(review.revision('META')).toBe(before)
  } finally {
    review.close()
  }
})

test('content sign-offs ignore unrelated writes and samples but track scoped rows and schema', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `
    CREATE TABLE records(id TEXT, snapshotId TEXT, operation TEXT, value TEXT);
    CREATE TABLE unrelated(id TEXT);
    INSERT INTO records VALUES ('a','snap','upsert','one'),('b','snap','delete','two'),('c','unrelated','upsert','three');
  `,
    },
  ])
  const writer = new Database(review.shards[1].path)
  const meta = new Database(review.shards[0].path)
  const subset = JSON.stringify(['operation', 'upsert'])
  const fingerprint = (summary = true, limit = 8) =>
    review.inspect('HISTORY', 'lineage', 'records', summary, limit, subset)
      .contentRevision
  try {
    const original = fingerprint()
    expect(fingerprint(false, 1)).toBe(original)
    expect(fingerprint(false, 20)).toBe(original)
    writer.exec(
      "INSERT INTO unrelated VALUES ('new'); UPDATE records SET value='changed' WHERE id IN ('b','c')",
    )
    meta.exec("UPDATE resourceReleases SET code='renamed'")
    expect(fingerprint()).toBe(original)
    writer.exec("UPDATE records SET value='changed' WHERE id='a'")
    expect(fingerprint()).not.toBe(original)
    writer.exec("UPDATE records SET value='one' WHERE id='a'")
    expect(fingerprint()).toBe(original)
    writer.exec("INSERT INTO records SELECT * FROM records WHERE id='a'")
    expect(fingerprint()).not.toBe(original)
    writer.exec('DELETE FROM records WHERE rowid=(SELECT max(rowid) FROM records)')
    expect(fingerprint()).toBe(original)
    writer.exec('ALTER TABLE records ADD COLUMN extra TEXT')
    expect(fingerprint()).not.toBe(original)
  } finally {
    writer.close()
    meta.close()
    review.close()
  }
})
