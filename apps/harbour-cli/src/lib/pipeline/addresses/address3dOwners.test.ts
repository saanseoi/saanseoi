import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { validateAddress3dOwners } from './address3dOwners'

type Reference = { address2dId: string; unresolvedSectionIds: string[] }
async function* references(rows: Reference[]) {
  yield* rows
}

async function fixture(
  work: (
    db: Database,
    validate: (rows: Reference[]) => Promise<number[]>,
  ) => Promise<void>,
) {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE address2d(snapshotId TEXT, id TEXT, parentAddressId TEXT)')
  try {
    await work(db, async rows => {
      const sizes: number[] = []
      await validateAddress3dOwners(
        'selected',
        references(rows),
        async (target, statements) => {
          expect(target).toBe('current')
          return statements.flatMap(statement => {
            expect(statement.sql.startsWith('SELECT ')).toBe(true)
            expect(statement.params.length).toBeLessThanOrEqual(100)
            sizes.push(statement.params.length)
            return db
              .query(statement.sql)
              .all(...(statement.params as string[])) as Record<string, unknown>[]
          })
        },
      )
      return sizes
    })
  } finally {
    db.close()
  }
}

test('198 owners use two full-budget queries and empty input performs no reads', () =>
  fixture(async (db, validate) => {
    const rows = Array.from({ length: 198 }, (_, i) => ({
      address2dId: `owner-${i}`,
      unresolvedSectionIds: [],
    }))
    for (const row of rows)
      db.query('INSERT INTO address2d VALUES (?,?,NULL)').run(
        'selected',
        row.address2dId,
      )
    expect(await validate(rows)).toEqual([100, 100])
    expect(await validate([])).toEqual([])
  }))

test('one owner with 200 sections streams across boundaries without losing relationships', () =>
  fixture(async (db, validate) => {
    db.exec("INSERT INTO address2d VALUES ('selected','owner',NULL)")
    const sections = Array.from({ length: 200 }, (_, i) => `section-${i}`)
    for (const id of sections)
      db.query('INSERT INTO address2d VALUES (?,?,?)').run('selected', id, 'owner')
    expect(
      await validate([{ address2dId: 'owner', unresolvedSectionIds: sections }]),
    ).toEqual([100, 100, 4])
    db.exec("UPDATE address2d SET parentAddressId='wrong' WHERE id='section-199'")
    await expect(
      validate([{ address2dId: 'owner', unresolvedSectionIds: sections }]),
    ).rejects.toThrow('section-199 has no reviewed parent relationship')
  }))

test('missing, wrong-snapshot and duplicate owners fail closed', () =>
  fixture(async (db, validate) => {
    const rows = [{ address2dId: "O'Brien", unresolvedSectionIds: [] }]
    await expect(validate(rows)).rejects.toThrow('owner')
    db.query('INSERT INTO address2d VALUES (?,?,NULL)').run('other', "O'Brien")
    await expect(validate(rows)).rejects.toThrow('owner')
    db.query('INSERT INTO address2d VALUES (?,?,NULL)').run('selected', "O'Brien")
    expect(await validate(rows)).toEqual([2])
    db.query('INSERT INTO address2d VALUES (?,?,NULL)').run('selected', "O'Brien")
    await expect(validate(rows)).rejects.toThrow('owner')
  }))

test('section checks retain exact parent matching and reject cross-owner membership', () =>
  fixture(async (db, validate) => {
    db.exec(
      "INSERT INTO address2d VALUES ('selected','a',NULL),('selected','b',NULL),('other','child','a'),('selected','child','b')",
    )
    await expect(
      validate([{ address2dId: 'a', unresolvedSectionIds: ['child'] }]),
    ).rejects.toThrow('section child')
    expect(
      await validate([{ address2dId: 'b', unresolvedSectionIds: ['child', 'child'] }]),
    ).toEqual([3])
    await expect(
      validate([
        { address2dId: 'b', unresolvedSectionIds: ['child'] },
        { address2dId: 'a', unresolvedSectionIds: ['child'] },
      ]),
    ).rejects.toThrow('section child')
    db.exec("INSERT INTO address2d VALUES ('selected','child','b')")
    await expect(
      validate([{ address2dId: 'b', unresolvedSectionIds: ['child'] }]),
    ).rejects.toThrow('section child')
  }))
