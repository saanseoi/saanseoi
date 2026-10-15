import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { LocalD1ExecBinding } from '../../dbCache/localDbCacheTypes'
import {
  prepareSourceOnlyReleaseMetadata,
  sourceReleaseContracts,
} from './sourceOnlyReleaseMetadata'
function binding(db: Database) {
  return {
    prepare: (sql: string) => ({
      bind: (...values: string[]) => ({
        all: async () => ({ results: db.query(sql).all(...values) }),
      }),
    }),
  } as LocalD1ExecBinding
}
function meta() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE dataShards(id TEXT,bindingName TEXT,environment TEXT,shardType TEXT,status TEXT);
    INSERT INTO dataShards VALUES ('source','SOURCE','preview','source','active');
    CREATE TABLE resourceReleaseDetails(id TEXT,datasetId TEXT,resourceType TEXT,sourceVersion TEXT,status TEXT,revokedAt TEXT);
    INSERT INTO resourceReleaseDetails VALUES ('old','dataset','street','2025','archived',NULL),('new','dataset','street','2026','processing',NULL);`)
  return db
}
const input = (datasetCode: string) => ({
  datasetCode,
  resourceReleaseId: 'new',
  sourceVersion: '2026',
  sourceBindingName: 'SOURCE',
  environment: 'preview' as const,
})

for (const [dataset, contract] of Object.entries(sourceReleaseContracts).filter(
  ([name]) => name.includes('-hyd-') || name.includes('road-centreline'),
))
  test(`${dataset} persists retained publisher record totals across yearly shards`, async () => {
    const db = meta(),
      old = new Database(':memory:'),
      current = new Database(':memory:')
    try {
      for (const source of [old, current])
        source.exec(
          `CREATE TABLE ${contract.table}(sourceRecordId TEXT,properties TEXT,sourceGeometry TEXT,validFromRelease TEXT,validToRelease TEXT)`,
        )
      old.exec(
        `INSERT INTO ${contract.table} VALUES ('same','{"name":"same"}','null','2025',NULL),('changed','{"name":"old"}','null','2025','2026'),('gone','{}','null','2025','2026')`,
      )
      current.exec(
        `INSERT INTO ${contract.table} VALUES ('changed','{"name":"new"}','null','2026',NULL),('added','{}','null','2026',NULL)`,
      )
      const result = await prepareSourceOnlyReleaseMetadata(
        binding(db),
        [binding(old), binding(current)],
        input(dataset),
      )
      expect(result.totals).toEqual({
        count: 3,
        added_count: 1,
        changed_count: 1,
        removed_count: 1,
        unchanged_count: 1,
      })
      expect(
        result.stats.filter(row => row.category === 'changes' && !row.dimension),
      ).toHaveLength(5)
      expect(
        (
          await prepareSourceOnlyReleaseMetadata(
            binding(db),
            [binding(old), binding(current)],
            input(dataset),
          )
        ).totals,
      ).toEqual(result.totals)
    } finally {
      db.close()
      old.close()
      current.close()
    }
  })

test('LandsD Street source totals count publisher baseline and notice rows, including extracted evidence changes', async () => {
  const db = meta()
  try {
    db.exec(`CREATE TABLE hkgovLandsdStreetBaselineRecords(sourceRecordId TEXT,nameEn TEXT,nameZhHant TEXT,districtCode TEXT,validFromRelease TEXT,validToRelease TEXT);
      CREATE TABLE hkgovLandsdStreetNotices(sourceRecordId TEXT,nameEn TEXT,nameZhHant TEXT,descriptionEn TEXT,descriptionZhHant TEXT,gazetteDate TEXT,effectiveDate TEXT,kind TEXT,noticeRef TEXT,previousNoticeRefs TEXT,districtCodes TEXT,rawExtractedText TEXT,parserDiagnostics TEXT,evidenceAssets TEXT,validFromRelease TEXT,validToRelease TEXT);
      INSERT INTO hkgovLandsdStreetBaselineRecords VALUES ('street','Example Road','例子路','A','2025',NULL);
      INSERT INTO hkgovLandsdStreetNotices(sourceRecordId,noticeRef,evidenceAssets,validFromRelease,validToRelease) VALUES ('notice','G.N. 1','["old.pdf"]','2025','2026'),('notice','G.N. 1','["new.pdf"]','2026',NULL);`)
    const result = await prepareSourceOnlyReleaseMetadata(
      binding(db),
      [binding(db)],
      input('ds-hk-hkgov-landsd-street'),
    )
    expect(result.totals).toEqual({
      count: 2,
      added_count: 0,
      changed_count: 1,
      removed_count: 0,
      unchanged_count: 1,
    })
    db.exec('DELETE FROM resourceReleaseDetails WHERE id="old"')
    expect(
      (
        await prepareSourceOnlyReleaseMetadata(
          binding(db),
          [binding(db)],
          input('ds-hk-hkgov-landsd-street'),
        )
      ).totals,
    ).toEqual({
      count: 2,
      added_count: 2,
      changed_count: 0,
      removed_count: 0,
      unchanged_count: 0,
    })
  } finally {
    db.close()
  }
})
