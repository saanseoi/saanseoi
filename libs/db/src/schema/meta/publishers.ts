import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { primaryUuid, timestamps } from './_shared'

export const metaPublishers = sqliteTable(
  'publishers',
  {
    id: primaryUuid('id'),
    code: text('code').notNull().unique(),
    url: text('url'),
    contactUrl: text('contactUrl'),
    contactEmail: text('contactEmail'),
    contactPhone: text('contactPhone'),
    parentPublisherId: text('parentPublisherId'),
    versionHash: text('versionHash').notNull(),
    ...timestamps,
  },
  table => [
    foreignKey({
      columns: [table.parentPublisherId],
      foreignColumns: [table.id],
      name: 'publishers_parentPublisherId_publishers_id_fk',
    }).onDelete('restrict'),
    index('publishers_parentPublisherId_idx').on(table.parentPublisherId),
  ],
)

export const metaPublisherI18n = sqliteTable(
  'publisherI18n',
  {
    publisherId: text('publisherId')
      .notNull()
      .references(() => metaPublishers.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.publisherId, table.locale],
    }),
    index('publisherI18n_locale_idx').on(table.locale),
  ],
)
