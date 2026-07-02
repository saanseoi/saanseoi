import {
  check,
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

import {
  canonicalAddress2d,
  canonicalAddress2dI18n,
  canonicalAddress3dI18n,
  jsonText,
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

export const address3d = sqliteTable(
  'address3d',
  {
    snapshotId: text('snapshotId').notNull(),
    id: text('id').notNull(),
    address2dId: text('address2dId').notNull(),
    sources: jsonText('sources'),
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
    index('address3d_address2dId_idx').on(table.snapshotId, table.address2dId),
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
