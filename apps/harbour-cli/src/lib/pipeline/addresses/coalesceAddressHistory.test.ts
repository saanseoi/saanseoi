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
  run: (input: Parameters<typeof coalesceAddressHistory>[0]) => void,
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
        INSERT INTO address2d(snapshotId,id,divisionSnapshotId,granularity) VALUES('scope','a','division','building'),('other-scope','other','division','building');
        INSERT INTO address2dBuildingNumberLookup(snapshotId,addressId,buildingNumber,numericStem,evidence,derivation) VALUES('scope','a','1',1,'source_endpoint','single');`)
      if (binding === oldBinding)
        db.exec(`
        INSERT INTO address2d(id,versionHash,snapshotId,sourceReleaseId,granularity,isCurrent) VALUES('a','v1','one','r1','building',1);
        INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,sourceReleaseId,snapshotId,isCurrent) VALUES('a','v1','en','First','r1','one',1),('a','v1','zh-hant','中文','r1','one',1);
        INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,snapshotId,sourceReleaseId,buildingNumber,numericStem,evidence,derivation,isCurrent) VALUES('a','v1','one','r1','1',1,'source_endpoint','single',1);`)
      if (binding === nextBinding)
        db.exec(`
        INSERT INTO address2d(id,versionHash,snapshotId,sourceReleaseId,granularity,isCurrent) VALUES('other','other-version','other-snapshot','other-release','building',1);
        INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,sourceReleaseId,snapshotId,isCurrent,createdAt,updatedAt) VALUES('a','returning','en','Second','retained-release','retained-snapshot',0,'retained-created','retained-closed');`)
      db.close()
      const candidate = join(directory, `${binding}-candidate.sqlite`)
      await copyFile(path, candidate)
      const copy = new Database(candidate)
      opened.push(copy)
      candidates[binding] = { db: copy }
    }
    run({
      candidates,
      files,
      historyBinding: nextBinding,
      snapshotId: 'two',
      scopeId: 'scope',
      now: '2026-01-01T00:00:00Z',
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
    `INSERT INTO address2d(id,versionHash,snapshotId,sourceReleaseId,granularity,isCurrent) VALUES('a','v2','two','r2',?,1)`,
  ).run(granularity)
  db.exec(`INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,sourceReleaseId,snapshotId,isCurrent) VALUES('a','v2','en','Second','r2','two',1),('a','v2','zh-hant','中文','r2','two',1);
    INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('two','address2d','a','','v2','upsert','r2'),('two','address2dI18n','a','en','v2','upsert','r2'),('two','address2dI18n','a','zh-hant','v2','upsert','r2');`)
  db.query(
    `INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,snapshotId,sourceReleaseId,buildingNumber,numericStem,evidence,derivation,isCurrent) VALUES('a','v2','two','r2',?,?,'source_endpoint','single',1)`,
  ).run(number, Number(number))
}

test('cross-year locale changes reuse base, other locale and lookup without touching another scope', async () => {
  await fixture(input => {
    stage(input)
    coalesceAddressHistory(input)
    const old = input.candidates[oldBinding]!.db
    const next = input.candidates[nextBinding]!.db
    expect(old.query('SELECT id,versionHash,isCurrent FROM address2d').all()).toEqual([
      { id: 'a', versionHash: 'v1', isCurrent: 1 },
    ])
    expect(
      old.query('SELECT locale,isCurrent FROM address2dI18n ORDER BY locale').all(),
    ).toEqual([
      { locale: 'en', isCurrent: 0 },
      { locale: 'zh-hant', isCurrent: 1 },
    ])
    expect(next.query('SELECT id,versionHash,isCurrent FROM address2d').all()).toEqual([
      { id: 'other', versionHash: 'other-version', isCurrent: 1 },
    ])
    expect(
      next.query('SELECT locale FROM address2dI18n WHERE isCurrent=1').all(),
    ).toEqual([{ locale: 'en' }])
    expect(
      next.query('SELECT recordType,locale FROM snapshotVersionChanges').all(),
    ).toEqual([{ recordType: 'address2dI18n', locale: 'en' }])
    expect(next.query('SELECT * FROM address2dBuildingNumberLookup').all()).toEqual([])
    expect(
      old.query('SELECT isCurrent FROM address2dBuildingNumberLookup').get(),
    ).toEqual({ isCurrent: 1 })
  })
})

test('a base change leaves unchanged lookup evidence open after exact history closure', async () => {
  await fixture(input => {
    stage(input, 'site')
    coalesceAddressHistory(input)
    closeResolvedAddressHistory({
      ...input,
      releaseId: 'r2',
      prior: [
        {
          recordType: 'address2d',
          recordId: 'a',
          locale: '',
          versionHash: 'v1',
          sourceReleaseId: 'r1',
          shard: { bindingName: oldBinding },
        },
      ] as Parameters<typeof closeResolvedAddressHistory>[0]['prior'],
    })
    expect(
      input.candidates[oldBinding]!.db.query('SELECT isCurrent FROM address2d').get(),
    ).toEqual({ isCurrent: 0 })
    expect(
      input.candidates[oldBinding]!.db.query(
        'SELECT isCurrent FROM address2dBuildingNumberLookup',
      ).get(),
    ).toEqual({ isCurrent: 1 })
  })
})

test('lookup replacement closes only omitted evidence when the base is unchanged', async () => {
  await fixture(input => {
    stage(input, 'building', '2')
    input.candidates.DB_CURRENT!.db.exec(
      "UPDATE address2dBuildingNumberLookup SET buildingNumber='2',numericStem=2 WHERE addressId='a'",
    )
    coalesceAddressHistory(input)
    expect(
      input.candidates[oldBinding]!.db.query('SELECT isCurrent FROM address2d').get(),
    ).toEqual({ isCurrent: 1 })
    expect(
      input.candidates[oldBinding]!.db.query(
        'SELECT isCurrent FROM address2dBuildingNumberLookup',
      ).get(),
    ).toEqual({ isCurrent: 0 })
    expect(
      input.candidates[nextBinding]!.db.query(
        'SELECT buildingNumber,isCurrent FROM address2dBuildingNumberLookup',
      ).get(),
    ).toEqual({ buildingNumber: '2', isCurrent: 1 })
  })
})

test('reappearing content reopens its retained version without replacing historical provenance', async () => {
  await fixture(input => {
    stage(input)
    const db = input.candidates[nextBinding]!.db
    db.exec(
      "DELETE FROM address2dI18n WHERE versionHash='v2' AND locale='en'; UPDATE address2dI18n SET isCurrent=1,snapshotId='two',sourceReleaseId='r2',createdAt='new-created',updatedAt='new-updated' WHERE versionHash='returning'; UPDATE snapshotVersionChanges SET versionHash='returning' WHERE locale='en'",
    )
    coalesceAddressHistory(input)
    expect(
      db
        .query(
          "SELECT snapshotId,sourceReleaseId,isCurrent,createdAt,updatedAt FROM address2dI18n WHERE versionHash='returning'",
        )
        .get(),
    ).toEqual({
      snapshotId: 'retained-snapshot',
      sourceReleaseId: 'retained-release',
      isCurrent: 1,
      createdAt: 'retained-created',
      updatedAt: input.now,
    })
    expect(
      db
        .query("SELECT versionHash FROM snapshotVersionChanges WHERE locale='en'")
        .get(),
    ).toEqual({ versionHash: 'returning' })
    expect(
      input.candidates[oldBinding]!.db.query(
        "SELECT isCurrent FROM address2dI18n WHERE locale='en'",
      ).get(),
    ).toEqual({ isCurrent: 0 })
  })
})
