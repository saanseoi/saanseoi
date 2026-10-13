import {
  check,
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import {
  canonicalAddress2d,
  canonicalAddress2dBuildingNumberLookup,
  canonicalAddress2dI18n,
  canonicalAddress3d,
  canonicalAddress3dI18n,
  timestamps,
} from '../shared'
import { divisions } from './divisions'
import { streets } from './streets'
import { publicationStateColumns } from './publicationState'

/** One mutable serving projection per lineage; historical snapshots replay history. */
export const addressPublicationState = sqliteTable('addressPublicationState', {
  scopeId: text('scopeId').primaryKey(),
  snapshotId: text('snapshotId').notNull().unique(),
  ...publicationStateColumns(),
})

export const address2d = sqliteTable(
  'address2d',
  {
    /** Stable serving scope; addressPublicationState holds the logical snapshot ID. */
    scopeId: text('scopeId').notNull(),
    divisionSnapshotId: text('divisionSnapshotId').notNull(),
    streetSnapshotId: text('streetSnapshotId'),
    ...canonicalAddress2d,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id],
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.countryId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_countryId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.landformId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_landformId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.areaId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_areaId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.districtId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_districtId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.townId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_townId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.ruralAreaId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_ruralAreaId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.macrohoodId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_macrohoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.villageId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_villageId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.neighbourhoodId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_neighbourhoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.hamletId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_hamletId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.microhoodId],
      foreignColumns: [divisions.scopeId, divisions.id],
      name: 'address2d_divisionSnapshotId_microhoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.streetSnapshotId, table.streetId],
      foreignColumns: [streets.scopeId, streets.id],
      name: 'address2d_streetSnapshotId_streetId_streets_fk',
    }),
    check(
      'address2d_street_reference_consistency_chk',
      sql`(${table.streetSnapshotId} IS NULL) = (${table.streetId} IS NULL)`,
    ),
    index('address2d_countryId_scope_id_idx')
      .on(table.countryId, table.scopeId, table.id)
      .where(sql`${table.countryId} IS NOT NULL`),
    index('address2d_landformId_scope_id_idx')
      .on(table.landformId, table.scopeId, table.id)
      .where(sql`${table.landformId} IS NOT NULL`),
    index('address2d_areaId_scope_id_idx')
      .on(table.areaId, table.scopeId, table.id)
      .where(sql`${table.areaId} IS NOT NULL`),
    index('address2d_districtId_scope_id_idx')
      .on(table.districtId, table.scopeId, table.id)
      .where(sql`${table.districtId} IS NOT NULL`),
    index('address2d_townId_scope_id_idx')
      .on(table.townId, table.scopeId, table.id)
      .where(sql`${table.townId} IS NOT NULL`),
    index('address2d_ruralAreaId_scope_id_idx')
      .on(table.ruralAreaId, table.scopeId, table.id)
      .where(sql`${table.ruralAreaId} IS NOT NULL`),
    index('address2d_macrohoodId_scope_id_idx')
      .on(table.macrohoodId, table.scopeId, table.id)
      .where(sql`${table.macrohoodId} IS NOT NULL`),
    index('address2d_neighbourhoodId_scope_id_idx')
      .on(table.neighbourhoodId, table.scopeId, table.id)
      .where(sql`${table.neighbourhoodId} IS NOT NULL`),
    index('address2d_microhoodId_scope_id_idx')
      .on(table.microhoodId, table.scopeId, table.id)
      .where(sql`${table.microhoodId} IS NOT NULL`),
    index('address2d_villageId_scope_id_idx')
      .on(table.villageId, table.scopeId, table.id)
      .where(sql`${table.villageId} IS NOT NULL`),
    index('address2d_hamletId_scope_id_idx')
      .on(table.hamletId, table.scopeId, table.id)
      .where(sql`${table.hamletId} IS NOT NULL`),
    index('address2d_streetId_idx').on(table.streetId),
    index('address2d_parentAddressId_idx').on(table.scopeId, table.parentAddressId),
    index('address2d_divisionSnapshotId_idx').on(table.divisionSnapshotId),
  ],
)

export const address2dI18n = sqliteTable(
  'address2dI18n',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalAddress2dI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.addressId, table.locale],
    }),
    foreignKey({
      columns: [table.scopeId, table.addressId],
      foreignColumns: [address2d.scopeId, address2d.id],
      name: 'address2dI18n_scopeId_addressId_address2d_fk',
    }).onDelete('cascade'),
    index('address2dI18n_locale_idx').on(table.locale),
  ],
)

export const address2dBuildingNumberLookup = sqliteTable(
  'address2dBuildingNumberLookup',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalAddress2dBuildingNumberLookup,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.addressId, table.buildingNumber],
    }),
    foreignKey({
      columns: [table.scopeId, table.addressId],
      foreignColumns: [address2d.scopeId, address2d.id],
      name: 'address2dBuildingNumberLookup_scopeId_addressId_address2d_fk',
    }).onDelete('cascade'),
    index('address2dBuildingNumberLookup_lookup_idx').on(
      table.scopeId,
      table.buildingNumber,
    ),
    index('address2dBuildingNumberLookup_numericStem_idx').on(
      table.scopeId,
      table.numericStem,
    ),
  ],
)

/**
 * Published search selection. Stable scopes keep document keys independent of
 * snapshot promotion; the FTS5 virtual table is created by search finalisation.
 */
export const addressSearchScopes = sqliteTable('addressSearchScopes', {
  scopeId: text('scopeId').primaryKey(),
  snapshotId: text('snapshotId').notNull(),
})

export const addressesFts = sqliteTable('addressSearchFts', {
  scopeId: text('scopeId').notNull(),
  addressId: text('addressId').notNull(),
  locale: text('locale').notNull(),
  formattedAddress: text('formattedAddress'),
  buildingName: text('buildingName'),
  buildingNumber: text('buildingNumber'),
  blockExpression: text('blockExpression'),
  phaseExpression: text('phaseExpression'),
  estateName: text('estateName'),
  streetName: text('streetName'),
})

export const addressesFtsMatch = (query: string) => sql`${addressesFts} MATCH ${query}`

export const address3d = sqliteTable(
  'address3d',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalAddress3d,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id],
    }),
    foreignKey({
      columns: [table.scopeId, table.address2dId],
      foreignColumns: [address2d.scopeId, address2d.id],
      name: 'address3d_scopeId_address2dId_address2d_fk',
    }).onDelete('cascade'),
    uniqueIndex('address3d_snapshot_owner_unique').on(table.scopeId, table.address2dId),
  ],
)

export const address3dI18n = sqliteTable(
  'address3dI18n',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalAddress3dI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.address3dId, table.locale],
    }),
    foreignKey({
      columns: [table.scopeId, table.address3dId],
      foreignColumns: [address3d.scopeId, address3d.id],
      name: 'address3dI18n_scopeId_address3dId_address3d_fk',
    }).onDelete('cascade'),
    index('address3dI18n_locale_idx').on(table.locale),
  ],
)
