import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const divisions = sqliteTable(
  'divisions',
  {
    snapshotId: text('snapshotId').notNull(),
    id: text('id').notNull(),
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
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
    index('divisions_level_idx').on(table.level),
    index('divisions_parentDivisionId_idx').on(table.parentDivisionId),
  ],
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    divisionId: text('divisionId').notNull(),
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
      columns: [table.snapshotId, table.divisionId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.divisionId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'divisionsI18n_snapshotId_divisionId_divisions_fk',
    }).onDelete('cascade'),
    index('divisionsI18n_locale_idx').on(table.snapshotId, table.locale),
    index('divisionsI18n_name_idx').on(table.snapshotId, table.locale, table.name),
  ],
)
