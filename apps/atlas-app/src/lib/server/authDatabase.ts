import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createMetaDb } from '@repo/db/client'
import * as schema from '@repo/db/metaSchema'

export const createAuthDatabase = (d1: D1Database) =>
  drizzleAdapter(createMetaDb(d1), {
    provider: 'sqlite',
    // Drizzle's relations configuration does not expose the adapter's fullSchema.
    schema,
  })
