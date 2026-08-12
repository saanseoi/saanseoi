import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import {
  jsonText,
  canonicalAddress2d,
  canonicalAddress2dBuildingNumberLookup,
  canonicalAddress2dI18n,
  canonicalAddress3dUnitRefLookup,
  canonicalAddress3dI18n,
} from '../shared'
import { historyI18nVersioning, historyVersioning } from './shared'

export const address2d = sqliteTable(
  'address2d',
  {
    ...canonicalAddress2d,
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address2d_current_lookup_idx').on(table.id, table.isCurrent),
    index('address2d_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('address2d_snapshotId_idx').on(table.snapshotId),
  ],
)

export const address2dI18n = sqliteTable(
  'address2dI18n',
  {
    ...canonicalAddress2dI18n,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.versionHash, table.locale],
    }),
    index('address2dI18n_locale_idx').on(table.locale),
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
    ...canonicalAddress2dBuildingNumberLookup,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.versionHash, table.buildingNumber],
    }),
    index('address2dBuildingNumberLookup_lookup_idx').on(
      table.snapshotId,
      table.buildingNumber,
      table.isCurrent,
    ),
    index('address2dBuildingNumberLookup_numericStem_idx').on(
      table.snapshotId,
      table.numericStem,
      table.isCurrent,
    ),
  ],
)

export const address3d = sqliteTable(
  'address3d',
  {
    id: text('id').notNull(),
    address2dId: text('address2dId').notNull(),
    sources: jsonText('sources'),
    ...historyVersioning,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
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
    ...canonicalAddress3dI18n,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.versionHash, table.locale],
    }),
    index('address3dI18n_locale_idx').on(table.locale),
    index('address3dI18n_current_lookup_idx').on(
      table.address3dId,
      table.locale,
      table.isCurrent,
    ),
  ],
)

export const address3dUnitRefLookup = sqliteTable(
  'address3dUnitRefLookup',
  {
    ...canonicalAddress3dUnitRefLookup,
    ...historyI18nVersioning,
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.versionHash, table.unitRef],
    }),
    index('address3dUnitRefLookup_lookup_idx').on(
      table.snapshotId,
      table.unitRef,
      table.isCurrent,
    ),
    index('address3dUnitRefLookup_numericStem_idx').on(
      table.snapshotId,
      table.numericStem,
      table.isCurrent,
    ),
  ],
)
