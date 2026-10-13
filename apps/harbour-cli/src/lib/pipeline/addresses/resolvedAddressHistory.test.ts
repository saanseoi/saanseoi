import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import { closeResolvedAddressHistory } from './resolvedAddressHistory'

test('cross-year replacement appends missing locale without changing parent content', () => {
  const old = new Database(':memory:')
  const history = new Database(':memory:')
  const current = new Database(':memory:')
  try {
    old.exec(`CREATE TABLE address2d(id TEXT,versionHash TEXT,isCurrent INTEGER,updatedAt TEXT);
      CREATE TABLE address2dI18n(addressId TEXT,versionHash TEXT,locale TEXT,isCurrent INTEGER,updatedAt TEXT);
      CREATE TABLE address2dBuildingNumberLookup(addressId TEXT,versionHash TEXT,isCurrent INTEGER,updatedAt TEXT);
      INSERT INTO address2d VALUES('a','old',1,'before'); INSERT INTO address2dI18n VALUES('a','old','en',1,'before');
      INSERT INTO address2dI18n VALUES('a','old','zh-hant',1,'before'); INSERT INTO address2dBuildingNumberLookup VALUES('a','old',1,'before');`)
    history.exec(
      `CREATE TABLE address2dI18n(snapshotId TEXT,addressId TEXT,locale TEXT,versionHash TEXT,operation TEXT,sourceReleaseId TEXT,isCurrent INTEGER,createdAt TEXT,updatedAt TEXT,PRIMARY KEY(addressId,snapshotId,locale));`,
    )
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
      resourceReleaseId: 'r2',
      now: 'now',
    })
    expect(old.query('SELECT versionHash,isCurrent FROM address2d').all()).toEqual([
      { versionHash: 'old', isCurrent: 1 },
    ])
    expect(old.query('SELECT isCurrent FROM address2dI18n').all()).toEqual([
      { isCurrent: 1 },
      { isCurrent: 1 },
    ])
    expect(
      history.query("SELECT operation FROM address2dI18n WHERE locale='zh-hant'").get(),
    ).toEqual({ operation: 'delete' })
  } finally {
    old.close()
    history.close()
    current.close()
  }
})
