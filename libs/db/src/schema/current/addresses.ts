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

export const address2d = sqliteTable(
  'address2d',
  {
    snapshotId: text('snapshotId').notNull(),
    divisionSnapshotId: text('divisionSnapshotId').notNull(),
    streetSnapshotId: text('streetSnapshotId'),
    ...canonicalAddress2d,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.countryId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_countryId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.areaId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_areaId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.districtId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_districtId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.townId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_townId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.macrohoodId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_macrohoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.villageId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_villageId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.neighbourhoodId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_neighbourhoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.hamletId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_hamletId_divisions_fk',
    }),
    foreignKey({
      columns: [table.divisionSnapshotId, table.microhoodId],
      foreignColumns: [divisions.snapshotId, divisions.id],
      name: 'address2d_divisionSnapshotId_microhoodId_divisions_fk',
    }),
    foreignKey({
      columns: [table.streetSnapshotId, table.streetId],
      foreignColumns: [streets.snapshotId, streets.id],
      name: 'address2d_streetSnapshotId_streetId_streets_fk',
    }),
    check(
      'address2d_street_reference_consistency_chk',
      sql`(${table.streetSnapshotId} IS NULL) = (${table.streetId} IS NULL)`,
    ),
    index('address2d_streetId_idx').on(table.streetId),
    index('address2d_parentAddressId_idx').on(table.snapshotId, table.parentAddressId),
    index('address2d_division_idx').on(
      table.divisionSnapshotId,
      table.hamletId,
      table.microhoodId,
      table.villageId,
      table.neighbourhoodId,
      table.macrohoodId,
      table.townId,
      table.districtId,
    ),
  ],
)

export const address2dI18n = sqliteTable(
  'address2dI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalAddress2dI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.addressId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.addressId],
      foreignColumns: [address2d.snapshotId, address2d.id],
      name: 'address2dI18n_snapshotId_addressId_address2d_fk',
    }).onDelete('cascade'),
    index('address2dI18n_locale_idx').on(table.locale),
  ],
)

export const address2dBuildingNumberLookup = sqliteTable(
  'address2dBuildingNumberLookup',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalAddress2dBuildingNumberLookup,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.addressId, table.buildingNumber],
    }),
    foreignKey({
      columns: [table.snapshotId, table.addressId],
      foreignColumns: [address2d.snapshotId, address2d.id],
      name: 'address2dBuildingNumberLookup_snapshotId_addressId_address2d_fk',
    }).onDelete('cascade'),
    index('address2dBuildingNumberLookup_lookup_idx').on(
      table.snapshotId,
      table.buildingNumber,
    ),
    index('address2dBuildingNumberLookup_numericStem_idx').on(
      table.snapshotId,
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
    snapshotId: text('snapshotId').notNull(),
    ...canonicalAddress3d,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
    foreignKey({
      columns: [table.snapshotId, table.address2dId],
      foreignColumns: [address2d.snapshotId, address2d.id],
      name: 'address3d_snapshotId_address2dId_address2d_fk',
    }).onDelete('cascade'),
    uniqueIndex('address3d_snapshot_owner_unique').on(
      table.snapshotId,
      table.address2dId,
    ),
  ],
)

export const address3dI18n = sqliteTable(
  'address3dI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    ...canonicalAddress3dI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.address3dId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.address3dId],
      foreignColumns: [address3d.snapshotId, address3d.id],
      name: 'address3dI18n_snapshotId_address3dId_address3d_fk',
    }).onDelete('cascade'),
    index('address3dI18n_locale_idx').on(table.locale),
  ],
)
