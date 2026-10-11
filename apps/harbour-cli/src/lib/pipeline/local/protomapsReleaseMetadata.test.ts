import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { prepareSourceOnlyReleaseMetadata } from './sourceOnlyReleaseMetadata'
import {
  buildNativeSourceVerificationSql,
  buildSourceOnlyMetadataSql,
} from './nativeSourceSql'
import type { LocalD1ExecBinding } from '../../dbCache/localDbCacheTypes'

function binding(db: Database) {
  return {
    prepare: (sql: string) => ({
      bind: (...params: string[]) => ({
        all: async () => ({ results: db.query(sql).all(...params) }),
      }),
    }),
  } as LocalD1ExecBinding
}

test('source-only metadata links the source shard and persists exact historical churn', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE dataShards(id TEXT, bindingName TEXT, environment TEXT, shardType TEXT, status TEXT);
    INSERT INTO dataShards VALUES ('source', 'DB_SOURCE_HK_2026', 'preview', 'source', 'active');
    CREATE TABLE resourceReleases(id TEXT, datasetId TEXT, resourceType TEXT, sourceVersion TEXT, status TEXT, revokedAt TEXT);
    INSERT INTO resourceReleases VALUES ('old', 'islands', 'divisionArea', '2026-09-01.3', 'current', NULL), ('new', 'islands', 'divisionArea', '2026-10-01.1', 'current', NULL);
    CREATE TABLE protomapsIslandFeatures(sourceRecordId TEXT, versionHash TEXT, properties TEXT, sourceGeometry TEXT, validFromRelease TEXT, validToRelease TEXT);
    INSERT INTO protomapsIslandFeatures VALUES
      ('same', 'same', '{"kind":"coastline-land"}', 'null', '2026-09-01.3', NULL),
      ('changed', 'old', '{"kind":"osm-island","name":"Old"}', 'null', '2026-09-01.3', '2026-10-01.1'),
      ('changed', 'new', '{"kind":"osm-island","name":"New"}', 'null', '2026-10-01.1', NULL),
      ('removed', 'gone', '{"kind":"osm-island"}', 'null', '2026-09-01.3', '2026-10-01.1'),
      ('added', 'new', '{"kind":"osm-island"}', 'null', '2026-10-01.1', NULL);
    CREATE TABLE releaseShardAssignments(resourceReleaseId TEXT, dataShardId TEXT, PRIMARY KEY(resourceReleaseId,dataShardId));
    CREATE TABLE stats(id TEXT, resourceReleaseId TEXT, apiReleaseSetId TEXT, category TEXT, measure TEXT, unit TEXT, value REAL, dimension TEXT, dimensionValue TEXT);
    INSERT INTO stats VALUES ('audit', 'new', NULL, 'processing', 'count', 'count', 1, NULL, NULL);`)
  try {
    const input = {
      datasetCode: 'ds-hk-protomaps-island' as const,
      resourceReleaseId: 'new',
      sourceVersion: '2026-10-01.1',
      sourceBindingName: 'DB_SOURCE_HK_2026',
      environment: 'preview' as const,
    }
    const metadata = await prepareSourceOnlyReleaseMetadata(
      binding(db),
      [binding(db)],
      input,
    )
    expect(metadata.totals).toEqual({
      count: 3,
      added_count: 1,
      removed_count: 1,
      changed_count: 1,
      unchanged_count: 1,
    })
    for (let i = 0; i < 2; i++)
      for (const sql of buildSourceOnlyMetadataSql('new', metadata)) db.exec(sql)
    expect(db.query('SELECT * FROM releaseShardAssignments').all()).toEqual([
      { resourceReleaseId: 'new', dataShardId: 'source' },
    ])
    expect(
      db
        .query(
          "SELECT value FROM stats WHERE category = 'changes' AND measure = 'changed_count'",
        )
        .get(),
    ).toEqual({ value: 1 })
    expect(
      db.query("SELECT count(*) n FROM stats WHERE category = 'processing'").get(),
    ).toEqual({ n: 1 })
    const baseline = await prepareSourceOnlyReleaseMetadata(
      binding(db),
      [binding(db)],
      {
        ...input,
        resourceReleaseId: 'old',
        sourceVersion: '2026-09-01.3',
      },
    )
    expect(baseline.totals).toEqual({
      count: 3,
      added_count: 3,
      removed_count: 0,
      changed_count: 0,
      unchanged_count: 0,
    })
    await expect(
      prepareSourceOnlyReleaseMetadata(binding(db), [], input),
    ).rejects.toThrow('Missing retained Protomaps')
  } finally {
    db.close()
  }
})

test('post-import verification fails for missing, wrong-version or expired records', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE records(sourceRecordId TEXT, versionHash TEXT, validFromRelease TEXT, validToRelease TEXT);
    INSERT INTO records VALUES ('same', 'hash', '2026-09-01.3', NULL), ('gone', 'hash', '2026-09-01.3', '2026-10-01.1');`)
  const verify = (id: string, hash = 'hash') => {
    for (const sql of buildNativeSourceVerificationSql(
      'records',
      [{ sourceRecordId: id, versionHash: hash }],
      '2026-10-01.1',
    ))
      db.exec(sql)
  }
  try {
    expect(() => verify('same')).not.toThrow()
    expect(() => verify('missing')).toThrow()
    expect(() => verify('same', 'wrong')).toThrow()
    expect(() => verify('gone')).toThrow()
  } finally {
    db.close()
  }
})

test('RVD source-only metadata publishes BEFORE shard and assertion counts without geometry', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE dataShards(id TEXT, bindingName TEXT, environment TEXT, shardType TEXT, status TEXT);
    INSERT INTO dataShards VALUES ('before', 'DB_SOURCE_HK_BEFORE', 'preview', 'source', 'active');
    CREATE TABLE resourceReleases(id TEXT, datasetId TEXT, resourceType TEXT, sourceVersion TEXT, status TEXT, revokedAt TEXT);
    INSERT INTO resourceReleases VALUES ('rvd', 'rvd', 'division', '2015-04-30.0', 'current', NULL);
    CREATE TABLE hkgovRvdAreas(sourceRecordId TEXT, properties TEXT, validFromRelease TEXT, validToRelease TEXT);
    INSERT INTO hkgovRvdAreas VALUES
      ('area', '{"kind":"area"}', '2015-04-30.0', NULL),
      ('district', '{"kind":"district"}', '2015-04-30.0', NULL),
      ('subdistrict', '{"kind":"subdistrict"}', '2015-04-30.0', NULL),
      ('locality', '{"kind":"included-locality"}', '2015-04-30.0', NULL),
      ('future', '{"kind":"district"}', '2016-01-01.0', NULL);
    CREATE TABLE releaseShardAssignments(resourceReleaseId TEXT, dataShardId TEXT, PRIMARY KEY(resourceReleaseId,dataShardId));
    CREATE TABLE stats(id TEXT, resourceReleaseId TEXT, apiReleaseSetId TEXT, category TEXT, measure TEXT, unit TEXT, value REAL, dimension TEXT, dimensionValue TEXT);
    INSERT INTO stats VALUES ('audit', 'rvd', NULL, 'processing', 'count', 'count', 1, NULL, NULL);`)
  try {
    const metadata = await prepareSourceOnlyReleaseMetadata(
      binding(db),
      [binding(db)],
      {
        datasetCode: 'ds-hk-hkgov-rvd-division',
        resourceReleaseId: 'rvd',
        sourceVersion: '2015-04-30.0',
        sourceBindingName: 'DB_SOURCE_HK_BEFORE',
        environment: 'preview',
      },
    )
    expect(metadata.totals).toEqual({
      count: 4,
      added_count: 4,
      removed_count: 0,
      changed_count: 0,
      unchanged_count: 0,
    })
    for (let i = 0; i < 2; i++)
      for (const sql of buildSourceOnlyMetadataSql('rvd', metadata)) db.exec(sql)
    expect(db.query('SELECT * FROM releaseShardAssignments').all()).toEqual([
      { resourceReleaseId: 'rvd', dataShardId: 'before' },
    ])
    expect(
      db
        .query(
          "SELECT dimensionValue, value FROM stats WHERE category='records' AND dimension='type' ORDER BY dimensionValue",
        )
        .all(),
    ).toEqual([
      { dimensionValue: 'area', value: 1 },
      { dimensionValue: 'district', value: 1 },
      { dimensionValue: 'included-locality', value: 1 },
      { dimensionValue: 'subdistrict', value: 1 },
    ])
    expect(
      db.query("SELECT count(*) n FROM stats WHERE category='processing'").get(),
    ).toEqual({ n: 1 })
  } finally {
    db.close()
  }
})
