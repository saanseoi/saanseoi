import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { primaryUuid, timestamps } from '../shared'

/** A reviewed canonical unit, synchronised from the metadata registry fixtures. */
export const metaUnits = sqliteTable('units', {
  id: primaryUuid('id'),
  code: text('code').notNull().unique(),
  /** Dimensional family, such as `area`, `population`, or `population-density`. */
  dimension: text('dimension').notNull(),
  /** Locale-neutral compact rendering, for example `km²` or `persons/km²`. */
  symbol: text('symbol').notNull(),
  versionHash: text('versionHash').notNull(),
  ...timestamps,
})

export const metaUnitsI18n = sqliteTable(
  'unitsI18n',
  {
    unitId: text('unitId')
      .notNull()
      .references(() => metaUnits.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  table => [primaryKey({ columns: [table.unitId, table.locale] })],
)
