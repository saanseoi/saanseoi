import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const divisionsVersions = sqliteTable(
  'divisionsVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    regionCode: text('regionCode').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otGeometry: jsonText('otGeometryJson'),
    otPopulation: integer('otPopulation'),
    otVersion: text('otVersion'),
    otVersionHash: text('otVersionHash').notNull(),
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
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
      columns: [table.divisionId, table.versionHash, table.locale],
    }),
    index('divisionsVersionsI18n_locale_idx').on(table.locale),
    index('divisionsVersionsI18n_name_idx').on(table.locale, table.otName),
    index('divisionsVersionsI18n_current_lookup_idx').on(
      table.divisionId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
