import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

test('generated binding migration preserves existing roots without inventing release bindings', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      "CREATE TABLE apiFieldProvenance (apiReleaseSetId TEXT PRIMARY KEY, definitionId TEXT NOT NULL); INSERT INTO apiFieldProvenance VALUES ('retained-release', 'retained-definition')",
    )
    db.exec(
      readFileSync(
        new URL(
          '../migrations/meta/20261004081816_gorgeous_black_panther/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(db.query('SELECT * FROM apiFieldProvenance').get()).toEqual({
      apiReleaseSetId: 'retained-release',
      definitionId: 'retained-definition',
      binding: null,
    })
    const binding = JSON.stringify({
      apiReleaseSetId: 'new-release',
      definitionId: 'new-definition',
    })
    db.query('INSERT INTO apiFieldProvenance VALUES (?, ?, ?)').run(
      'new-release',
      'new-definition',
      binding,
    )
    expect(
      db
        .query('SELECT binding FROM apiFieldProvenance WHERE apiReleaseSetId = ?')
        .get('new-release'),
    ).toEqual({ binding })
  } finally {
    db.close()
  }
})
