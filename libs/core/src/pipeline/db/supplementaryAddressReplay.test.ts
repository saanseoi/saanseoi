import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import { requireDefined } from '../../requireDefined'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { getReplayedAddressVersionMap } from './address'
import type { ReplayShard } from './snapshotReplay'

function fixture() {
  const databases = [new Database(':memory:'), new Database(':memory:')]
  const parameters: number[] = []
  const queryPlans: string[] = []
  const migrations = loadMigrationSql(
    resolve(import.meta.dir, '../../../../db/migrations'),
    ['history'],
  ).replaceAll('--> statement-breakpoint', '')
  const shards = new Map<string, ReplayShard>()
  for (const [index, db] of databases.entries()) {
    db.exec(migrations)
    const bindingName = index === 0 ? 'old' : 'new'
    shards.set(bindingName, {
      bindingName,
      db: drizzle({
        client: db,
        logger: {
          logQuery: (sql, params) => {
            parameters.push(params.length)
            if (/from "address2d(?:I18n)?"/.test(sql)) {
              queryPlans.push(
                ...db
                  .query(`EXPLAIN QUERY PLAN ${sql}`)
                  .all(...(params as never[]))
                  .map(row => (row as { detail: string }).detail),
              )
            }
          },
        },
      }) as never,
    })
  }
  const plan = (snapshotId: string): SnapshotReplayStep[] =>
    (snapshotId === 'next' ? ['first', 'next'] : [snapshotId]).map((id, index) => ({
      resourceReleaseId: 'release',
      snapshotId: id,
      parentSnapshotId: index ? 'first' : null,
      shards: [...shards.keys()].map(bindingName => ({
        bindingName,
        dataShardId: bindingName,
      })),
    }))
  const replay = (snapshot: string, includeLocales = true) =>
    getReplayedAddressVersionMap(
      {} as never,
      snapshot,
      shards,
      {
        buildAddressBaseHashInput: value => value,
        buildMatchKey: () => null,
        normaliseAddressI18nSnapshotRow: value => value,
      },
      { plan: plan(snapshot), includeLocales },
    )
  requireDefined(databases[0]).exec(`INSERT INTO address2d
    (id,sources,versionHash,snapshotId,isCurrent)
    VALUES('ss-opa-shared',NULL,'base','first',1);
    INSERT INTO address2dI18n
    (addressId,locale,formattedAddress,versionHash,snapshotId,isCurrent)
    VALUES('ss-opa-shared','en','1 Sample Road','english','first',1);`)
  return {
    databases,
    shards,
    parameters,
    queryPlans,
    replay,
    close: () => {
      for (const db of databases) db.close()
    },
  }
}

test('supplementary replay retains source attribution without an evidence table', async () => {
  const data = fixture()
  try {
    const sources = [
      {
        publisher: 'overture',
        dataset: 'ds-hk-overture-place',
        recordId: 'place-a',
      },
    ]
    requireDefined(data.databases[0])
      .query('UPDATE address2d SET sources=?')
      .run(JSON.stringify(sources))
    const original = requireDefined((await data.replay('first')).get('ss-opa-shared'))
    const next = requireDefined((await data.replay('next')).get('ss-opa-shared'))
    expect(original.base.sources).toEqual(sources)
    expect(next).toEqual(original)
    expect(
      (await data.replay('next', false)).get('ss-opa-shared')?.base.sources,
    ).toEqual(sources)
    expect(
      (await data.replay('next', false)).get('ss-opa-shared')?.localisedRows,
    ).toEqual([])
    expect((await data.replay('empty')).size).toBe(0)
    expect(
      requireDefined(data.databases[0])
        .query("SELECT name FROM sqlite_master WHERE name='address2dEvidence'")
        .all(),
    ).toEqual([])
  } finally {
    data.close()
  }
})

test('address replay uses indexed exact identities within D1 limits across batches', async () => {
  const data = fixture()
  try {
    const db = requireDefined(data.databases[0])
    for (let index = 0; index < 205; index++) {
      const id = `address-${index}`
      db.query(
        `INSERT INTO address2d (id,versionHash,snapshotId,isCurrent) VALUES(?, 'shared-base', 'batch', 1)`,
      ).run(id)
      for (const locale of ['en', 'zh-Hant']) {
        db.query(
          `INSERT INTO address2dI18n (addressId,locale,formattedAddress,versionHash,snapshotId,isCurrent) VALUES(?,?,?, 'shared-locale', 'batch', 1)`,
        ).run(id, locale, `${id}-${locale}`)
      }
    }
    const result = await data.replay('batch')
    expect(result.size).toBe(205)
    for (const [id, row] of result) {
      expect(row.localisedRows).toHaveLength(2)
      expect(row.localisedRows.map(value => value.formattedAddress).sort()).toEqual([
        `${id}-en`,
        `${id}-zh-Hant`,
      ])
    }
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(100)
    expect(data.queryPlans.some(detail => detail.includes('SEARCH address2d'))).toBe(
      true,
    )
    expect(data.queryPlans.filter(detail => /SCAN address2d/.test(detail))).toEqual([])
  } finally {
    data.close()
  }
})
