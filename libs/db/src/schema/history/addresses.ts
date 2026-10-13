import { index, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'
import {
  canonicalAddress2dBuildingNumberLookupColumns,
  canonicalAddress2dColumns,
  canonicalAddress2dI18nColumns,
  canonicalAddress3dColumns,
  canonicalAddress3dI18nColumns,
} from '../shared'
import { historyEventConstraints } from './constraints'
import { historyI18nVersioning, historyVersioning } from './shared'

export const address2d = sqliteTable(
  'address2d',
  {
    ...canonicalAddress2dColumns(false),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['granularity']),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
    index('address2d_current_lookup_idx').on(table.id, table.isCurrent),
    index('address2d_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('address2d_snapshotId_idx').on(table.snapshotId),
    index('address2d_parentAddressId_idx').on(table.parentAddressId),
  ],
)

export const address2dI18n = sqliteTable(
  'address2dI18n',
  {
    ...canonicalAddress2dI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['formattedAddress']),
    primaryKey({
      columns: [table.addressId, table.snapshotId, table.locale],
    }),
    index('address2dI18n_current_lookup_idx').on(
      table.addressId,
      table.locale,
      table.isCurrent,
    ),
  ],
)

export const address2dBuildingNumberLookup = sqliteTable(
  'address2dBuildingNumberLookup',
  {
    ...canonicalAddress2dBuildingNumberLookupColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['evidence']),
    primaryKey({
      columns: [table.addressId, table.snapshotId, table.buildingNumber],
    }),
  ],
)

export const address3d = sqliteTable(
  'address3d',
  {
    ...canonicalAddress3dColumns(false),
    ...historyVersioning,
  },
  table => [
    ...historyEventConstraints(table, [
      'address2dId',
      'units',
      'unitCount',
      'contentHash',
      'unresolvedSectionIds',
    ]),
    primaryKey({
      columns: [table.id, table.snapshotId],
    }),
    index('address3d_current_lookup_idx').on(table.id, table.isCurrent),
    index('address3d_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('address3d_snapshotId_idx').on(table.snapshotId),
    index('address3d_address2dId_idx').on(table.address2dId),
  ],
)

export const address3dI18n = sqliteTable(
  'address3dI18n',
  {
    ...canonicalAddress3dI18nColumns(false),
    ...historyI18nVersioning,
  },
  table => [
    ...historyEventConstraints(table, ['units']),
    primaryKey({
      columns: [table.address3dId, table.snapshotId, table.locale],
    }),
    index('address3dI18n_current_lookup_idx').on(
      table.address3dId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
