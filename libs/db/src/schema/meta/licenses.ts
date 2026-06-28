import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { primaryUuid, timestamps } from './_shared'

export const metaLicenses = sqliteTable('licenses', {
  id: primaryUuid('id'),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  url: text('url'),
  versionHash: text('versionHash').notNull(),
  ...timestamps,
})
