import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import geographic from '../../../../fixtures/meta/divisionCodes/geographic.json'
import { validateDivisionCodeFixtures } from './meta'

test('populated category migration preserves assignments and rejects cross-class collisions', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE divisionCodes (
      domainCode TEXT NOT NULL, divisionCode TEXT NOT NULL, divisionClass TEXT NOT NULL,
      canonicalId TEXT NOT NULL, versionHash TEXT NOT NULL, createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL, PRIMARY KEY(domainCode, divisionClass, divisionCode))`)
    const insert = db.prepare('INSERT INTO divisionCodes VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const row of geographic.assignments)
      insert.run(
        'geographic',
        row.divisionCode,
        row.divisionClass,
        row.canonicalId,
        'hash',
        'now',
        'now',
      )
    db.exec(
      readFileSync(
        new URL(
          '../../migrations/meta/20260930060036_solid_kat_farrell/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(db.query('SELECT count(*) AS n FROM divisionCodes').get()).toEqual({
      n: geographic.assignments.length,
    })
    for (const [left, right] of [
      ['sar', 'district'],
      ['city', 'hamlet'],
      ['neighbourhood', 'microhood'],
      ['major_island', 'islet'],
    ]) {
      insert.run('geographic', 'TEST', left, `a-${left}`, 'hash', 'now', 'now')
      expect(() =>
        insert.run('geographic', 'TEST', right, `b-${right}`, 'hash', 'now', 'now'),
      ).toThrow()
    }
    expect(() =>
      insert.run('geographic', 'BAD', 'unknown', 'bad', 'hash', 'now', 'now'),
    ).toThrow()
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => validateDivisionCodeFixtures([geographic])).not.toThrow()
  } finally {
    db.close()
  }
})
