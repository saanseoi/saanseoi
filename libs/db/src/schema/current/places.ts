import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import { canonicalPlace, canonicalPlaceI18n, timestamps } from '../shared'

export const places = sqliteTable(
  'places',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalPlace,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id],
    }),
    // Logical Address references are validated against immutable history during preparation.
    check(
      'places_address_snapshot_required_chk',
      sql`${table.addressSnapshotId} IS NOT NULL OR (${table.address2dId} IS NULL AND ${table.address3dId} IS NULL)`,
    ),
    check(
      'places_address3d_unit_reference_chk',
      sql`(${table.address3dId} IS NULL AND ${table.address3dUnitId} IS NULL AND ${table.address3dMembership} IS NULL) OR (${table.address3dId} IS NOT NULL AND ${table.address3dUnitId} IS NOT NULL AND ${table.address3dMembership} IS NOT NULL AND ${table.address2dId} IS NOT NULL)`,
    ),
    index('places_resourceReleaseId_idx').on(table.resourceReleaseId),
    index('places_category_id_idx').on(table.scopeId, table.basicCategory, table.id),
    index('places_taxonomy_id_idx').on(table.scopeId, table.taxonomyPrimary, table.id),
    index('places_status_id_idx').on(table.scopeId, table.operatingStatus, table.id),
  ],
)

export const placesI18n = sqliteTable(
  'placesI18n',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalPlaceI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.placeId, table.locale],
    }),
    foreignKey({
      columns: [table.scopeId, table.placeId],
      foreignColumns: [places.scopeId, places.id],
      name: 'placesI18n_scopeId_placeId_places_fk',
    }).onDelete('cascade'),
    index('placesI18n_name_idx').on(table.locale, table.name),
  ],
)

export const placesDivision = sqliteTable(
  'placesDivision',
  {
    placeScopeId: text('placeScopeId').notNull(),
    placeId: text('placeId').notNull(),
    divisionSnapshotId: text('divisionSnapshotId').notNull(),
    divisionId: text('divisionId').notNull(),
    /** Retained exact dependency; independent of mutable Division serving scopes. */
    definition: text('definition', { mode: 'json' })
      .$type<{
        level: number | null
        locales: { locale: string; name: string | null }[]
      }>()
      .notNull(),
  },
  table => [
    primaryKey({
      columns: [table.placeScopeId, table.placeId, table.divisionId],
    }),
    foreignKey({
      columns: [table.placeScopeId, table.placeId],
      foreignColumns: [places.scopeId, places.id],
      name: 'placesDivision_placeScopeId_placeId_places_fk',
    }).onDelete('cascade'),
    index('placesDivision_scope_division_place_idx').on(
      table.placeScopeId,
      table.divisionId,
      table.placeId,
    ),
  ],
)

export const placesCells = sqliteTable(
  'placesCells',
  {
    scopeId: text('scopeId').notNull(),
    id: text('id').notNull(),
    h3Level: integer('h3Level').notNull(),
    h3Cell: text('h3Cell').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id, table.h3Level, table.h3Cell],
    }),
    foreignKey({
      columns: [table.scopeId, table.id],
      foreignColumns: [places.scopeId, places.id],
      name: 'placesCells_scopeId_id_places_fk',
    }).onDelete('cascade'),
    index('placesCells_lookup_idx').on(
      table.scopeId,
      table.h3Level,
      table.h3Cell,
      table.id,
    ),
  ],
)

/** Latest published snapshot selected for each stable Place search scope. */
export const placeSearchScopes = sqliteTable('placeSearchScopes', {
  scopeId: text('scopeId').primaryKey(),
  snapshotId: text('snapshotId').notNull(),
})

/** Query mapping only; publication creates this FTS5 virtual table. */
export const placesFts = sqliteTable('placeSearchFts', {
  scopeId: text('scopeId').notNull(),
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
