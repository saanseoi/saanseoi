import { index, primaryKey, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

import { i18nVersioning, jsonText, timestamps, versioning } from './_shared'

export const divisionsVersions = sqliteTable(
  'divisionsVersions',
  {
    id: text('id').notNull(),
    regionCode: text('regionCode').notNull(),
    ...versioning,
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
      columns: [table.id, table.versionHash],
    }),
    index('divisionsVersions_current_lookup_idx').on(
      table.regionCode,
      table.id,
      table.isCurrent,
    ),
    index('divisionsVersions_releaseSet_validity_idx').on(
      table.regionCode,
      table.validFromReleaseSetId,
      table.validToReleaseSetId,
    ),
    index('divisionsVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('divisionsVersions_releaseId_idx').on(table.releaseId),
  ],
)

export const divisionsVersionsI18n = sqliteTable(
  'divisionsVersionsI18n',
  {
    divisionId: text('divisionId').notNull(),
    ...i18nVersioning,
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
      columns: [table.divisionId, table.versionHash, table.locale],
    }),
    index('divisionsVersionsI18n_locale_idx').on(table.locale),
    index('divisionsVersionsI18n_name_idx').on(table.locale, table.name),
    index('divisionsVersionsI18n_current_lookup_idx').on(
      table.divisionId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
