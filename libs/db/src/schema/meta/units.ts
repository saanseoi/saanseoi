import type { MetaTranslation } from './i18n'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, primaryUuid, timestamps } from '../shared'

/** A reviewed canonical unit, synchronised from the metadata registry fixtures. */
export const metaUnits = sqliteTable('units', {
  id: primaryUuid('id'),
  code: text('code').notNull().unique(),
  /** Dimensional family, such as `area`, `population`, or `population-density`. */
  dimension: text('dimension').notNull(),
  /** Locale-neutral compact rendering, for example `km²` or `persons/km²`. */
  symbol: text('symbol').notNull(),
  i18n: jsonText<MetaTranslation[]>('i18n').notNull().default([]),
  versionHash: text('versionHash').notNull(),
  ...timestamps,
})
