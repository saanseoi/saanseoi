import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationsRoot = resolve(import.meta.dir, '../migrations/meta')
const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
  .map(name => ({
    name,
    sql: readFileSync(resolve(migrationsRoot, name, 'migration.sql'), 'utf8'),
  }))

for (const family of ['meta', 'all']) {
  const dropSql = readFileSync(
    resolve(import.meta.dir, `../scripts/sql/drop-${family}-db.sql`),
    'utf8',
  )

  for (const [index, migration] of migrations.entries()) {
    test(`${family} reset permits Meta replay after ${migration.name}`, () => {
      const sqlite = new Database(':memory:')
      try {
        for (const previous of migrations.slice(0, index + 1)) {
          sqlite.exec(previous.sql)
        }
        sqlite.exec(dropSql)
        expect(
          sqlite
            .query(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all(),
        ).toEqual([])
        for (const next of migrations) {
          sqlite.exec(next.sql)
        }
      } finally {
        sqlite.close()
      }
    })
  }
}

test('local auth seed restores linked identities after a Meta reset without credentials', () => {
  const sqlite = new Database(':memory:')
  const seed = readFileSync(
    resolve(import.meta.dir, '../../../fixtures/local/auth.sql'),
    'utf8',
  )
  const drop = readFileSync(
    resolve(import.meta.dir, '../scripts/sql/drop-meta-db.sql'),
    'utf8',
  )
  try {
    for (let reset = 0; reset < 2; reset++) {
      for (const migration of migrations) sqlite.exec(migration.sql)
      sqlite.exec(seed)
      sqlite.exec(seed)
      expect(sqlite.query('SELECT email, role FROM user').all()).toEqual([
        { email: 'm@type.hk', role: 'user' },
      ])
      expect(
        sqlite
          .query(
            'SELECT provider_id, email FROM account JOIN user ON user.id = account.user_id ORDER BY provider_id',
          )
          .all(),
      ).toEqual([
        { provider_id: 'github', email: 'm@type.hk' },
        { provider_id: 'google', email: 'm@type.hk' },
      ])
      expect(
        sqlite
          .query(
            'SELECT id FROM account WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL OR password IS NOT NULL',
          )
          .all(),
      ).toEqual([])
      expect(sqlite.query('SELECT id FROM session').all()).toEqual([])
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      sqlite.exec(drop)
    }
  } finally {
    sqlite.close()
  }
})
