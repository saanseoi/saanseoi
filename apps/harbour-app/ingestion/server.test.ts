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
      sql: `CREATE TABLE datasets(id TEXT, code TEXT); INSERT INTO datasets VALUES ('dataset','dataset-code'),('other-dataset','other-dataset-code'); CREATE TABLE sourceReleases(id TEXT, datasetId TEXT); INSERT INTO sourceReleases VALUES ('source-a','dataset'),('source-b','other-dataset'); CREATE TABLE resourceReleases(id TEXT, code TEXT, sourceReleaseId TEXT); INSERT INTO resourceReleases VALUES ('release','release-code','source-a'),('other','other-code','source-b'); CREATE TABLE snapshotLineages(id TEXT,code TEXT); INSERT INTO snapshotLineages VALUES ('lineage','lineage-code'); CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT,cohortKey TEXT); INSERT INTO snapshots VALUES ('snap','lineage','2026'),('unrelated','other','2025');`,
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
    const data = review.inspect('SOURCE', 'dataset', 'records', false, 4)
    expect(data.samples).toHaveLength(4)
    expect(new Set(data.samples.map(r => r.shard)).size).toBe(2)
    expect(data.samples.every(s => s.record.resourceReleaseId === 'release')).toBe(true)
    const summary = review.inspect('SOURCE', 'dataset', 'records', true)
    expect(summary.columns.find(c => c.name === 'value')).toMatchObject({
      nulls: 2,
      rows: 4,
    })
    expect(() => review.shards[0].db.exec('DELETE FROM resourceReleases')).toThrow()
  } finally {
    review.close()
  }
})
test('SOURCE groups all dataset releases and resource types with scoped summaries and fingerprints', () => {
  const review = fixture([
    {
      binding: 'DB_SOURCE_HK_2025',
      sql: `CREATE TABLE records(id TEXT, resourceReleaseId TEXT, locale TEXT, value TEXT);
        INSERT INTO records VALUES ('a','release','en',NULL),('excluded','other','fr',NULL);`,
    },
    {
      binding: 'DB_SOURCE_HK_2026',
      sql: `CREATE TABLE records(id TEXT, resourceReleaseId TEXT, locale TEXT, value TEXT);
        INSERT INTO records VALUES ('b','later','zh-hant','present'),('c','area','en',NULL);`,
    },
  ])
  const meta = new Database(review.shards[0].path)
  try {
    meta.exec(`INSERT INTO sourceReleases VALUES ('source-later','dataset');
      INSERT INTO resourceReleases VALUES ('later','later-code','source-later'),('area','area-code','source-later');`)
    expect(review.catalogue('SOURCE').groups).toEqual([
      { id: 'dataset', label: 'dataset-code' },
      { id: 'other-dataset', label: 'other-dataset-code' },
    ])
    expect(review.tables('SOURCE', 'dataset')[0]?.shards).toHaveLength(2)
    const samples = review.inspect('SOURCE', 'dataset', 'records', false, 8)
    expect(samples.samples.map(s => s.record.id).sort()).toEqual(['a', 'b', 'c'])
    expect(review.subsets('SOURCE', 'dataset', 'records').map(s => s.label)).toEqual([
      'locale: en',
      'locale: zh-hant',
    ])
    const summary = review.inspect('SOURCE', 'dataset', 'records', true)
    expect(summary.columns.find(c => c.name === 'value')).toMatchObject({
      nulls: 2,
      rows: 3,
    })
    const subset = review.inspect(
      'SOURCE',
      'dataset',
      'records',
      true,
      8,
      JSON.stringify(['locale', 'en']),
    )
    expect(subset.columns.find(c => c.name === 'value')).toMatchObject({
      nulls: 2,
      rows: 2,
    })
    expect(() => review.tables('SOURCE', 'release')).toThrow('Unknown group')
    meta.exec(
      "UPDATE sourceReleases SET datasetId='other-dataset' WHERE id='source-later'",
    )
    const changed = review.inspect('SOURCE', 'dataset', 'records', true)
    expect(changed.contentRevision).not.toBe(summary.contentRevision)
    expect(changed.columns.find(c => c.name === 'value')).toMatchObject({
      nulls: 1,
      rows: 1,
    })
  } finally {
    meta.close()
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
      review.inspect('SOURCE', 'dataset', 'definitions', true).shards[0].count,
    ).toBe(1)
    expect(
      review
        .inspect('SOURCE', 'dataset', 'children', false)
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
    setup.exec(`UPDATE resourceReleases SET sourceReleaseId = CASE id WHEN 'release' THEN 'source-a' ELSE 'source-b' END;
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
    expect(review.tables('SOURCE', 'dataset').map(t => t.name)).toEqual([
      'child',
      'records',
      'definitions',
    ])
    expect(review.tables('SOURCE', SHARED_GROUP).map(t => t.name)).toEqual(['shared'])
    expect(review.inspect('SOURCE', 'dataset', 'unrelated', false).samples).toEqual([])
    const options = review.subsets('SOURCE', 'dataset', 'records')
    expect(options.map(s => s.label)).toEqual(['locale: en', 'locale: zh-hant'])
    expect(
      review.inspect(
        'SOURCE',
        'dataset',
        'records',
        true,
        8,
        JSON.stringify(['locale', 'en']),
      ).shards[0].count,
    ).toBe(1)
    expect(() =>
      review.inspect(
        'SOURCE',
        'dataset',
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

test('catalogue removes empty datasets and history operations share one view', () => {
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
      { id: 'dataset', label: 'dataset-code' },
    ])
    expect(review.catalogue('HISTORY').groups).toEqual([
      { id: 'lineage', label: 'lineage-code' },
    ])
    expect(review.subsets('HISTORY', 'lineage', 'records')).toEqual([])
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
    CREATE TABLE records(id TEXT, snapshotId TEXT, variant TEXT, value TEXT);
    CREATE TABLE unrelated(id TEXT);
    INSERT INTO records VALUES ('a','snap','primary','one'),('b','snap','secondary','two'),('c','unrelated','primary','three');
  `,
    },
  ])
  const writer = new Database(review.shards[1].path)
  const meta = new Database(review.shards[0].path)
  const subset = JSON.stringify(['variant', 'primary'])
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

test.each(['apiCompositionMembers', 'apiReleaseSetSnapshots'])(
  '%s is reviewed as one table across variants and resource types',
  table => {
    const root = mkdtempSync(join(tmpdir(), 'ingestion-review-members-'))
    roots.push(root)
    const path = join(root, 'meta.sqlite')
    const db = new Database(path)
    db.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY, variant TEXT, resourceType TEXT);
    INSERT INTO ${table} VALUES ('a','hma','division'),('b','buildings','divisionArea');`)
    db.close()
    const review = new ReviewDatabase([{ binding: 'DB_META', path }])
    try {
      expect(review.subsets('META', table, table)).toEqual([])
      expect(review.inspect('META', table, table, false, 8).samples).toHaveLength(2)
      for (const dimension of ['variant', 'resourceType']) {
        expect(() =>
          review.inspect(
            'META',
            table,
            table,
            true,
            8,
            JSON.stringify([dimension, 'hma']),
          ),
        ).toThrow('Unsupported subset')
      }
    } finally {
      review.close()
    }
  },
)

test('samples retain physical column order and decode stored values', () => {
  const root = mkdtempSync(join(tmpdir(), 'ingestion-review-order-'))
  roots.push(root)
  const path = join(root, 'meta.sqlite')
  const db = new Database(path)
  db.exec(`CREATE TABLE datasets(extra TEXT, code TEXT, theme TEXT, id TEXT, resourceTypes TEXT);
    ALTER TABLE datasets ADD COLUMN kind TEXT;
    INSERT INTO datasets VALUES ('unexpected','dataset','stats','id','["divisionStatistic"]','district');`)
  db.close()
  const review = new ReviewDatabase([{ binding: 'DB_META', path }])
  try {
    const data = review.inspect('META', 'datasets', 'datasets', false, 4)
    expect(Object.keys(data.samples[0]!.record)).toEqual([
      'extra',
      'code',
      'theme',
      'id',
      'resourceTypes',
      'kind',
    ])
    expect(data.samples[0]!.record.resourceTypes).toEqual(['divisionStatistic'])
    expect(data.samples[0]!.record.extra).toBe('unexpected')
    expect(data.schemas[0]!.columns.map(column => column.name)).toEqual([
      'extra',
      'code',
      'theme',
      'id',
      'resourceTypes',
      'kind',
    ])
  } finally {
    review.close()
  }
})

test('source review keeps open and closed records together without isCurrent subsets', () => {
  const review = fixture([
    {
      binding: 'DB_SOURCE_HK_2026',
      sql: `CREATE TABLE records(id TEXT, resourceReleaseId TEXT, isCurrent INTEGER);
      INSERT INTO records VALUES ('open','release',1),('closed','release',0);`,
    },
  ])
  try {
    expect(review.subsets('SOURCE', 'dataset', 'records')).toEqual([])
    expect(
      review
        .inspect('SOURCE', 'dataset', 'records', false)
        .samples.map(s => s.record.isCurrent)
        .sort(),
    ).toEqual([0, 1])
    expect(() =>
      review.inspect(
        'SOURCE',
        'dataset',
        'records',
        false,
        8,
        JSON.stringify(['isCurrent', 0]),
      ),
    ).toThrow('Unsupported subset')
  } finally {
    review.close()
  }
})

test('HISTORY i18n tables review locales and operations together', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `CREATE TABLE divisionsI18n(id TEXT, snapshotId TEXT, locale TEXT, operation TEXT);
      INSERT INTO divisionsI18n VALUES ('a','snap','en','upsert'),('a','snap','zh-hant','upsert'),('b','snap','en','delete');`,
    },
  ])
  try {
    const subsets = review.subsets('HISTORY', 'lineage', 'divisionsI18n')
    expect(subsets.some(s => s.dimension === 'locale')).toBe(false)
    expect(subsets.some(s => s.dimension === 'operation')).toBe(false)
    const data = review.inspect('HISTORY', 'lineage', 'divisionsI18n', false, 8)
    expect(data.samples.map(s => s.record.locale).sort()).toEqual([
      'en',
      'en',
      'zh-hant',
    ])
    expect(data.samples.map(s => s.record.operation).sort()).toEqual([
      'delete',
      'upsert',
      'upsert',
    ])
    expect(() =>
      review.inspect(
        'HISTORY',
        'lineage',
        'divisionsI18n',
        false,
        8,
        JSON.stringify(['operation', 'upsert']),
      ),
    ).toThrow('Unsupported subset')
    expect(() =>
      review.inspect(
        'HISTORY',
        'lineage',
        'divisionsI18n',
        false,
        8,
        JSON.stringify(['locale', 'en']),
      ),
    ).toThrow('Unsupported subset')
  } finally {
    review.close()
  }
})

test('HISTORY reviews all lineage cohorts together without cohort-key subsets', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `CREATE TABLE records(id TEXT, snapshotId TEXT, operation TEXT);
      INSERT INTO records VALUES ('a','snap','upsert'),('b','later','upsert'),('excluded','unrelated','upsert');`,
    },
  ])
  const meta = new Database(review.shards[0].path)
  try {
    meta.exec("INSERT INTO snapshots VALUES ('later','lineage','2027')")
    expect(
      review
        .subsets('HISTORY', 'lineage', 'records')
        .some(s => s.dimension === 'cohortKey'),
    ).toBe(false)
    expect(
      review
        .inspect('HISTORY', 'lineage', 'records', false, 8)
        .samples.map(s => s.record.id)
        .sort(),
    ).toEqual(['a', 'b'])
    expect(() =>
      review.inspect(
        'HISTORY',
        'lineage',
        'records',
        false,
        8,
        JSON.stringify(['cohortKey', '2026']),
      ),
    ).toThrow('Unsupported subset')
  } finally {
    meta.close()
    review.close()
  }
})

test('CURRENT hides history projections but keeps distinct tables and FK grouping through hidden projections', () => {
  const review = fixture([
    {
      binding: 'DB_CURRENT',
      sql: `CREATE TABLE places(id TEXT PRIMARY KEY,scopeId TEXT);
      CREATE TABLE placesCells(id TEXT,scopeId TEXT,h3Cell TEXT);
      CREATE TABLE streets(id TEXT PRIMARY KEY,scopeId TEXT);
      CREATE TABLE streetsAddress(streetId TEXT REFERENCES streets(id),addressId TEXT);
      CREATE TABLE statsDefinitionSets(id TEXT);
      CREATE TABLE operationState(id TEXT);
      INSERT INTO places VALUES ('place','lineage'),('other-place','other');
      INSERT INTO placesCells VALUES ('place','lineage','cell');
      INSERT INTO streets VALUES ('street','lineage');
      INSERT INTO streetsAddress VALUES ('street','address');
      INSERT INTO statsDefinitionSets VALUES ('defs');
      INSERT INTO operationState VALUES ('ready');`,
    },
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `CREATE TABLE places(id TEXT,snapshotId TEXT); INSERT INTO places VALUES ('place','snap');`,
    },
  ])
  const meta = new Database(review.shards[0].path)
  try {
    meta.exec("INSERT INTO snapshotLineages VALUES ('other','other-lineage')")
    expect(review.tables('CURRENT', 'lineage').map(t => t.name)).toEqual([
      'placesCells',
      'streetsAddress',
    ])
    expect(review.tables('CURRENT', SHARED_GROUP).map(t => t.name)).toEqual([
      'operationState',
    ])
    expect(review.catalogue('CURRENT').groups.map(g => g.id)).toEqual([
      'lineage',
      SHARED_GROUP,
    ])
    expect(review.tables('HISTORY', 'lineage').map(t => t.name)).toEqual(['places'])
    expect(
      review.inspect('CURRENT', 'lineage', 'streetsAddress', false).samples[0]?.record
        .addressId,
    ).toBe('address')
  } finally {
    meta.close()
    review.close()
  }
})

test('CURRENT projection filtering does not depend on a populated HISTORY shard', () => {
  const review = fixture([
    {
      binding: 'DB_CURRENT',
      sql: `CREATE TABLE address2d(id TEXT,scopeId TEXT); INSERT INTO address2d VALUES ('address','lineage');
      CREATE TABLE statsDefinitionSets(id TEXT); INSERT INTO statsDefinitionSets VALUES ('defs');`,
    },
  ])
  try {
    expect(review.tables('CURRENT', 'lineage')).toEqual([])
    expect(review.tables('CURRENT', SHARED_GROUP)).toEqual([])
    expect(review.catalogue('CURRENT').groups).toEqual([])
  } finally {
    review.close()
  }
})

test('HISTORY reviews address granularities together', () => {
  const review = fixture([
    {
      binding: 'DB_HISTORY_HK_2026',
      sql: `CREATE TABLE address2d(id TEXT, snapshotId TEXT, granularity TEXT);
      INSERT INTO address2d VALUES ('a','snap','building'),('b','snap','complex'),('c','snap','unknown');`,
    },
  ])
  try {
    expect(review.subsets('HISTORY', 'lineage', 'address2d')).toEqual([])
    expect(
      review
        .inspect('HISTORY', 'lineage', 'address2d', false, 8)
        .samples.map(s => s.record.granularity)
        .sort(),
    ).toEqual(['building', 'complex', 'unknown'])
    expect(() =>
      review.inspect(
        'HISTORY',
        'lineage',
        'address2d',
        false,
        8,
        JSON.stringify(['granularity', 'building']),
      ),
    ).toThrow('Unsupported subset')
  } finally {
    review.close()
  }
})
