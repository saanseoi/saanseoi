import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { sourceRecordColumns, sourceRecordIndexes } from './_shared'

export const sourceOvertureDivisions = sqliteTable(
  'sourceOvertureDivisions',
  {
    ...sourceRecordColumns,
    regionCode: text('regionCode').notNull(),
    level: integer('level'),
    divisionType: text('divisionType'),
    subtype: text('subtype'),
    divisionClass: text('divisionClass'),
    population: integer('population'),
    version: integer('version'),
    wikidata: text('wikidata'),
    geometryJson: text('geometryJson'),
    bboxJson: text('bboxJson'),
    hierarchiesJson: text('hierarchiesJson'),
    cartographyJson: text('cartographyJson'),
    sourcesJson: text('sourcesJson'),
    rawPropertiesJson: text('rawPropertiesJson'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId],
    }),
    ...sourceRecordIndexes(table, 'sourceOvertureDivisions'),
    index('sourceOvertureDivisions_regionCode_idx').on(table.regionCode),
    index('sourceOvertureDivisions_level_idx').on(table.level),
    index('sourceOvertureDivisions_type_idx').on(table.divisionType),
  ],
)

export const sourceOvertureDivisionI18n = sqliteTable(
  'sourceOvertureDivisionI18n',
  {
    releaseId: text('releaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariantJson: text('nameVariantJson'),
    nameAlts: text('nameAlts'),
    nameRulesJson: text('nameRulesJson'),
    localType: text('localType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId, table.locale],
    }),
    index('sourceOvertureDivisionI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOvertureAddresses2d = sqliteTable(
  'sourceOvertureAddresses2d',
  {
    ...sourceRecordColumns,
    regionCode: text('regionCode').notNull(),
    version: integer('version'),
    geometryJson: text('geometryJson'),
    bboxJson: text('bboxJson'),
    streetName: text('streetName'),
    streetNumber: text('streetNumber'),
    sourcesJson: text('sourcesJson'),
    rawPropertiesJson: text('rawPropertiesJson'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId],
    }),
    ...sourceRecordIndexes(table, 'sourceOvertureAddresses2d'),
    index('sourceOvertureAddresses2d_regionCode_idx').on(table.regionCode),
    index('sourceOvertureAddresses2d_street_lookup_idx').on(
      table.regionCode,
      table.streetName,
      table.streetNumber,
    ),
  ],
)

export const sourceOvertureAddress2dI18n = sqliteTable(
  'sourceOvertureAddress2dI18n',
  {
    releaseId: text('releaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    streetName: text('streetName'),
    locality: text('locality'),
    region: text('region'),
    country: text('country'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId, table.locale],
    }),
    index('sourceOvertureAddress2dI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOverturePlaces = sqliteTable(
  'sourceOverturePlaces',
  {
    ...sourceRecordColumns,
    regionCode: text('regionCode').notNull(),
    addressSourceRecordId: text('addressSourceRecordId'),
    version: integer('version'),
    lng: real('lng'),
    lat: real('lat'),
    bboxJson: text('bboxJson'),
    operatingStatus: text('operatingStatus'),
    basicCategory: text('basicCategory'),
    taxonomyPrimary: text('taxonomyPrimary'),
    taxonomyHierarchyJson: text('taxonomyHierarchyJson'),
    taxonomyAlternatesJson: text('taxonomyAlternatesJson'),
    brandWikidata: text('brandWikidata'),
    websitesJson: text('websitesJson'),
    socialsJson: text('socialsJson'),
    emailsJson: text('emailsJson'),
    phonesJson: text('phonesJson'),
    addressesJson: text('addressesJson'),
    confidence: real('confidence'),
    sourcesJson: text('sourcesJson'),
    rawPropertiesJson: text('rawPropertiesJson'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId],
    }),
    ...sourceRecordIndexes(table, 'sourceOverturePlaces'),
    index('sourceOverturePlaces_regionCode_idx').on(table.regionCode),
    index('sourceOverturePlaces_basicCategory_idx').on(table.basicCategory),
    index('sourceOverturePlaces_taxonomyPrimary_idx').on(table.taxonomyPrimary),
    index('sourceOverturePlaces_addressSourceRecordId_idx').on(
      table.addressSourceRecordId,
    ),
  ],
)

export const sourceOverturePlaceI18n = sqliteTable(
  'sourceOverturePlaceI18n',
  {
    releaseId: text('releaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariantJson: text('nameVariantJson'),
    nameAlts: text('nameAlts'),
    brandName: text('brandName'),
    brandNameVariantJson: text('brandNameVariantJson'),
    brandNameAlts: text('brandNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId, table.locale],
    }),
    index('sourceOverturePlaceI18n_locale_idx').on(table.locale),
  ],
)
