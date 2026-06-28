import {
  check,
  foreignKey,
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
    snapshotId: text('snapshotId').notNull(),
    id: text('id').notNull(),
    regionCode: text('regionCode').notNull(),
    releaseId: text('releaseId').notNull(),
    addressSnapshotId: text('addressSnapshotId'),
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
    firstSeenMonth: text('firstSeenMonth').notNull(),
    lastSeenMonth: text('lastSeenMonth').notNull(),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
    foreignKey({
      columns: [table.addressSnapshotId, table.address2dId],
      foreignColumns: [address2d.snapshotId, address2d.id],
      name: 'places_addressSnapshotId_address2dId_address2d_fk',
    }),
    foreignKey({
      columns: [table.addressSnapshotId, table.address3dId],
      foreignColumns: [address3d.snapshotId, address3d.id],
      name: 'places_addressSnapshotId_address3dId_address3d_fk',
    }),
    check(
      'places_address_snapshot_required_chk',
      sql`${table.addressSnapshotId} IS NOT NULL OR (${table.address2dId} IS NULL AND ${table.address3dId} IS NULL)`,
    ),
    index('places_releaseId_idx').on(table.releaseId),
    index('places_category_idx').on(table.regionCode, table.basicCategory),
    index('places_taxonomy_idx').on(table.regionCode, table.taxonomyPrimary),
    index('places_status_idx').on(table.regionCode, table.operatingStatus),
  ],
)

export const placesI18n = sqliteTable(
  'placesI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    placeId: text('placeId').notNull(),
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
      columns: [table.snapshotId, table.placeId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.placeId],
      foreignColumns: [places.snapshotId, places.id],
      name: 'placesI18n_snapshotId_placeId_places_fk',
    }).onDelete('cascade'),
    index('placesI18n_locale_idx').on(table.locale),
    index('placesI18n_name_idx').on(table.locale, table.name),
  ],
)

export const placesDivision = sqliteTable(
  'placesDivision',
  {
    placeSnapshotId: text('placeSnapshotId').notNull(),
    placeId: text('placeId').notNull(),
    divisionSnapshotId: text('divisionSnapshotId').notNull(),
    divisionId: text('divisionId').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.placeSnapshotId,
        table.placeId,
        table.divisionSnapshotId,
        table.divisionId,
      ],
    }),
    foreignKey({
      columns: [table.placeSnapshotId, table.placeId],
      foreignColumns: [places.snapshotId, places.id],
      name: 'placesDivision_placeSnapshotId_placeId_places_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.divisionSnapshotId, table.divisionId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'placesDivision_divisionSnapshotId_divisionId_divisions_fk',
    }),
    index('placesDivision_divisionId_idx').on(
      table.divisionSnapshotId,
      table.divisionId,
      table.placeSnapshotId,
      table.placeId,
    ),
  ],
)

export const placesCells = sqliteTable(
  'placesCells',
  {
    snapshotId: text('snapshotId').notNull(),
    regionCode: text('regionCode').notNull(),
    id: text('id').notNull(),
    h3Level: integer('h3Level').notNull(),
    h3Cell: text('h3Cell').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.snapshotId,
        table.regionCode,
        table.id,
        table.h3Level,
        table.h3Cell,
      ],
    }),
    foreignKey({
      columns: [table.snapshotId, table.id],
      foreignColumns: [places.snapshotId, places.id],
      name: 'placesCells_snapshotId_id_places_fk',
    }).onDelete('cascade'),
    index('placesCells_lookup_idx').on(
      table.snapshotId,
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
  snapshotId: text('snapshotId').notNull(),
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
