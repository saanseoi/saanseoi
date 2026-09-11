import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import {
  closeResolvedAddressHistory,
  coalesceAddressSourceResolutions,
} from './resolvedAddressHistory.ts'

const resolutionSchema = `CREATE TABLE sourceResolutions(scopeId TEXT,snapshotId TEXT,sourceReleaseId TEXT,sourceRecordId TEXT,sourceVersionHash TEXT,resolutions TEXT,
  PRIMARY KEY(scopeId,sourceReleaseId,sourceRecordId,sourceVersionHash));`
const parentPlan = [
  {
    snapshotId: 'one',
    parentSnapshotId: null,
    shards: [{ bindingName: 'DB_HISTORY_HK_2025' }],
  },
] as SnapshotReplayStep[]
const membership = (ids: string[]): AlsMembership => ({
  schemaVersion: 1,
  sourceVersion: '2026-01-01.0',
  addresses: [],
  collections: [],
  aliases: [],
  sources: ids.map(id => ({ id, kind: '2d', canonicalIds: ['building'] })),
})

test('source interpretations inherit unchanged evidence and journal omissions once across years', () => {
  const old = new Database(':memory:')
  const next = new Database(':memory:')
  const source = new Database(':memory:')
  const candidates = {
    DB_HISTORY_HK_2025: { db: old },
    DB_HISTORY_HK_2026: { db: next },
    DB_SOURCE_HK_2025: { db: source },
  }
  try {
    old.exec(resolutionSchema)
    next.exec(resolutionSchema)
    source.exec(`CREATE TABLE hkgovAlsAddresses2d(sourceRecordId TEXT,versionHash TEXT,isCurrent INTEGER);
      CREATE TABLE hkgovAlsAddresses3d(sourceRecordId TEXT,versionHash TEXT,isCurrent INTEGER);
      INSERT INTO hkgovAlsAddresses2d VALUES('raw','hash',1);`)
    const original = JSON.stringify({ entities: { address2d: ['building'] } })
    old
      .query('INSERT INTO sourceResolutions VALUES(?,?,?,?,?,?)')
      .run('snapshot:one', 'one', 'r1', 'raw', 'hash', original)
    const run = (snapshotId: string, ids: string[], plan = parentPlan) =>
      coalesceAddressSourceResolutions({
        candidates,
        historyBinding: 'DB_HISTORY_HK_2026',
        parentPlan: plan,
        membership: membership(ids),
        snapshotId,
        releaseId: `r-${snapshotId}`,
      })
    run('two', ['raw'])
    expect(next.query('SELECT * FROM sourceResolutions').all()).toEqual([])
    expect(old.query('SELECT resolutions FROM sourceResolutions').get()).toEqual({
      resolutions: original,
    })
    source.exec('UPDATE hkgovAlsAddresses2d SET isCurrent=0')
    run('three', [])
    expect(
      JSON.parse(
        next
          .query<{ resolutions: string }, []>(
            'SELECT resolutions FROM sourceResolutions',
          )
          .get()!.resolutions,
      ),
    ).toEqual({ entities: {}, decisions: [{ type: 'source_omission' }] })
    const nextPlan = [
      ...parentPlan,
      {
        snapshotId: 'three',
        parentSnapshotId: 'one',
        shards: [{ bindingName: 'DB_HISTORY_HK_2026' }],
      },
    ] as SnapshotReplayStep[]
    run('four', [], nextPlan)
    expect(next.query('SELECT snapshotId FROM sourceResolutions').all()).toEqual([
      { snapshotId: 'three' },
    ])
    source.exec('UPDATE hkgovAlsAddresses2d SET isCurrent=1')
    run('five', ['raw'], nextPlan)
    expect(
      next
        .query("SELECT resolutions FROM sourceResolutions WHERE snapshotId='five'")
        .get(),
    ).toEqual({ resolutions: original })
  } finally {
    old.close()
    next.close()
    source.close()
  }
})

test('changed interpretation survives compaction even when publisher content is unchanged', () => {
  const old = new Database(':memory:')
  const next = new Database(':memory:')
  const source = new Database(':memory:')
  try {
    old.exec(resolutionSchema)
    next.exec(resolutionSchema)
    source.exec(`CREATE TABLE hkgovAlsAddresses2d(sourceRecordId TEXT,versionHash TEXT,isCurrent INTEGER);
      CREATE TABLE hkgovAlsAddresses3d(sourceRecordId TEXT,versionHash TEXT,isCurrent INTEGER);
      INSERT INTO hkgovAlsAddresses2d VALUES('raw','hash',1);`)
    old
      .query('INSERT INTO sourceResolutions VALUES(?,?,?,?,?,?)')
      .run(
        'snapshot:one',
        'one',
        'r1',
        'raw',
        'hash',
        '{"entities":{"address2d":["old-building"]}}',
      )
    coalesceAddressSourceResolutions({
      candidates: {
        DB_HISTORY_HK_2025: { db: old },
        DB_HISTORY_HK_2026: { db: next },
        DB_SOURCE_HK_2025: { db: source },
      },
      historyBinding: 'DB_HISTORY_HK_2026',
      parentPlan,
      membership: membership(['raw']),
      snapshotId: 'two',
      releaseId: 'r2',
    })
    expect(
      next.query('SELECT sourceRecordId,resolutions FROM sourceResolutions').all(),
    ).toEqual([
      { sourceRecordId: 'raw', resolutions: '{"entities":{"address2d":["building"]}}' },
    ])
  } finally {
    old.close()
    next.close()
    source.close()
  }
})

test('cross-year replacement closes prior base and missing locale while keeping historical content', () => {
  const old = new Database(':memory:')
  const history = new Database(':memory:')
  const current = new Database(':memory:')
  try {
    old.exec(`CREATE TABLE address2d(id TEXT,versionHash TEXT,isCurrent INTEGER,updatedAt TEXT);
      CREATE TABLE address2dI18n(addressId TEXT,versionHash TEXT,locale TEXT,isCurrent INTEGER,updatedAt TEXT);
      CREATE TABLE address2dBuildingNumberLookup(addressId TEXT,versionHash TEXT,isCurrent INTEGER,updatedAt TEXT);
      INSERT INTO address2d VALUES('a','old',1,'before'); INSERT INTO address2dI18n VALUES('a','old','en',1,'before');
      INSERT INTO address2dI18n VALUES('a','old','zh-hant',1,'before'); INSERT INTO address2dBuildingNumberLookup VALUES('a','old',1,'before');`)
    history.exec(`CREATE TABLE snapshotVersionChanges(snapshotId TEXT,recordType TEXT,recordId TEXT,locale TEXT,versionHash TEXT,operation TEXT,sourceReleaseId TEXT,createdAt TEXT,updatedAt TEXT,PRIMARY KEY(snapshotId,recordType,recordId,locale));
      INSERT INTO snapshotVersionChanges VALUES('two','address2d','a','','new','upsert','r2','now','now');
      INSERT INTO snapshotVersionChanges VALUES('two','address2dI18n','a','en','new','upsert','r2','now','now');`)
    current.exec(`CREATE TABLE address2d(snapshotId TEXT,id TEXT); CREATE TABLE address2dI18n(snapshotId TEXT,addressId TEXT,locale TEXT);
      INSERT INTO address2d VALUES('scope','a'); INSERT INTO address2dI18n VALUES('scope','a','en');`)
    const prior = [
      ['address2d', ''],
      ['address2dI18n', 'en'],
      ['address2dI18n', 'zh-hant'],
    ].map(([recordType, locale]) => ({
      recordType,
      locale,
      recordId: 'a',
      versionHash: 'old',
      sourceReleaseId: 'r1',
      shard: { bindingName: 'DB_HISTORY_HK_2025' },
    })) as ResolvedSnapshotVersion[]
    closeResolvedAddressHistory({
      candidates: {
        DB_CURRENT: { db: current },
        DB_HISTORY_HK_2025: { db: old },
        DB_HISTORY_HK_2026: { db: history },
      },
      historyBinding: 'DB_HISTORY_HK_2026',
      prior,
      snapshotId: 'two',
      scopeId: 'scope',
      releaseId: 'r2',
      now: 'now',
    })
    expect(old.query('SELECT versionHash,isCurrent FROM address2d').all()).toEqual([
      { versionHash: 'old', isCurrent: 0 },
    ])
    expect(old.query('SELECT isCurrent FROM address2dI18n').all()).toEqual([
      { isCurrent: 0 },
      { isCurrent: 0 },
    ])
    expect(
      history
        .query("SELECT operation FROM snapshotVersionChanges WHERE locale='zh-hant'")
        .get(),
    ).toEqual({ operation: 'delete' })
  } finally {
    old.close()
    history.close()
    current.close()
  }
})
