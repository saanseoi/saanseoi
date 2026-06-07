import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'

export const createDb = (binding: D1Database) =>
  drizzle(binding, {
    schema,
  })

export type Database = ReturnType<typeof createDb>
