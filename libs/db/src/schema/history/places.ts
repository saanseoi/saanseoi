import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { i18nVersioning, jsonText, timestamps, versioning } from './_shared'

export const placesVersions = sqliteTable(
  'placesVersions',
  {
    id: text('id').notNull(),
    regionCode: text('regionCode').notNull(),
    ...versioning,
    address2dId: text('address2dId'),
    address3dId: text('address3dId'),
    lng: real('lng').notNull(),
    lat: real('lat').notNull(),
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
    index('placesVersions_snapshot_validity_idx').on(
      table.regionCode,
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('placesVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('placesVersions_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('placesVersions_snapshotId_idx').on(table.snapshotId),
  ],
)

export const placesVersionsI18n = sqliteTable(
  'placesVersionsI18n',
  {
    placeId: text('placeId').notNull(),
    ...i18nVersioning,
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' }).notNull(),
    brandName: text('brandName'),
    brandNameVariant: jsonText('brandNameVariant'),
    brandNameAlts: text('brandNameAlts'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.placeId, table.versionHash, table.locale],
    }),
    index('placesVersionsI18n_locale_idx').on(table.locale),
    index('placesVersionsI18n_name_idx').on(table.locale, table.name),
    index('placesVersionsI18n_current_lookup_idx').on(
      table.placeId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
