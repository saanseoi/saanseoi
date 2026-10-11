import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../core/src/testing/metaFixtures'
import geographic from '../../../../fixtures/meta/divisionCodes/geographic.json'
import { validateDivisionCodeFixtures } from './meta'

test('division code baseline retains assignments and rejects cross-class collisions', () => {
  const db = new Database(':memory:')
  try {
    db.exec(loadMigrationSql(resolve(import.meta.dir, '../../migrations'), ['meta']))
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
