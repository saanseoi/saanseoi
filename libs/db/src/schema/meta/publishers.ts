import type { MetaTranslation } from './i18n'
import { foreignKey, index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, primaryUuid, timestamps } from '../shared'

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
    i18n: jsonText<MetaTranslation[]>('i18n').notNull().default([]),
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
