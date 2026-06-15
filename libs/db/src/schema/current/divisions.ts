import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const divisions = sqliteTable(
  'divisions',
  {
    id: text('id').primaryKey(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    population: integer('population'),
    subtype: text('subtype'),
    class: text('class'),
    wikidata: text('wikidata'),
    hierarchy: jsonText('hierarchy'),
    parentDivisionId: text('parentDivisionId'),
    cartography: jsonText('cartography'),
    sources: jsonText('sources'),
    ...timestamps,
  },
  table => [
    index('divisions_level_idx').on(table.level),
    index('divisions_parentDivisionId_idx').on(table.parentDivisionId),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    divisionId: text('divisionId')
      .notNull()
      .references(() => divisions.id),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    nameRules: jsonText('nameRules'),
    localType: text('localType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.divisionId, table.locale],
    }),
    index('divisionsI18n_locale_idx').on(table.locale),
    index('divisionsI18n_name_idx').on(table.locale, table.name),
  ],
)
