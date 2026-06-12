import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import { createLocalHarbourDb } from '../../testing/local-db'
import { resolveShardForKindRegionYear } from './meta-repository'

function createShardLookupDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE dataShards (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      regionCode TEXT,
      year TEXT,
      environment TEXT NOT NULL,
      databaseName TEXT NOT NULL,
      databaseId TEXT NOT NULL,
      bindingName TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
  }
}

describe('resolveShardForKindRegionYear', () => {
  test('returns the closest active shard when an exact year mapping is unavailable', async () => {
    const { sqlite, db } = createShardLookupDb()

    sqlite.exec(`
      INSERT INTO dataShards (
        id, kind, regionCode, year, environment, databaseName, databaseId, bindingName, status
      ) VALUES (
        'history-hk-2026-preview',
        'history',
        'hk',
        '2026',
        'preview',
        'ss-history-hk-2026-db-preview',
        'db-history-hk-2026-preview',
        'DB_HISTORY_HK_2026',
        'active'
      );
    `)

    const shard = await resolveShardForKindRegionYear(
      db as never,
      'history',
      'preview',
      'hk',
      '2025',
    )

    expect(shard).toEqual({
      id: 'history-hk-2026-preview',
      bindingName: 'DB_HISTORY_HK_2026',
      databaseName: 'ss-history-hk-2026-db-preview',
    })
  })
})
