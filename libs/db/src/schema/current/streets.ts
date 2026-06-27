import {
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'
import { address2d } from './addresses'

export const streets = sqliteTable(
  'streets',
  {
    snapshotId: text('snapshotId').notNull(),
    id: text('id').notNull(),
    yearBuilt: jsonText('yearBuilt'),
    references: jsonText('references'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.id],
    }),
  ],
)

export const streetsI18n = sqliteTable(
  'streetsI18n',
  {
    snapshotId: text('snapshotId').notNull(),
    streetId: text('streetId').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    base: text('base'),
    designator: text('designator'),
    directionalPrefix: text('directionalPrefix'),
    directionalSuffix: text('directionalSuffix'),
    normalised: text('normalised'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.snapshotId, table.streetId, table.locale],
    }),
    foreignKey({
      columns: [table.snapshotId, table.streetId],
      foreignColumns: [streets.snapshotId, streets.id],
      name: 'streetsI18n_snapshotId_streetId_streets_fk',
    }).onDelete('cascade'),
    index('streetsI18n_locale_idx').on(table.locale),
    index('streetsI18n_name_idx').on(table.locale, table.name),
  ],
)

export const streetsAddress = sqliteTable(
  'streetsAddress',
  {
    streetSnapshotId: text('streetSnapshotId').notNull(),
    streetId: text('streetId').notNull(),
    addressSnapshotId: text('addressSnapshotId').notNull(),
    addressId: text('addressId').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.streetSnapshotId,
        table.streetId,
        table.addressSnapshotId,
        table.addressId,
      ],
    }),
    foreignKey({
      columns: [table.streetSnapshotId, table.streetId],
      foreignColumns: [streets.snapshotId, streets.id],
      name: 'streetsAddress_streetSnapshotId_streetId_streets_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.addressSnapshotId, table.addressId],
      foreignColumns: [address2d.snapshotId, address2d.id],
      name: 'streetsAddress_addressSnapshotId_addressId_address2d_fk',
    }).onDelete('cascade'),
    index('streetsAddress_addressId_idx').on(table.addressSnapshotId, table.addressId),
  ],
)
