import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { preRetireAddressSources } from './addressSourceRetirement.ts'

const columns = [
  'sourceRecordId',
  'versionHash',
  'releaseId',
  'validFromRelease',
  'validToRelease',
  'isCurrent',
  'rawProperties',
  'sourceGeometry',
  'sources',
  'createdAt',
  'updatedAt',
]
const closure = {
  sql: 'UPDATE hkgovAlsAddresses2d SET isCurrent = 0, validToRelease = ?, updatedAt = ? WHERE isCurrent = 1 AND releaseId <> ?',
  params: ['new-version', 'now', 'new-release'],
}
const insertSql = `INSERT INTO "hkgovAlsAddresses2d" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(sourceRecordId,versionHash) DO UPDATE SET releaseId=excluded.releaseId,isCurrent=1,validToRelease=NULL,updatedAt=excluded.updatedAt`
const statements = [
  {
    sql: 'UPDATE hkgovAlsAddresses2d SET isCurrent = 0, validToRelease = ?, updatedAt = ? WHERE sourceRecordId = ? AND isCurrent = 1 AND versionHash <> ?',
    params: ['new-version', 'now', 'row-0', 'changed'],
  },
  {
    sql: insertSql,
    params: [
      'row-0',
      'changed',
      'new-release',
      'new-version',
      null,
      1,
      '{}',
      null,
      '[]',
      'now',
      'now',
    ],
  },
  {
    sql: insertSql,
    params: [
      'row-1',
      'same',
      'new-release',
      'new-version',
      null,
      1,
      '{}',
      null,
      '[]',
      'now',
      'now',
    ],
  },
  closure,
]
function database() {
  const db = new Database(':memory:')
  db.exec(
    `CREATE TABLE hkgovAlsAddresses2d (${columns.map(column => `${column} ${column === 'isCurrent' ? 'INTEGER' : 'TEXT'}`).join(',')}, PRIMARY KEY(sourceRecordId,versionHash))`,
  )
  db.transaction(() => {
    for (let index = 0; index < 2500; index++)
      db.query(insertSql).run(
        `row-${index}`,
        'same',
        'old-release',
        'old-version',
        null,
        1,
        '{}',
        null,
        '[]',
        'old-time',
        'old-time',
      )
  })()
  return db
}

for (const interrupted of [false, true])
  test(`bounded retirement preserves sealed upsert results after interruption=${interrupted}`, async () => {
    const expected = database()
    const actual = database()
    try {
      for (const statement of statements)
        expected.query(statement.sql).run(...statement.params)
      let interrupt = interrupted
      const counts: number[] = []
      const plans: string[] = []
      const query = async (sql: string) => {
        if (sql.includes('rowid>')) {
          const plan = actual.query(`EXPLAIN QUERY PLAN ${sql}`).all() as {
            detail: string
          }[]
          plans.push(...plan.map(row => row.detail))
        }
        const rows = actual.query(sql).all() as Record<string, unknown>[]
        counts.push(rows.length)
        if (interrupt) {
          interrupt = false
          throw new Error('lost acknowledgement')
        }
        return rows.reverse()
      }
      if (interrupted)
        await expect(preRetireAddressSources(statements, query)).rejects.toThrow(
          'lost acknowledgement',
        )
      await preRetireAddressSources(statements, query)
      for (const statement of statements)
        actual.query(statement.sql).run(...statement.params)
      expect(Math.max(...counts)).toBe(1024)
      expect(
        plans.some(detail => detail.includes('INTEGER PRIMARY KEY (rowid>?)')),
      ).toBe(true)
      expect(plans.some(detail => detail.startsWith('SCAN hkgovAlsAddresses2d'))).toBe(
        false,
      )
      expect(
        actual
          .query(
            'SELECT * FROM hkgovAlsAddresses2d ORDER BY sourceRecordId,versionHash',
          )
          .all(),
      ).toEqual(
        expected
          .query(
            'SELECT * FROM hkgovAlsAddresses2d ORDER BY sourceRecordId,versionHash',
          )
          .all(),
      )
    } finally {
      expected.close()
      actual.close()
    }
  })

test('retirement rejects unrelated statements and inconsistent release metadata before writes', async () => {
  let calls = 0
  const query = async () => {
    calls++
    return []
  }
  await expect(
    preRetireAddressSources(
      [{ sql: 'DELETE FROM hkgovAlsAddresses2d', params: [] }, closure],
      query,
    ),
  ).rejects.toThrow('uniform publisher')
  const statement = statements[1]
  if (!statement) throw new Error('Address retirement test fixture is incomplete')
  await expect(
    preRetireAddressSources(
      [statement, { ...closure, params: ['new-version', 'now', 'other-release'] }],
      query,
    ),
  ).rejects.toThrow('uniform publisher')
  expect(calls).toBe(0)
})
