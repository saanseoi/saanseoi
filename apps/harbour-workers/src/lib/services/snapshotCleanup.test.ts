import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import { cleanupSnapshotByResourceType } from './snapshotCleanup'

const families = [
  'place',
  'address',
  'street',
  'division',
  'divisionArea',
  'divisionBoundary',
] as const

function fixture(beforeQuery?: (sqlite: Database, query: string) => void) {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  sqlite.exec('PRAGMA foreign_keys=ON')
  const queries: string[] = []
  const db = drizzle({
    client: sqlite,
    logger: {
      logQuery(query) {
        queries.push(query)
        beforeQuery?.(sqlite, query)
      },
    },
  })
  const receipt = (
    family: (typeof families)[number],
    snapshotId = 'obsolete',
    scopeId = 'scope',
  ) =>
    sqlite
      .query(`INSERT INTO ${family}PublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES (?,?,'current','generation','complete')`)
      .run(scopeId, snapshotId)
  const clean = (
    resourceType: (typeof families)[number] | 'divisionStatistic',
    snapshotId = 'obsolete',
  ) => cleanupSnapshotByResourceType(db as never, { resourceType, snapshotId })
  const row = (family: (typeof families)[number]) => {
    const insert = {
      divisionArea:
        "INSERT INTO divisionAreas(snapshotId,id,divisionId,type) VALUES ('scope','area','division','district')",
      divisionBoundary:
        "INSERT INTO divisionBoundaries(snapshotId,id,type,leftDivisionId,rightDivisionId) VALUES ('scope','boundary','district','left','right')",
      division:
        "INSERT INTO divisions(snapshotId,id,class,hierarchies) VALUES ('scope','division','district','{}')",
      street:
        "INSERT INTO streets(snapshotId,id,version,status) VALUES ('scope','street',1,'active')",
      address:
        "INSERT INTO address2d(snapshotId,id,divisionSnapshotId) VALUES ('scope','address','division-scope')",
      place:
        "INSERT INTO places(snapshotId,id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth) VALUES ('scope','place','release',114,22,'2026-01','2026-01')",
    }[family]
    sqlite.exec(insert)
  }
  return { sqlite, db, queries, receipt, row, clean }
}

for (const family of families) {
  test(`${family} cleanup removes an authorised obsolete scope and deletes its receipt last`, async () => {
    const f = fixture()
    try {
      f.receipt(family)
      f.row(family)
      f.receipt(family, 'unrelated', 'other-scope')
      expect(await f.clean(family)).toBe(true)
      expect(
        f.sqlite.query(`SELECT scopeId FROM ${family}PublicationState`).all(),
      ).toEqual([{ scopeId: 'other-scope' }])
      const deletes = f.queries.filter(query => query.startsWith('delete from'))
      expect(deletes.at(-1)).toStartWith(`delete from "${family}PublicationState"`)
      expect(await f.clean(family)).toBe(false)
    } finally {
      f.sqlite.close()
    }
  })

  test(`${family} cleanup of a replaced revision preserves the current scope and interrupted deliveries`, async () => {
    const f = fixture()
    try {
      f.receipt(family, 'replacement')
      f.row(family)
      const before = f.sqlite.query('SELECT total_changes() AS n').get()
      expect(await f.clean(family)).toBe(false)
      expect(f.sqlite.query('SELECT total_changes() AS n').get()).toEqual(before)
      f.sqlite.exec(
        `UPDATE ${family}PublicationState SET preparedAt=NULL,status='publishing'`,
      )
      expect(await f.clean(family, 'replacement')).toBe(false)
      expect(f.queries.some(query => query.startsWith('delete from'))).toBe(false)
    } finally {
      f.sqlite.close()
    }
  })
}

for (const family of ['place', 'address', 'division'] as const) {
  test(`${family} cleanup preserves a scope selected by search`, async () => {
    const f = fixture()
    try {
      f.receipt(family)
      f.sqlite.exec(
        `INSERT INTO ${family}SearchScopes(scopeId,snapshotId) VALUES ('search-scope','obsolete')`,
      )
      expect(await f.clean(family)).toBe(false)
      expect(f.queries.some(query => query.startsWith('delete from'))).toBe(false)
    } finally {
      f.sqlite.close()
    }
  })
}

test('physical Address scope references protect Street and Division dependencies', async () => {
  const f = fixture()
  try {
    for (const family of ['street', 'division'] as const) f.receipt(family)
    f.row('street')
    f.sqlite.exec(
      "INSERT INTO address2d(snapshotId,id,divisionSnapshotId,streetSnapshotId,streetId) VALUES ('dependent','address','scope','scope','street')",
    )
    for (const family of ['street', 'division'] as const)
      expect(await f.clean(family)).toBe(false)
  } finally {
    f.sqlite.close()
  }
})

test.each(['obsolete', 'scope'])(
  'retained logical Place dependency %s does not pin Address or Division current rows',
  async logicalSnapshotId => {
    const f = fixture()
    try {
      for (const family of ['address', 'division'] as const) {
        f.receipt(family)
        f.row(family)
      }
      f.sqlite
        .query(
          "INSERT INTO places(snapshotId,id,releaseId,lng,lat,firstSeenMonth,lastSeenMonth,addressSnapshotId) VALUES ('dependent','place','release',114,22,'2026-01','2026-01',?)",
        )
        .run(logicalSnapshotId)
      const definition = JSON.stringify({
        level: 1,
        locales: [{ locale: 'en', name: 'Retained division' }],
      })
      f.sqlite
        .query(
          "INSERT INTO placesDivision(placeSnapshotId,placeId,divisionSnapshotId,divisionId,definition) VALUES ('dependent','place',?,'division',?)",
        )
        .run(logicalSnapshotId, definition)
      for (const family of ['address', 'division'] as const)
        expect(await f.clean(family)).toBe(true)
      expect(f.sqlite.query('SELECT addressSnapshotId FROM places').get()).toEqual({
        addressSnapshotId: logicalSnapshotId,
      })
      expect(
        f.sqlite
          .query('SELECT divisionSnapshotId,definition FROM placesDivision')
          .get(),
      ).toEqual({ divisionSnapshotId: logicalSnapshotId, definition })
    } finally {
      f.sqlite.close()
    }
  },
)

test.each(['replacement', 'new-token', 'interrupted', 'search', 'dependent'] as const)(
  'cleanup rechecks %s acquisition after its precheck',
  async race => {
    let acquired = false
    const family =
      race === 'search' || race === 'dependent' ? 'division' : 'divisionArea'
    const f = fixture((sqlite, query) => {
      if (!acquired && query.startsWith('delete from')) {
        acquired = true
        if (race === 'search')
          sqlite.exec(
            "INSERT INTO divisionSearchScopes(scopeId,snapshotId) VALUES ('search','obsolete')",
          )
        else if (race === 'dependent')
          sqlite.exec(
            "INSERT INTO address2d(snapshotId,id,divisionSnapshotId) VALUES ('dependent','address','scope')",
          )
        else
          sqlite.exec(
            `UPDATE divisionAreaPublicationState SET ${race === 'replacement' ? "snapshotId='replacement'" : race === 'new-token' ? "publicationToken='new-owner'" : "preparedAt=NULL,status='publishing'"}`,
          )
      }
    })
    try {
      f.receipt(family)
      f.row(family)
      expect(await f.clean(family)).toBe(false)
      expect(acquired).toBe(true)
      const table = family === 'division' ? 'divisions' : 'divisionAreas'
      expect(f.sqlite.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
        n: 1,
      })
      expect(
        f.sqlite.query(`SELECT count(*) AS n FROM ${family}PublicationState`).get(),
      ).toEqual({ n: 1 })
    } finally {
      f.sqlite.close()
    }
  },
)

test('failed cleanup rolls back companion deletions and preserves its receipt', async () => {
  const f = fixture()
  try {
    f.receipt('street')
    f.row('street')
    f.sqlite.exec(
      "INSERT INTO streetsI18n(snapshotId,streetId,locale,name) VALUES ('scope','street','en','Street')",
    )
    f.sqlite.exec(
      "CREATE TRIGGER fail_receipt BEFORE DELETE ON streetPublicationState BEGIN SELECT RAISE(ABORT,'injected cleanup failure'); END",
    )
    await expect(f.clean('street')).rejects.toThrow('injected cleanup failure')
    expect(f.sqlite.query('SELECT count(*) AS n FROM streetsI18n').get()).toEqual({
      n: 1,
    })
    expect(f.sqlite.query('SELECT count(*) AS n FROM streets').get()).toEqual({ n: 1 })
    expect(
      f.sqlite.query('SELECT count(*) AS n FROM streetPublicationState').get(),
    ).toEqual({ n: 1 })
    expect(
      f.queries
        .filter(query => query.startsWith('delete from'))
        .map(query => query.match(/^delete from "([^"]+)"/)?.[1]),
    ).toEqual([
      'streetChangelog',
      'streetGeometry',
      'streetNameChanges',
      'streetsAddress',
      'streetsI18n',
      'streets',
      'streetPublicationState',
    ])
  } finally {
    f.sqlite.close()
  }
})

test('snapshot-owned statistic links remain protected by retained period publication state', async () => {
  const f = fixture()
  try {
    f.sqlite.exec(
      "INSERT INTO statsPublicationState(datasetCode,referencePeriodCode,snapshotId,status) VALUES ('dataset','2021','obsolete','current')",
    )
    expect(await f.clean('divisionStatistic')).toBe(false)
    f.sqlite.exec('DELETE FROM statsPublicationState')
    expect(await f.clean('divisionStatistic')).toBe(true)
    expect(
      f.queries
        .filter(query => query.startsWith('delete from'))
        .map(query => query.match(/^delete from "([^"]+)"/)?.[1]),
    ).toEqual(['divisionStatistics'])
  } finally {
    f.sqlite.close()
  }
})

test('empty completed scopes can be cleaned, while an empty active delivery remains owned', async () => {
  const f = fixture()
  try {
    f.receipt('divisionArea')
    f.sqlite.exec(
      "UPDATE divisionAreaPublicationState SET status='publishing',preparedAt=NULL",
    )
    expect(await f.clean('divisionArea')).toBe(false)
    f.sqlite.exec("UPDATE divisionAreaPublicationState SET preparedAt='complete'")
    expect(await f.clean('divisionArea')).toBe(true)
    expect(
      f.sqlite.query('SELECT count(*) AS n FROM divisionAreaPublicationState').get(),
    ).toEqual({ n: 0 })
  } finally {
    f.sqlite.close()
  }
})

test('D1 cleanup submits every scope delete and its receipt together in one batch', async () => {
  const f = fixture()
  let batchCalls = 0
  let batchSize = 0
  try {
    f.receipt('street')
    f.row('street')
    const d1 = new Proxy(f.db, {
      get(db, key, receiver) {
        if (key !== 'batch') return Reflect.get(db, key, receiver)
        return async (statements: Array<{ run(): unknown }>) => {
          batchCalls += 1
          batchSize = statements.length
          return f.sqlite.transaction(() =>
            statements.map(statement => statement.run()),
          )()
        }
      },
    })
    expect(
      await cleanupSnapshotByResourceType(d1 as never, {
        resourceType: 'street',
        snapshotId: 'obsolete',
      }),
    ).toBe(true)
    expect(batchCalls).toBe(1)
    expect(batchSize).toBe(7)
    expect(f.sqlite.query('SELECT count(*) AS n FROM streets').get()).toEqual({ n: 0 })
    expect(
      f.sqlite.query('SELECT count(*) AS n FROM streetPublicationState').get(),
    ).toEqual({ n: 0 })
  } finally {
    f.sqlite.close()
  }
})
