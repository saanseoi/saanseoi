import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

export const sourceOvertureDivisions = sqliteTable(
  'overtureDivisions',
  {
    ...sourceAssertionColumns(),
    /** Exact publisher multilingual name object; canonical locales live elsewhere. */
    names: jsonText('names'),
    adminLevel: integer('admin_level'),
    subtype: text('subtype'),
    class: text('class'),
    wikidata: text('wikidata'),
    hierarchies: jsonText('hierarchies'),
    cartography: jsonText('cartography'),
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
  ...sourceAssertionColumns(),
  subtype: text('subtype'),
  class: text('class'),
  isLand: integer('isLand', { mode: 'boolean' }),
  isTerritorial: integer('isTerritorial', { mode: 'boolean' }),
}

export const sourceOvertureDivisionAreas = sqliteTable(
  'overtureDivisionAreas',
  {
    ...sourceOvertureDivisionGeometryBase,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'overtureDivisionAreas'),
    index('overtureDivisionAreas_subtype_idx').on(table.subtype),
    index('overtureDivisionAreas_class_idx').on(table.class),
  ],
)

export const sourceOvertureDivisionBoundaries = sqliteTable(
  'overtureDivisionBoundaries',
  {
    ...sourceOvertureDivisionGeometryBase,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'overtureDivisionBoundaries'),
    index('overtureDivisionBoundaries_subtype_idx').on(table.subtype),
    index('overtureDivisionBoundaries_class_idx').on(table.class),
  ],
)

export const sourceOverturePlaces = sqliteTable(
  'overturePlaces',
  {
    ...sourceAssertionColumns(),
    /** Exact publisher multilingual name object; canonical locales live elsewhere. */
    names: jsonText('names'),
    lng: real('lng'),
    lat: real('lat'),
    bbox: jsonText('bbox'),
    operatingStatus: text('operatingStatus'),
    basicCategory: text('basicCategory'),
    taxonomyPrimary: text('taxonomyPrimary'),
    taxonomyHierarchy: jsonText('taxonomyHierarchy'),
    taxonomyAlternates: jsonText('taxonomyAlternates'),
    wikidataId: text('wikidataId'),
    /** Exact publisher multilingual brand-name object, when supplied. */
    brandNames: jsonText('brandNames'),
    websites: jsonText('websites'),
    socials: jsonText('socials'),
    emails: jsonText('emails'),
    phones: jsonText('phones'),
    addresses: jsonText('addresses'),
    confidence: real('confidence'),
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
