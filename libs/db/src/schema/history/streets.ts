import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { i18nVersioning, jsonText, timestamps, versioning } from './_shared'

export const streetsVersions = sqliteTable(
  'streetsVersions',
  {
    id: text('id').notNull(),
    ...versioning,
    yearBuilt: jsonText('yearBuilt'),
    references: jsonText('references'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('streetsVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('streetsVersions_releaseSet_validity_idx').on(
      table.validFromReleaseSetId,
      table.validToReleaseSetId,
    ),
    index('streetsVersions_validity_idx').on(table.validFromMonth, table.validToMonth),
    index('streetsVersions_releaseId_idx').on(table.releaseId),
  ],
)

export const streetsVersionsI18n = sqliteTable(
  'streetsVersionsI18n',
  {
    streetId: text('streetId').notNull(),
    ...i18nVersioning,
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
      columns: [table.streetId, table.versionHash, table.locale],
    }),
    index('streetsVersionsI18n_locale_idx').on(table.locale),
    index('streetsVersionsI18n_name_idx').on(table.locale, table.name),
    index('streetsVersionsI18n_current_lookup_idx').on(
      table.streetId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
