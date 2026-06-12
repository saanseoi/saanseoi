import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const placesVersions = sqliteTable(
  'placesVersions',
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
    address2dId: text('address2dId'),
    address3dId: text('address3dId'),
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
    ...timestamps,
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
    index('placesVersions_releaseSet_validity_idx').on(
      table.regionCode,
      table.validFromReleaseSetId,
      table.validToReleaseSetId,
    ),
    index('placesVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('placesVersions_releaseId_idx').on(table.releaseId),
  ],
)

export const placesVersionsI18n = sqliteTable(
  'placesVersionsI18n',
  {
    placeId: text('placeId').notNull(),
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
      columns: [table.placeId, table.versionHash, table.locale],
    }),
    index('placesVersionsI18n_locale_idx').on(table.locale),
    index('placesVersionsI18n_name_idx').on(table.locale, table.otName),
    index('placesVersionsI18n_current_lookup_idx').on(
      table.placeId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
