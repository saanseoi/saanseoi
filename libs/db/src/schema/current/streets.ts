import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'
import { address2d } from './addresses'

export const streets = sqliteTable('streets', {
  id: text('id').primaryKey(),
  yearBuilt: jsonText('yearBuiltJson'),
  references: jsonText('referencesJson'),
  ...timestamps,
})

export const streetsI18n = sqliteTable(
  'streetsI18n',
  {
    streetId: text('streetId')
      .notNull()
      .references(() => streets.id),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    base: text('base'),
    designator: text('designator'),
    directionalPrefix: text('directionalPrefix'),
    directionalSuffix: text('directionalSuffix'),
    normalised: text('normalised'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.streetId, table.locale],
    }),
    index('streetsI18n_locale_idx').on(table.locale),
    index('streetsI18n_name_idx').on(table.locale, table.name),
  ],
)

export const streetsAddress = sqliteTable(
  'streetsAddress',
  {
    streetId: text('streetId')
      .notNull()
      .references(() => streets.id),
    addressId: text('addressId')
      .notNull()
      .references(() => address2d.id),
  },
  table => [
    primaryKey({
      columns: [table.streetId, table.addressId],
    }),
    index('streetsAddress_addressId_idx').on(table.addressId),
  ],
)
