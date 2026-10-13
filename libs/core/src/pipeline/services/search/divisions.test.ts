import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { retainedDivisionScopeId } from '../publication/scope'
import { buildDivisionSearchSyncSql } from './divisions'

test('search indexes exact retained inventories beside the latest lineage only after delivery completes', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE divisionPublicationState (
        scopeId TEXT PRIMARY KEY, snapshotId TEXT, status TEXT,
        preparedAt TEXT, publicationToken TEXT
      );
      CREATE TABLE divisions (scopeId TEXT, id TEXT, divisionCode TEXT, hierarchies TEXT);
      CREATE TABLE divisionsI18n (
        scopeId TEXT, divisionId TEXT, locale TEXT, name TEXT,
        nameAlts TEXT, nameRules TEXT
      );
      CREATE TABLE divisionSearchScopes (scopeId TEXT PRIMARY KEY, snapshotId TEXT);
    `)
    const retained = retainedDivisionScopeId('overture', 'august')
    for (const [snapshot, scope, name] of [
      ['october', 'saanseoi', 'Curated Central'],
      ['september', 'overture', 'September Central'],
      ['august', retained, 'August Central'],
    ] as const) {
      db.query('INSERT INTO divisionPublicationState VALUES (?, ?, ?, ?, ?)').run(
        scope,
        snapshot,
        'current',
        snapshot === 'august' ? null : 'verified',
        'delivery',
      )
      db.query('INSERT INTO divisions VALUES (?, ?, NULL, NULL)').run(scope, snapshot)
      db.query('INSERT INTO divisionsI18n VALUES (?, ?, ?, ?, NULL, NULL)').run(
        scope,
        snapshot,
        'en',
        name,
      )
    }
    const sync = () =>
      db.transaction(() => {
        for (const sql of buildDivisionSearchSyncSql([
          { scopeId: 'v0.2:saanseoi', snapshotId: 'october' },
          { scopeId: 'v0.2:overture', snapshotId: 'august' },
          { scopeId: 'v0.1:overture', snapshotId: 'september' },
        ]))
          db.exec(sql)
      })()
    const matches = () =>
      db
        .query(
          "SELECT scopeId, nameText FROM divisionSearchFts WHERE divisionSearchFts MATCH 'Central' ORDER BY scopeId",
        )
        .all()
    sync()
    expect(matches()).toEqual([
      { scopeId: 'v0.1:overture', nameText: 'September Central' },
      { scopeId: 'v0.2:saanseoi', nameText: 'Curated Central' },
    ])
    db.exec(
      "UPDATE divisionPublicationState SET preparedAt='verified' WHERE snapshotId='august'",
    )
    sync()
    expect(matches()).toEqual([
      { scopeId: 'v0.1:overture', nameText: 'September Central' },
      { scopeId: 'v0.2:overture', nameText: 'August Central' },
      { scopeId: 'v0.2:saanseoi', nameText: 'Curated Central' },
    ])
  } finally {
    db.close()
  }
})
