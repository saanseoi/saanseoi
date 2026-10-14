import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { orderMigrationViewDrops } from './order-migration-view-drops'

test('generated column removal preserves data and recreates its dependent view', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      "CREATE TABLE events(id TEXT, createdAt TEXT, updatedAt TEXT); INSERT INTO events VALUES ('a','created','updated'); CREATE VIEW historyEvents AS SELECT id,createdAt,updatedAt FROM events;",
    )
    db.exec(
      orderMigrationViewDrops(
        'ALTER TABLE events DROP COLUMN updatedAt;--> statement-breakpoint\nDROP VIEW historyEvents;--> statement-breakpoint\nCREATE VIEW historyEvents AS SELECT id,createdAt FROM events;',
      ),
    )
    expect(db.query('SELECT * FROM historyEvents').all()).toEqual([
      { id: 'a', createdAt: 'created' },
    ])
    expect(
      db
        .query('PRAGMA table_info(events)')
        .all()
        .map((row: any) => row.name),
    ).toEqual(['id', 'createdAt'])
  } finally {
    db.close()
  }
})

test('an unchanged view survives an underlying table rebuild', async () => {
  const { protectRebuiltTableViews } = await import('./order-migration-view-drops')
  const db = new Database(':memory:')
  try {
    db.exec(
      "CREATE TABLE names(id TEXT, name TEXT); INSERT INTO names VALUES ('a','Name'); CREATE VIEW historyEvents AS SELECT id,name FROM names;",
    )
    db.exec(
      protectRebuiltTableViews(
        'CREATE TABLE __new_names(id TEXT, name TEXT, meta TEXT); INSERT INTO __new_names(id,name) SELECT id,name FROM names; DROP TABLE "names"; ALTER TABLE __new_names RENAME TO names;',
        [{ name: 'historyEvents', definition: 'SELECT id,name FROM "names"' }],
      ),
    )
    expect(db.query('SELECT * FROM historyEvents').all()).toEqual([
      { id: 'a', name: 'Name' },
    ])
  } finally {
    db.close()
  }
})
