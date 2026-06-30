import { existsSync, globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database as SQLiteDatabase } from 'bun:sqlite'

import * as schema from '@repo/db/metaSchema'
import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'

const DEFAULT_LOCAL_D1_GLOB = resolve(
  dirname(import.meta.dir),
  '../../../../.local/d1/dev/v3/d1/miniflare-D1DatabaseObject/*.sqlite',
)

export function createLocalHarbourDb(sqlite: SQLiteDatabase) {
  const db = drizzle({
    client: sqlite,
    schema,
  })

  return db as typeof db & HarbourReadableDb & HarbourWritableDb
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

export function openLocalHarbourDb(explicitPath?: string) {
  const databasePath = resolveLocalD1Path(explicitPath)
  const sqlite = new SQLiteDatabase(databasePath)

  sqlite.exec('PRAGMA foreign_keys = ON;')

  return {
    sqlite,
    db: createLocalHarbourDb(sqlite),
    databasePath,
  }
}
