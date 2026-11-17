import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyAddressScopeMigration,
  planAddressScopeMigration,
} from './migrate-address-scope'

/** Initialise the actual pre-migration schema, excluding only this contract's new migration. */
function fixture(family: 'current' | 'history'): Database {
  const db = new Database(':memory:')
  const dir = new URL(`../libs/db/migrations/${family}/`, import.meta.url)
  for (const name of readdirSync(dir)
    .filter(name => !name.startsWith('2026102202'))
    .sort())
    db.exec(readFileSync(new URL(`${name}/migration.sql`, dir), 'utf8'))
  db.exec(`CREATE TABLE retainedEvidence (id TEXT PRIMARY KEY, payload TEXT);
    INSERT INTO retainedEvidence VALUES ('source-1','{"publisher":"unchanged"}');`)
  for (const scope of [
    'site',
    'complex',
    'unknown',
    'building',
    'phase',
    'section',
    'floor',
    'unit',
    'unit_portion',
  ]) {
    if (family === 'current')
      db.query(
        "INSERT INTO address2d(scopeId,divisionSnapshotId,id,granularity,parentAddressId,sources,createdAt) VALUES('scope','division',?,?,?,'[]','2026-01-01')",
      ).run(scope, scope, scope === 'unit' ? 'building' : null)
    else
      for (const snapshot of ['snapshot-a', 'snapshot-b'])
        db.query(
          "INSERT INTO address2d(snapshotId,id,granularity,parentAddressId,versionHash,sources,createdAt) VALUES(?,?,?,?,'retained-hash','[]','2026-01-01')",
        ).run(snapshot, scope, scope, scope === 'unit' ? 'building' : null)
  }
  if (family === 'history')
    db.exec(
      "INSERT INTO address2d(snapshotId,id,operation,granularity,versionHash) VALUES('snapshot-deleted','retired','delete',NULL,NULL)",
    )
  return db
}

for (const family of ['current', 'history'] as const) {
  test(`${family}: generated migration and data conversion preserve IDs, history and replay`, () => {
    const db = fixture(family),
      dir = mkdtempSync(join(tmpdir(), 'address-scope-test-'))
    try {
      const plan = planAddressScopeMigration(db, family)
      expect(plan.changeCount).toBe(family === 'current' ? 2 : 4)
      expect(plan.beforeCounts.site).toBe(family === 'current' ? 1 : 2)
      expect(plan.afterCounts.premises).toBe(family === 'current' ? 2 : 4)
      expect(applyAddressScopeMigration(db, plan, join(dir, 'before.sqlite'))).toBe(
        plan.changeCount,
      )
      expect(applyAddressScopeMigration(db, plan, join(dir, 'before.sqlite'))).toBe(0)
      expect(
        db
          .query("SELECT DISTINCT scope,premisesType FROM address2d WHERE id='complex'")
          .all(),
      ).toEqual([{ scope: 'premises', premisesType: 'complex' }])
      expect(
        db
          .query("SELECT DISTINCT scope,premisesType FROM address2d WHERE id='site'")
          .all(),
      ).toEqual([{ scope: 'premises', premisesType: 'site' }])
      expect(
        db
          .query("SELECT DISTINCT parentAddressId,scope FROM address2d WHERE id='unit'")
          .all(),
      ).toEqual([{ parentAddressId: 'building', scope: 'unit' }])
      expect(db.query('SELECT count(*) AS n FROM address2d').get()).toEqual({
        n: plan.rowCount,
      })
      expect(db.query('SELECT payload FROM retainedEvidence').get()).toEqual({
        payload: '{"publisher":"unchanged"}',
      })
      if (family === 'history') {
        expect(
          db
            .query(
              "SELECT scope,premisesType,versionHash FROM address2d WHERE operation='delete'",
            )
            .get(),
        ).toEqual({ scope: null, premisesType: null, versionHash: null })
        expect(
          db
            .query(
              "SELECT DISTINCT versionHash FROM address2d WHERE operation='upsert'",
            )
            .all(),
        ).toEqual([{ versionHash: 'retained-hash' }])
      }
      const before = new Database(join(dir, 'before.sqlite'), { readonly: true })
      expect(
        before
          .query("SELECT DISTINCT granularity FROM address2d WHERE id='complex'")
          .get(),
      ).toEqual({ granularity: 'complex' })
      before.close()
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.query('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      })
      expect(db.query('SELECT count(*) AS n FROM d1_migrations').get()).toEqual({
        n: 1,
      })
    } finally {
      db.close()
      rmSync(dir, { recursive: true })
    }
  })
}

test('stale content and invalid classification stop before any schema or data mutation', () => {
  const db = fixture('current'),
    dir = mkdtempSync(join(tmpdir(), 'address-scope-stale-'))
  try {
    const plan = planAddressScopeMigration(db, 'current')
    db.exec("UPDATE address2d SET parentAddressId='new-parent' WHERE id='unit'")
    expect(() =>
      applyAddressScopeMigration(db, plan, join(dir, 'before.sqlite')),
    ).toThrow('Stale')
    expect(existsSync(join(dir, 'before.sqlite'))).toBe(false)
    db.exec("UPDATE address2d SET granularity='unrecognised' WHERE id='site'")
    expect(() => planAddressScopeMigration(db, 'current')).toThrow('Unrecognised')
  } finally {
    db.close()
    rmSync(dir, { recursive: true })
  }
})

test('a data write failure rolls the schema rename and all classification changes back', () => {
  const db = fixture('current'),
    dir = mkdtempSync(join(tmpdir(), 'address-scope-rollback-'))
  try {
    db.exec(
      "CREATE TRIGGER refuse_scope BEFORE UPDATE ON address2d BEGIN SELECT RAISE(ABORT, 'fixture writer fence'); END",
    )
    const plan = planAddressScopeMigration(db, 'current')
    expect(() =>
      applyAddressScopeMigration(db, plan, join(dir, 'before.sqlite')),
    ).toThrow('fixture writer fence')
    expect(
      db.query("SELECT granularity FROM address2d WHERE id='complex'").get(),
    ).toEqual({ granularity: 'complex' })
    expect(
      (db.query('PRAGMA table_info(address2d)').all() as Array<{ name: string }>).map(
        row => row.name,
      ),
    ).not.toContain('scope')
  } finally {
    db.close()
    rmSync(dir, { recursive: true })
  }
})
