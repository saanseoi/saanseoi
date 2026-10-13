import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { canonicalStreet, canonicalStreetI18n, timestamps } from '../shared'

export const streets = sqliteTable(
  'streets',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalStreet,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.id],
    }),
    check('streets_version_positive', sql`${table.version} > 0`),
  ],
)

export const streetsI18n = sqliteTable(
  'streetsI18n',
  {
    scopeId: text('scopeId').notNull(),
    ...canonicalStreetI18n,
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.scopeId, table.streetId, table.locale],
    }),
    foreignKey({
      columns: [table.scopeId, table.streetId],
      foreignColumns: [streets.scopeId, streets.id],
      name: 'streetsI18n_scopeId_streetId_streets_fk',
    }).onDelete('cascade'),
    index('streetsI18n_name_idx').on(table.locale, table.name),
  ],
)

export const streetsAddress = sqliteTable(
  'streetsAddress',
  {
    streetScopeId: text('streetScopeId').notNull(),
    streetId: text('streetId').notNull(),
    addressSnapshotId: text('addressSnapshotId').notNull(),
    addressId: text('addressId').notNull(),
  },
  table => [
    primaryKey({
      columns: [
        table.streetScopeId,
        table.streetId,
        table.addressSnapshotId,
        table.addressId,
      ],
    }),
    foreignKey({
      columns: [table.streetScopeId, table.streetId],
      foreignColumns: [streets.scopeId, streets.id],
      name: 'streetsAddress_streetScopeId_streetId_streets_fk',
    }).onDelete('cascade'),
    // Logical Address references are validated against immutable history during preparation.
    index('streetsAddress_addressId_idx').on(table.addressSnapshotId, table.addressId),
  ],
)
