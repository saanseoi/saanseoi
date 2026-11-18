import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { and, sql, currentSchema } from '@repo/db'
import { expect, test } from 'bun:test'
import { synchroniseAddressSubstringSearch } from '@repo/core/pipeline/services/addresses/substringIndex'
import { geocodingGramSelection } from './geocodingGram'
import { scoreAddress } from '../services/addressGeocoding'

const fixture = () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE addressPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT,status TEXT,preparedAt TEXT,publicationToken TEXT);
 CREATE TABLE address2dI18n(scopeId TEXT,addressId TEXT,locale TEXT,formattedAddress TEXT,buildingName TEXT,premisesName TEXT,streetName TEXT,buildingNumberFrom TEXT,buildingNumberTo TEXT,buildingNumberConnector TEXT,PRIMARY KEY(scopeId,addressId,locale));
 INSERT INTO addressPublicationState VALUES('scope','release','current','ready','token');`)
  const prepare = (statement: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(statement, args),
    all: async () => ({ results: sqlite.query(statement).all(...(values as never[])) }),
    run: async () => {
      sqlite.query(statement).run(...(values as never[]))
      return { success: true }
    },
  })
  const binding = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN')
      try {
        for (const statement of statements) await statement.run()
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { sqlite, binding, db: drizzle({ client: sqlite }) }
}
test('normalized Unicode postings preserve exact-scoring recall and use integer rowid lookup', async () => {
  const { sqlite, binding, db } = fixture()
  try {
    const values: [string, string | null][] = [
      ['Hollywood Road', 'Wisdom Centre'],
      ['Queen’s Road Central', 'Queen’s House'],
      ['香港荷李活道', null],
      ['１ ＨＯＬＬＹＷＯＯＤ ＲＯＡＤ', null],
      ['翠湖居第一期', '翠湖居第一期'],
      ['Different address', 'One International Finance Centre'],
      ['Foo  Bar Rd', 'Foo  Bar Hse'],
    ]
    const insert = sqlite.query(
      'INSERT INTO address2dI18n(scopeId,addressId,locale,formattedAddress,streetName,buildingName) VALUES(?,?,?,?,?,?)',
    )
    for (const [index, [text, building]] of values.entries())
      insert.run('scope', String(index), 'en', text, text, building)
    sqlite.exec(
      `WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<3000) INSERT INTO address2dI18n(scopeId,addressId,locale,formattedAddress,buildingName) SELECT 'scope','filler-'||x,'en','Unrelated Canton Avenue','Other Tower' FROM n`,
    )
    await synchroniseAddressSubstringSearch(binding as never)
    const names = currentSchema.address2dI18n
    for (const input of [
      'hollywood',
      'wood',
      'oa',
      '荷李',
      '李活道',
      '翠湖居第1期',
      'Queens Road',
      'extra One International Finance Centre listing',
      'Foo Bar House',
      'absentxyz',
    ]) {
      const selection = await geocodingGramSelection(
        db as never,
        ['release'],
        input,
        true,
      )
      const query = db
        .select({ id: sql<string>`${names.addressId}`.as('id') })
        .from(sql`${names} NOT INDEXED`)
        .where(and(sql`${names.scopeId}='scope'`, selection!))
        .toSQL()
      const found = new Set<string>()
      for (const row of sqlite.query(query.sql).all(...(query.params as never[])) as {
        id: string
      }[])
        found.add(row.id)
      for (const [index, [text, building]] of values.entries())
        if (
          scoreAddress(
            {
              i18n: {
                en: {
                  meta: null,
                  formattedAddress: text!,
                  streetName: text!,
                  buildingName: building,
                },
              },
            },
            input,
          )
        )
          expect({ input, index, found: found.has(String(index)) }).toEqual({
            input,
            index,
            found: true,
          })
      if (input === 'hollywood') {
        expect(found.size).toBeLessThan(10)
        const plan = sqlite
          .query('EXPLAIN QUERY PLAN ' + query.sql)
          .all(...(query.params as never[])) as { detail: string }[]
        expect(plan.some(row => /INTEGER PRIMARY KEY/.test(row.detail))).toBe(true)
        expect(plan.some(row => /SCAN address2dI18n/.test(row.detail))).toBe(false)
      }
    }
    const before = sqlite
      .query(
        "SELECT count(*) AS n FROM addressGeocodingFts WHERE addressGeocodingFts MATCH 'g00006800006f00006c'",
      )
      .get()
    expect(await synchroniseAddressSubstringSearch(binding as never)).toBe(0)
    expect(
      sqlite
        .query(
          "SELECT count(*) AS n FROM addressGeocodingFts WHERE addressGeocodingFts MATCH 'g00006800006f00006c'",
        )
        .get(),
    ).toEqual(before)
    sqlite.exec("UPDATE addressPublicationState SET publicationToken='changed'")
    await expect(
      geocodingGramSelection(db as never, ['release'], 'hollywood', true),
    ).rejects.toThrow('finalisation')
  } finally {
    sqlite.close()
  }
})
