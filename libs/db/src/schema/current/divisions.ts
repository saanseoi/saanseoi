import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const divisions = sqliteTable(
  'divisions',
  {
    id: text('id').primaryKey(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otGeometry: jsonText('otGeometryJson'),
    otPopulation: integer('otPopulation'),
    otVersion: text('otVersion'),
    otSubtype: text('otSubtype'),
    otClass: text('otClass'),
    otWikidata: text('otWikidata'),
    otHierarchy: jsonText('otHierarchyJson'),
    hierarchy: jsonText('hierarchyJson'),
    parentDivisionId: text('parentDivisionId'),
    otCartography: jsonText('otCartographyJson'),
    otBbox: jsonText('otBboxJson'),
    sources: jsonText('sourcesJson'),
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
    otName: text('otName'),
    otNameVariant: jsonText('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    otNameRules: jsonText('otNameRulesJson'),
    otLocalType: text('otLocalType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.divisionId, table.locale],
    }),
    index('divisionsI18n_locale_idx').on(table.locale),
    index('divisionsI18n_name_idx').on(table.locale, table.otName),
  ],
)
