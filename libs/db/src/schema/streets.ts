import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { address2d } from './addresses'
import { datasets } from './shared'

export const streets = sqliteTable('streets', {
  id: text('id').primaryKey(),
  yearBuiltJson: text('yearBuiltJson'),
  referencesJson: text('referencesJson'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
})

export const streetsVersions = sqliteTable(
  'streetsVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    yearBuiltJson: text('yearBuiltJson'),
    referencesJson: text('referencesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('streetsVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('streetsVersions_validity_idx').on(table.validFromMonth, table.validToMonth),
    index('streetsVersions_datasetId_idx').on(table.datasetId),
  ],
)

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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.streetId, table.locale],
    }),
    index('streetsI18n_locale_idx').on(table.locale),
    index('streetsI18n_name_idx').on(table.locale, table.name),
  ],
)

export const streetsVersionsI18n = sqliteTable(
  'streetsVersionsI18n',
  {
    streetId: text('streetId').notNull(),
    versionHash: text('versionHash').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    base: text('base'),
    designator: text('designator'),
    directionalPrefix: text('directionalPrefix'),
    directionalSuffix: text('directionalSuffix'),
    normalised: text('normalised'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.streetId, table.versionHash, table.locale],
    }),
    index('streetsVersionsI18n_locale_idx').on(table.locale),
    index('streetsVersionsI18n_name_idx').on(table.locale, table.name),
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
