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
