import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import {
  jsonText,
  sourceRecordColumns,
  sourceRecordIndexes,
  sourceVersionIndexes,
  sourceVersioning,
} from './_shared'

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
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    hierarchies: jsonText('hierarchies'),
    cartography: jsonText('cartography'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId],
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
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    nameRules: jsonText('nameRules'),
    localType: text('localType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.locale],
    }),
    index('sourceOvertureDivisionI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOvertureDivisionsVersions = sqliteTable(
  'sourceOvertureDivisionsVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    regionCode: text('regionCode').notNull(),
    ...sourceVersioning,
    level: integer('level'),
    divisionType: text('divisionType'),
    subtype: text('subtype'),
    divisionClass: text('divisionClass'),
    population: integer('population'),
    version: integer('version'),
    wikidata: text('wikidata'),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    hierarchies: jsonText('hierarchies'),
    cartography: jsonText('cartography'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'sourceOvertureDivisionsVersions'),
    index('sourceOvertureDivisionsVersions_regionCode_idx').on(table.regionCode),
    index('sourceOvertureDivisionsVersions_level_idx').on(table.level),
    index('sourceOvertureDivisionsVersions_type_idx').on(table.divisionType),
  ],
)

export const sourceOvertureDivisionI18nVersions = sqliteTable(
  'sourceOvertureDivisionI18nVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    ...sourceVersioning,
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    nameRules: jsonText('nameRules'),
    localType: text('localType'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'sourceOvertureDivisionI18nVersions'),
    index('sourceOvertureDivisionI18nVersions_locale_idx').on(table.locale),
  ],
)

export const sourceOvertureAddresses2d = sqliteTable(
  'sourceOvertureAddresses2d',
  {
    ...sourceRecordColumns,
    regionCode: text('regionCode').notNull(),
    version: integer('version'),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    streetName: text('streetName'),
    streetNumber: text('streetNumber'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId],
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
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    streetName: text('streetName'),
    locality: text('locality'),
    region: text('region'),
    country: text('country'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.locale],
    }),
    index('sourceOvertureAddress2dI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOvertureAddresses2dVersions = sqliteTable(
  'sourceOvertureAddresses2dVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    regionCode: text('regionCode').notNull(),
    ...sourceVersioning,
    version: integer('version'),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    streetName: text('streetName'),
    streetNumber: text('streetNumber'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'sourceOvertureAddresses2dVersions'),
    index('sourceOvertureAddresses2dVersions_regionCode_idx').on(table.regionCode),
    index('sourceOvertureAddresses2dVersions_street_lookup_idx').on(
      table.regionCode,
      table.streetName,
      table.streetNumber,
    ),
  ],
)

export const sourceOvertureAddress2dI18nVersions = sqliteTable(
  'sourceOvertureAddress2dI18nVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    ...sourceVersioning,
    locale: text('locale').notNull(),
    streetName: text('streetName'),
    locality: text('locality'),
    region: text('region'),
    country: text('country'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'sourceOvertureAddress2dI18nVersions'),
    index('sourceOvertureAddress2dI18nVersions_locale_idx').on(table.locale),
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
    bbox: jsonText('bbox'),
    operatingStatus: text('operatingStatus'),
    basicCategory: text('basicCategory'),
    taxonomyPrimary: text('taxonomyPrimary'),
    taxonomyHierarchy: jsonText('taxonomyHierarchy'),
    taxonomyAlternates: jsonText('taxonomyAlternates'),
    brandWikidata: text('brandWikidata'),
    websites: jsonText('websites'),
    socials: jsonText('socials'),
    emails: jsonText('emails'),
    phones: jsonText('phones'),
    addresses: jsonText('addresses'),
    confidence: real('confidence'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId],
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
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    brandName: text('brandName'),
    brandNameVariant: jsonText('brandNameVariant'),
    brandNameAlts: text('brandNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.locale],
    }),
    index('sourceOverturePlaceI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOverturePlacesVersions = sqliteTable(
  'sourceOverturePlacesVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    regionCode: text('regionCode').notNull(),
    ...sourceVersioning,
    addressSourceRecordId: text('addressSourceRecordId'),
    version: integer('version'),
    lng: real('lng'),
    lat: real('lat'),
    bbox: jsonText('bbox'),
    operatingStatus: text('operatingStatus'),
    basicCategory: text('basicCategory'),
    taxonomyPrimary: text('taxonomyPrimary'),
    taxonomyHierarchy: jsonText('taxonomyHierarchy'),
    taxonomyAlternates: jsonText('taxonomyAlternates'),
    brandWikidata: text('brandWikidata'),
    websites: jsonText('websites'),
    socials: jsonText('socials'),
    emails: jsonText('emails'),
    phones: jsonText('phones'),
    addresses: jsonText('addresses'),
    confidence: real('confidence'),
    sources: jsonText('sources'),
    rawProperties: jsonText('rawProperties'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'sourceOverturePlacesVersions'),
    index('sourceOverturePlacesVersions_regionCode_idx').on(table.regionCode),
    index('sourceOverturePlacesVersions_basicCategory_idx').on(table.basicCategory),
    index('sourceOverturePlacesVersions_taxonomyPrimary_idx').on(table.taxonomyPrimary),
    index('sourceOverturePlacesVersions_addressSourceRecordId_idx').on(
      table.addressSourceRecordId,
    ),
  ],
)

export const sourceOverturePlaceI18nVersions = sqliteTable(
  'sourceOverturePlaceI18nVersions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    ...sourceVersioning,
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    brandName: text('brandName'),
    brandNameVariant: jsonText('brandNameVariant'),
    brandNameAlts: text('brandNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'sourceOverturePlaceI18nVersions'),
    index('sourceOverturePlaceI18nVersions_locale_idx').on(table.locale),
  ],
)
