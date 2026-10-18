import { sql } from 'drizzle-orm'
import { check, index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import { canonicalStreetColumns, canonicalStreetI18nColumns } from '../shared'
import { historyEventConstraints } from './constraints'
import { historyI18nVersioning, historyVersioning } from './shared'

export const streets = sqliteTable(
  'streets',
  {
    ...canonicalStreetColumns(false),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['version', 'status']),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
    check('history_streets_version_positive', sql`${table.version} > 0`),
    index('streets_id_version_idx').on(table.id, table.version),
  ],
)

export const streetsI18n = sqliteTable(
  'streetsI18n',
  {
    ...canonicalStreetI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['name']),
    primaryKey({
      columns: [table.streetId, table.snapshotId, table.locale],
    }),
  ],
)
