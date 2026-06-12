import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import { jsonText, timestamps } from './_shared'
import { address2d, address3d } from './addresses'
import { divisions } from './divisions'

export const places = sqliteTable(
  'places',
  {
    id: text('id').primaryKey(),
    regionCode: text('regionCode').notNull(),
    datasetRecordId: text('datasetRecordId').notNull(),
    address2dId: text('address2dId').references(() => address2d.id),
    address3dId: text('address3dId').references(() => address3d.id),
    otVersionHash: text('otVersionHash').notNull(),
    otVersion: text('otVersion').notNull(),
    otLng: real('otLng').notNull(),
    otLat: real('otLat').notNull(),
    otBbox: jsonText('otBboxJson'),
    otOperatingStatus: text('otOperatingStatus'),
    otBasicCategory: text('otBasicCategory'),
    otTaxonomyPrimary: text('otTaxonomyPrimary'),
    otTaxonomyHierarchy: jsonText('otTaxonomyHierarchyJson'),
    otTaxonomyAlternates: jsonText('otTaxonomyAlternatesJson'),
    otBrandWikidata: text('otBrandWikidata'),
    otWebsites: jsonText('otWebsitesJson'),
    otSocials: jsonText('otSocialsJson'),
    otEmails: jsonText('otEmailsJson'),
    otPhones: jsonText('otPhonesJson'),
    otAddresses: jsonText('otAddressesJson'),
    otConfidence: real('otConfidence'),
    sources: jsonText('sourcesJson'),
    firstSeenMonth: text('firstSeenMonth').notNull(),
    lastSeenMonth: text('lastSeenMonth').notNull(),
    ...timestamps,
  },
  table => [
    index('places_datasetRecordId_idx').on(table.datasetRecordId),
    index('places_category_idx').on(table.regionCode, table.otBasicCategory),
    index('places_taxonomy_idx').on(table.regionCode, table.otTaxonomyPrimary),
    index('places_status_idx').on(table.regionCode, table.otOperatingStatus),
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
    otNameVariant: jsonText('otNameVariantJson'),
    otNameAlts: text('otNameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    otBrandName: text('otBrandName'),
    otBrandNameVariant: jsonText('otBrandNameVariantJson'),
    otBrandNameAlts: text('otBrandNameAlts'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.locale],
    }),
    index('placesI18n_locale_idx').on(table.locale),
    index('placesI18n_name_idx').on(table.locale, table.otName),
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

/**
 * TypeScript query mapping for the FTS5 virtual table only. The actual
 * `CREATE VIRTUAL TABLE placesFts ... USING fts5` is maintained in
 * `libs/db/scripts/sql/rebuild-places-fts.sql`, not by Drizzle migrations.
 * `placesFtsMatch` and `searchPlacesFts` depend on that external rebuild
 * script, so migration tooling must not try to create a regular table for
 * `placesFts`.
 */
export const placesFts = sqliteTable('placesFts', {
  placeId: text('placeId').notNull(),
  locale: text('locale').notNull(),
  nameText: text('nameText'),
  brandText: text('brandText'),
  taxonomyText: text('taxonomyText'),
  addressText: text('addressText'),
  divisionText: text('divisionText'),
  streetText: text('streetText'),
})

export const placesFtsMatch = (query: string) => sql`${placesFts} MATCH ${query}`
