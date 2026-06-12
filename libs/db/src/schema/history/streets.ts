import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const streetsVersions = sqliteTable(
  'streetsVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    yearBuilt: jsonText('yearBuiltJson'),
    references: jsonText('referencesJson'),
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
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
