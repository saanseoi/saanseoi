import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { address2d, address3d } from './addresses'
import { divisions } from './divisions'
import { datasets } from './shared'

export const places = sqliteTable(
  'places',
  {
    regionCode: text('regionCode').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    id: text('id').primaryKey(),
    address2dId: text('address2dId').references(() => address2d.id),
    address3dId: text('address3dId').references(() => address3d.id),
    otVersionHash: text('otVersionHash').notNull(),
    otVersion: text('otVersion').notNull(),
    otLng: real('otLng').notNull(),
    otLat: real('otLat').notNull(),
    otBboxJson: text('otBboxJson'),
    otOperatingStatus: text('otOperatingStatus'),
    otBasicCategory: text('otBasicCategory'),
    otTaxonomyPrimary: text('otTaxonomyPrimary'),
    otTaxonomyHierarchyJson: text('otTaxonomyHierarchyJson'),
    otTaxonomyAlternatesJson: text('otTaxonomyAlternatesJson'),
    otBrandWikidata: text('otBrandWikidata'),
    otWebsitesJson: text('otWebsitesJson'),
    otSocialsJson: text('otSocialsJson'),
    otEmailsJson: text('otEmailsJson'),
    otPhonesJson: text('otPhonesJson'),
    otAddressesJson: text('otAddressesJson'),
    otConfidence: real('otConfidence'),
    sourcesJson: text('sourcesJson'),
    firstSeenMonth: text('firstSeenMonth').notNull(),
    lastSeenMonth: text('lastSeenMonth').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    index('places_datasetId_idx').on(table.datasetId),
    index('places_category_idx').on(table.regionCode, table.otBasicCategory),
    index('places_taxonomy_idx').on(table.regionCode, table.otTaxonomyPrimary),
    index('places_status_idx').on(table.regionCode, table.otOperatingStatus),
  ],
)

export const placesVersions = sqliteTable(
  'placesVersions',
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
    address2dId: text('address2dId'),
    address3dId: text('address3dId'),
    otVersionHash: text('otVersionHash').notNull(),
    otVersion: text('otVersion').notNull(),
    otLng: real('otLng').notNull(),
    otLat: real('otLat').notNull(),
    otBboxJson: text('otBboxJson'),
    otOperatingStatus: text('otOperatingStatus'),
    otBasicCategory: text('otBasicCategory'),
    otTaxonomyPrimary: text('otTaxonomyPrimary'),
    otTaxonomyHierarchyJson: text('otTaxonomyHierarchyJson'),
    otTaxonomyAlternatesJson: text('otTaxonomyAlternatesJson'),
    otBrandWikidata: text('otBrandWikidata'),
    otWebsitesJson: text('otWebsitesJson'),
    otSocialsJson: text('otSocialsJson'),
    otEmailsJson: text('otEmailsJson'),
    otPhonesJson: text('otPhonesJson'),
    otAddressesJson: text('otAddressesJson'),
    otConfidence: real('otConfidence'),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('placesVersions_current_lookup_idx').on(
      table.regionCode,
      table.id,
      table.isCurrent,
    ),
    index('placesVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('placesVersions_datasetId_idx').on(table.datasetId),
  ],
)

export const placesI18n = sqliteTable(
  'placesI18n',
  {
    placeId: text('placeId')
      .notNull()
      .references(() => places.id),
    locale: text('locale').notNull(),
    otName: text('otName'),
    otNameVariantJson: text('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    otBrandName: text('otBrandName'),
    otBrandNameVariantJson: text('otBrandNameVariantJson'),
    otBrandNameAlts: text('otBrandNameAlts'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.locale],
    }),
    index('placesI18n_locale_idx').on(table.locale),
    index('placesI18n_name_idx').on(table.locale, table.otName),
  ],
)

export const placesVersionsI18n = sqliteTable(
  'placesVersionsI18n',
  {
    placeId: text('placeId').notNull(),
    versionHash: text('versionHash').notNull(),
    locale: text('locale').notNull(),
    otName: text('otName'),
    otNameVariantJson: text('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    otBrandName: text('otBrandName'),
    otBrandNameVariantJson: text('otBrandNameVariantJson'),
    otBrandNameAlts: text('otBrandNameAlts'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.versionHash, table.locale],
    }),
    index('placesVersionsI18n_locale_idx').on(table.locale),
    index('placesVersionsI18n_name_idx').on(table.locale, table.otName),
  ],
)

export const placesDivision = sqliteTable(
  'placesDivision',
  {
    placeId: text('placeId')
      .notNull()
      .references(() => places.id),
    divisionId: text('divisionId')
      .notNull()
      .references(() => divisions.id),
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.divisionId],
    }),
    index('placesDivision_divisionId_idx').on(table.divisionId, table.placeId),
  ],
)

export const placesCells = sqliteTable(
  'placesCells',
  {
    regionCode: text('regionCode').notNull(),
    id: text('id')
      .notNull()
      .references(() => places.id),
    h3Level: integer('h3Level').notNull(),
    h3Cell: text('h3Cell').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.regionCode, table.id, table.h3Level, table.h3Cell],
    }),
    index('placesCells_lookup_idx').on(
      table.regionCode,
      table.h3Level,
      table.h3Cell,
      table.id,
    ),
  ],
)
