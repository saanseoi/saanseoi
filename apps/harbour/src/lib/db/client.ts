import { existsSync } from 'node:fs'
import { globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database as SQLiteDatabase } from 'bun:sqlite'

import * as schema from '@repo/db/schema'

const DEFAULT_LOCAL_D1_GLOB = resolve(
  dirname(import.meta.dir),
  '../../../../.local/d1/dev/v3/d1/miniflare-D1DatabaseObject/*.sqlite',
)

export type HarbourDb = ReturnType<typeof createHarbourDb>

export function createHarbourDb(sqlite: SQLiteDatabase) {
  return drizzle({
    client: sqlite,
    schema,
  })
}

export function resolveLocalD1Path(explicitPath?: string) {
  if (explicitPath) {
    return explicitPath
  }

  const matches = globSync(DEFAULT_LOCAL_D1_GLOB).filter(
    candidate => !candidate.endsWith('/metadata.sqlite') && existsSync(candidate),
  )

  const selected = matches.sort()[0]

  if (!selected) {
    throw new Error(
      'Could not find a local D1 sqlite file.\n\nRun `bun run db:migration:run:local` first or pass `--db`.',
    )
  }

  return selected
}

export function openLocalD1(explicitPath?: string) {
  const databasePath = resolveLocalD1Path(explicitPath)
  const sqlite = new SQLiteDatabase(databasePath)

  sqlite.exec('PRAGMA foreign_keys = ON;')

  return {
    sqlite,
    db: createHarbourDb(sqlite),
    databasePath,
  }
}
