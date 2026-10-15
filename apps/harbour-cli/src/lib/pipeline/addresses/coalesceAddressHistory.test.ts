import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { coalesceAddressHistory } from './coalesceAddressHistory.ts'
import { closeResolvedAddressHistory } from './resolvedAddressHistory.ts'

const oldBinding = 'DB_HISTORY_HK_2025'
const nextBinding = 'DB_HISTORY_HK_2026'

async function fixture(
  run: (input: Parameters<typeof coalesceAddressHistory>[0]) => void | Promise<void>,
  multipleLookups = false,
) {
  const directory = await mkdtemp(join(tmpdir(), 'address-components-'))
  const opened: Database[] = []
  try {
    const files: Record<string, string> = {}
    const candidates: Record<string, { db: Database }> = {}
    for (const binding of ['DB_CURRENT', oldBinding, nextBinding]) {
      const path = join(directory, `${binding}.sqlite`)
      files[binding] = path
      const db = new Database(path)
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
          [binding === 'DB_CURRENT' ? 'current' : 'history'],
        ),
      )
      if (binding === 'DB_CURRENT')
        db.exec(`
        INSERT INTO address2d(scopeId,id,divisionSnapshotId,granularity) VALUES('scope','a','division','building'),('other-scope','other','division','building');
        INSERT INTO address2dBuildingNumberLookup(scopeId,addressId,buildingNumber,numericStem,evidence,derivation) VALUES('scope','a','1',1,'source_endpoint','single');`)
      if (binding === oldBinding)
        db.exec(`
        INSERT INTO address2d(id,versionHash,snapshotId,granularity,isCurrent) VALUES('a','v1','one','building',1);
        INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,snapshotId,isCurrent) VALUES('a','v1','en','First','one',1),('a','v1','zh-hant','中文','one',1);
        INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,snapshotId,buildingNumber,numericStem,evidence,derivation,isCurrent) VALUES('a','v1','one','1',1,'source_endpoint','single',1);
`)
      if (binding === nextBinding)
        db.exec(`
        INSERT INTO address2d(id,versionHash,snapshotId,granularity,isCurrent) VALUES('other','other-version','other-snapshot','building',1);
        INSERT INTO address2dI18n (addressId,versionHash,locale,formattedAddress,snapshotId,isCurrent,createdAt) VALUES ('a','returning','en','Second','retained-snapshot',0,'retained-created');`)
      if (multipleLookups && binding === 'DB_CURRENT')
        db.exec(
          "INSERT INTO address2dBuildingNumberLookup(scopeId,addressId,buildingNumber,numericStem,evidence,derivation) VALUES('scope','a','2',2,'source_endpoint','single')",
        )
      if (multipleLookups && binding === oldBinding)
        db.exec(
          "INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,snapshotId,buildingNumber,numericStem,evidence,derivation,isCurrent) VALUES('a','v1','one','2',2,'source_endpoint','single',1)",
        )
      db.close()
      const candidate = join(directory, `${binding}-candidate.sqlite`)
      await copyFile(path, candidate)
      const copy = new Database(candidate)
      opened.push(copy)
      candidates[binding] = { db: copy }
    }
    await run({
      candidates,
      files,
      historyBinding: nextBinding,
      snapshotId: 'two',
      scopeId: 'scope',
      now: '2026-01-01T00:00:00Z',
      prior: [
        { recordType: 'address2d', locale: '' },
        { recordType: 'address2dI18n', locale: 'en' },
        { recordType: 'address2dI18n', locale: 'zh-hant' },
        { recordType: 'address2dBuildingNumberLookup', locale: '' },
      ].map(row => ({
        ...row,
        sourceReleaseId: 'release',
        recordId:
          row.recordType === 'address2dBuildingNumberLookup'
            ? JSON.stringify(['a', '1'])
            : 'a',
        versionHash: 'v1',
        snapshotId: 'one',

        shard: { bindingName: oldBinding, db: {} as never },
      })),
    })
  } finally {
    for (const db of opened) db.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function stage(
  input: Parameters<typeof coalesceAddressHistory>[0],
  granularity = 'building',
  number = '1',
) {
  const db = input.candidates[nextBinding]!.db
  db.query(
    `INSERT INTO address2d(id,versionHash,snapshotId,granularity,isCurrent) VALUES('a','v2','two',?,1)`,
  ).run(granularity)
  db.exec(`INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,snapshotId,isCurrent) VALUES('a','v2','en','Second','two',1),('a','v2','zh-hant','中文','two',1);
    `)
  db.query(
    `INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,snapshotId,buildingNumber,numericStem,evidence,derivation,isCurrent) VALUES('a','v2','two',?,?,'source_endpoint','single',1)`,
  ).run(number, Number(number))
}

test('changed locale writes one inline row and leaves parent components immutable', async () => {
  await fixture(input => {
    const old = input.candidates[oldBinding]!.db
    const before = old.query('SELECT * FROM address2dI18n').all()
    stage(input)
    coalesceAddressHistory(input)
    const next = input.candidates[nextBinding]!.db
    expect(
      next
        .query("SELECT recordType,locale FROM historyEvents WHERE snapshotId='two'")
        .all(),
    ).toEqual([{ recordType: 'address2dI18n', locale: 'en' }])
    expect(old.query('SELECT * FROM address2dI18n').all()).toEqual(before)
    expect(
      next
        .query(
          "SELECT count(*) AS n FROM address2dBuildingNumberLookup WHERE snapshotId='two'",
        )
        .get(),
    ).toEqual({ n: 0 })
  })
})

test('omitted lookup writes a tombstone on the child and preserves its parent', async () => {
  await fixture(input => {
    stage(input, 'building', '2')
    input.candidates.DB_CURRENT!.db.exec(
      "UPDATE address2dBuildingNumberLookup SET buildingNumber='2',numericStem=2 WHERE addressId='a'",
    )
    coalesceAddressHistory(input)
    closeResolvedAddressHistory({
      ...input,
      resourceReleaseId: 'r2',
      prior: [...input.prior],
    })
    expect(
      input.candidates[nextBinding]!.db.query(
        "SELECT buildingNumber,operation FROM address2dBuildingNumberLookup WHERE snapshotId='two' ORDER BY buildingNumber",
      ).all(),
    ).toEqual([
      { buildingNumber: '1', operation: 'delete' },
      { buildingNumber: '2', operation: 'upsert' },
    ])
    expect(
      input.candidates[oldBinding]!.db.query(
        'SELECT buildingNumber,isCurrent FROM address2dBuildingNumberLookup',
      ).all(),
    ).toEqual([{ buildingNumber: '1', isCurrent: 1 }])
  })
})

test('same content on another branch receives a distinct event without changing its origin', async () => {
  await fixture(input => {
    stage(input)
    const db = input.candidates[nextBinding]!.db
    const retained = db
      .query("SELECT * FROM address2dI18n WHERE snapshotId='retained-snapshot'")
      .get()
    db.exec(
      "UPDATE address2dI18n SET versionHash='returning' WHERE snapshotId='two' AND locale='en'",
    )
    coalesceAddressHistory(input)
    expect(
      db
        .query(
          "SELECT snapshotId FROM address2dI18n WHERE versionHash='returning' ORDER BY snapshotId",
        )
        .all(),
    ).toEqual([{ snapshotId: 'retained-snapshot' }, { snapshotId: 'two' }])
    expect(
      db
        .query("SELECT * FROM address2dI18n WHERE snapshotId='retained-snapshot'")
        .get(),
    ).toEqual(retained)
  })
})
