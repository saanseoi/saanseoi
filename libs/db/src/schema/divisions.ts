import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { datasets } from './shared'

export const divisions = sqliteTable(
  'divisions',
  {
    id: text('id').primaryKey(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otPopulation: integer('otPopulation'),
    otVersion: text('otVersion'),
    otSubtype: text('otSubtype'),
    otClass: text('otClass'),
    otWikidata: text('otWikidata'),
    otHierarchyJson: text('otHierarchyJson'),
    hierarchyJson: text('hierarchyJson'),
    parentDivisionId: text('parentDivisionId'),
    otCartographyJson: text('otCartographyJson'),
    otBboxJson: text('otBboxJson'),
    sourcesJson: text('sourcesJson'),
  },
  table => ({
    levelIdx: index('divisions_level_idx').on(table.level),
    parentIdx: index('divisions_parentDivisionId_idx').on(table.parentDivisionId),
  }),
)

export const divisionsVersions = sqliteTable(
  'divisionsVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    regionCode: text('regionCode').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otPopulation: integer('otPopulation'),
    otVersion: text('otVersion'),
    otVersionHash: text('otVersionHash').notNull(),
    otSubtype: text('otSubtype'),
    otClass: text('otClass'),
    otWikidata: text('otWikidata'),
    otHierarchyJson: text('otHierarchyJson'),
    hierarchyJson: text('hierarchyJson'),
    parentDivisionId: text('parentDivisionId'),
    otCartographyJson: text('otCartographyJson'),
    otBboxJson: text('otBboxJson'),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.id, table.versionHash],
    }),
    currentLookupIdx: index('divisionsVersions_current_lookup_idx').on(
      table.regionCode,
      table.id,
      table.isCurrent,
    ),
    validityIdx: index('divisionsVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    datasetIdx: index('divisionsVersions_datasetId_idx').on(table.datasetId),
  }),
)

export const divisionsI18n = sqliteTable(
  'divisionsI18n',
  {
    divisionId: text('divisionId')
      .notNull()
      .references(() => divisions.id),
    locale: text('locale').notNull(),
    otName: text('otName'),
    otNameVariantJson: text('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    otNameRulesJson: text('otNameRulesJson'),
    otLocalType: text('otLocalType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.divisionId, table.locale],
    }),
    localeIdx: index('divisionsI18n_locale_idx').on(table.locale),
    nameIdx: index('divisionsI18n_name_idx').on(table.locale, table.otName),
  }),
)

export const divisionsVersionsI18n = sqliteTable(
  'divisionsVersionsI18n',
  {
    divisionId: text('divisionId').notNull(),
    versionHash: text('versionHash').notNull(),
    locale: text('locale').notNull(),
    otName: text('otName'),
    otNameVariantJson: text('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    otNameRulesJson: text('otNameRulesJson'),
    otLocalType: text('otLocalType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.divisionId, table.versionHash, table.locale],
    }),
    localeIdx: index('divisionsVersionsI18n_locale_idx').on(table.locale),
    nameIdx: index('divisionsVersionsI18n_name_idx').on(table.locale, table.otName),
  }),
)
