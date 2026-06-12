import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { datasets } from './shared'

export const divisions = sqliteTable(
  'divisions',
  {
    id: text('id').primaryKey(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otGeometryJson: text('otGeometryJson'),
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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    index('divisions_level_idx').on(table.level),
    index('divisions_parentDivisionId_idx').on(table.parentDivisionId),
  ],
)

export const divisionsVersions = sqliteTable(
  'divisionsVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    regionCode: text('regionCode').notNull(),
    datasetRecordId: text('datasetRecordId')
      .notNull()
      .references(() => datasets.id),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    level: integer('level').notNull(),
    type: text('type').notNull(),
    otGeometryJson: text('otGeometryJson'),
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
    updatedAt: text('updatedAt').notNull(),
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
    index('divisionsVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('divisionsVersions_datasetRecordId_idx').on(table.datasetRecordId),
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
    otNameVariantJson: text('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    otNameRulesJson: text('otNameRulesJson'),
    otLocalType: text('otLocalType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.divisionId, table.locale],
    }),
    index('divisionsI18n_locale_idx').on(table.locale),
    index('divisionsI18n_name_idx').on(table.locale, table.otName),
  ],
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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.divisionId, table.versionHash, table.locale],
    }),
    index('divisionsVersionsI18n_locale_idx').on(table.locale),
    index('divisionsVersionsI18n_name_idx').on(table.locale, table.otName),
  ],
)
