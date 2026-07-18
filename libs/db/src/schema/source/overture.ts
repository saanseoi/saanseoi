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

const sourceOvertureDivisionGeometryBase = {
  sourceRecordId: text('sourceRecordId').notNull(),
  subtype: text('subtype'),
  class: text('class'),
  isLand: integer('isLand', { mode: 'boolean' }),
  isTerritorial: integer('isTerritorial', { mode: 'boolean' }),
  ...geoBbox,
  ...sourceProvenance,
  ...sourceVersioning,
}

export const sourceOvertureDivisionAreas = sqliteTable(
  'overtureDivisionAreas',
  {
    ...sourceOvertureDivisionGeometryBase,
    divisionId: text('division_id'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'overtureDivisionAreas'),
    index('overtureDivisionAreas_divisionId_idx').on(table.divisionId),
    index('overtureDivisionAreas_subtype_idx').on(table.subtype),
    index('overtureDivisionAreas_class_idx').on(table.class),
  ],
)

export const sourceOvertureDivisionBoundaries = sqliteTable(
  'overtureDivisionBoundaries',
  {
    ...sourceOvertureDivisionGeometryBase,
    divisionIds: jsonText('division_ids'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'overtureDivisionBoundaries'),
    index('overtureDivisionBoundaries_subtype_idx').on(table.subtype),
    index('overtureDivisionBoundaries_class_idx').on(table.class),
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

export const sourceOverturePlaces = sqliteTable(
  'overturePlaces',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
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
