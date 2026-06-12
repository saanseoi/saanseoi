import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema'
import * as currentSchema from './schema/current'
import * as historySchema from './schema/history'
import * as metaSchema from './schema/meta'
import * as sourceSchema from './schema/source'

const createBoundDb = <TSchema extends Record<string, unknown>>(
  binding: D1Database,
  boundSchema: TSchema,
) =>
  drizzle(binding, {
    schema: boundSchema,
  })

export const createDb = (binding: D1Database) => createBoundDb(binding, schema)

export const createMetaDb = (binding: D1Database) => createBoundDb(binding, metaSchema)

export const createCurrentDb = (binding: D1Database) =>
  createBoundDb(binding, currentSchema)

export const createHistoryDb = (binding: D1Database) =>
  createBoundDb(binding, historySchema)

export const createSourceDb = (binding: D1Database) =>
  createBoundDb(binding, sourceSchema)

export type Database = ReturnType<typeof createDb>
export type MetaDatabase = ReturnType<typeof createMetaDb>
export type ApiCurrentDatabase = ReturnType<typeof createCurrentDb>
export type CurrentDatabase = ApiCurrentDatabase
export type HistoryDatabase = ReturnType<typeof createHistoryDb>
export type SourceDatabase = ReturnType<typeof createSourceDb>
