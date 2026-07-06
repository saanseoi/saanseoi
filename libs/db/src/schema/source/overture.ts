import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, geoBbox, sourceProvenance } from '../shared'
import { sourceVersionIndexes, sourceVersioning } from './shared'
import { hkAreas, hkDistricts } from '@repo/core'

export const sourceOvertureDivisions = sqliteTable(
  'overtureDivisions',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    adminLevel: integer('admin_level'),
    subtype: text('subtype'),
    class: text('class'),
    wikidata: text('wikidata'),
    hierarchies: jsonText('hierarchies'),
    ...geoBbox,
    cartography: jsonText('cartography'),
    ...sourceProvenance,
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'overtureDivisions'),
    index('overtureDivisions_adminLevel_idx').on(table.adminLevel),
    index('overtureDivisions_subtype_idx').on(table.subtype),
    index('overtureDivisions_class_idx').on(table.class),
  ],
)

export const sourceOvertureDivisionI18n = sqliteTable(
  'overtureDivisionI18n',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name'),
    nameVariant: jsonText('nameVariant'),
    nameAlts: text('nameAlts'),
    nameRules: jsonText('nameRules'),
    isLocaleInferred: integer('isLocaleInferred', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'overtureDivisionI18n'),
    index('overtureDivisionI18n_locale_idx').on(table.locale),
  ],
)

export const sourceOvertureAddresses2d = sqliteTable(
  'overtureAddresses2d',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    area: text('area', { enum: hkAreas }),
    district: text('district', { enum: hkDistricts }),
    streetName: text('streetName'),
    streetNumber: text('streetNumber'),
    unit: text('unit'),
    ...geoBbox,
    ...sourceProvenance,
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'overtureAddresses2d'),
    index('overtureAddresses2d_area_idx').on(table.area),
    index('overtureAddresses2d_district_idx').on(table.district),
    index('overtureAddresses2d_district_street_lookup_idx').on(
      table.district,
      table.streetName,
      table.streetNumber,
    ),
  ],
)

export const sourceOverturePlaces = sqliteTable(
  'overturePlaces',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    addressSourceRecordId: text('addressSourceRecordId'),
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
    ...sourceProvenance,
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'overturePlaces'),
    index('overturePlaces_basicCategory_idx').on(table.basicCategory),
    index('overturePlaces_taxonomyPrimary_idx').on(table.taxonomyPrimary),
    index('overturePlaces_addressSourceRecordId_idx').on(table.addressSourceRecordId),
  ],
)

export const sourceOverturePlaceI18n = sqliteTable(
  'overturePlaceI18n',
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
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'overturePlaceI18n'),
    index('overturePlaceI18n_locale_idx').on(table.locale),
  ],
)
