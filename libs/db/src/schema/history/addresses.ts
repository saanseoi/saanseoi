import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { i18nVersioning, jsonText, timestamps, versioning } from './_shared'

export const address2dVersions = sqliteTable(
  'address2dVersions',
  {
    id: text('id').notNull(),
    regionCode: text('regionCode').notNull(),
    ...versioning,
    streetId: text('streetId'),
    hamletId: text('hamletId'),
    microhoodId: text('microhoodId'),
    villageId: text('villageId'),
    neighbourhoodId: text('neighbourhoodId'),
    macrohoodId: text('macrohoodId'),
    townId: text('townId'),
    districtId: text('districtId'),
    areaId: text('areaId'),
    countryId: text('countryId'),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    identifiers: jsonText('identifiers'),
    sources: jsonText('sources'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address2dVersions_current_lookup_idx').on(
      table.regionCode,
      table.id,
      table.isCurrent,
    ),
    index('address2dVersions_snapshot_validity_idx').on(
      table.regionCode,
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('address2dVersions_validity_idx').on(
      table.regionCode,
      table.validFromCohortKey,
      table.validToCohortKey,
    ),
    index('address2dVersions_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('address2dVersions_snapshotId_idx').on(table.snapshotId),
  ],
)

export const address2dVersionsI18n = sqliteTable(
  'address2dVersionsI18n',
  {
    addressId: text('addressId').notNull(),
    ...i18nVersioning,
    locale: text('locale').notNull(),
    formattedAddress: text('formattedAddress').notNull(),
    buildingName: text('buildingName'),
    buildingNumberFrom: text('buildingNumberFrom'),
    buildingNumberTo: text('buildingNumberTo'),
    blockType: text('blockType'),
    blockNumber: text('blockNumber'),
    blockTypeBeforeNumber: integer('blockTypeBeforeNumber', { mode: 'boolean' }),
    phaseName: text('phaseName'),
    phaseNumber: text('phaseNumber'),
    estateName: text('estateName'),
    streetNumber: text('streetNumber'),
    streetName: text('streetName'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.versionHash, table.locale],
    }),
    index('address2dVersionsI18n_locale_idx').on(table.locale),
    index('address2dVersionsI18n_current_lookup_idx').on(
      table.addressId,
      table.locale,
      table.isCurrent,
    ),
  ],
)

export const address3dVersions = sqliteTable(
  'address3dVersions',
  {
    id: text('id').notNull(),
    ...versioning,
    address2dId: text('address2dId').notNull(),
    sources: jsonText('sources'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address3dVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('address3dVersions_snapshot_validity_idx').on(
      table.validFromSnapshotId,
      table.validToSnapshotId,
    ),
    index('address3dVersions_validity_idx').on(
      table.validFromCohortKey,
      table.validToCohortKey,
    ),
    index('address3dVersions_sourceReleaseId_idx').on(table.sourceReleaseId),
    index('address3dVersions_snapshotId_idx').on(table.snapshotId),
    index('address3dVersions_address2dId_idx').on(table.address2dId),
  ],
)

export const address3dVersionsI18n = sqliteTable(
  'address3dVersionsI18n',
  {
    address3dId: text('address3dId').notNull(),
    ...i18nVersioning,
    locale: text('locale').notNull(),
    formattedAddressPart: text('formattedAddressPart').notNull(),
    accessHint: text('accessHint'),
    unitPortion: text('unitPortion'),
    unitNumber: text('unitNumber'),
    unitType: text('unitType'),
    floorNumber: text('floorNumber'),
    floorType: text('floorType'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.versionHash, table.locale],
    }),
    index('address3dVersionsI18n_locale_idx').on(table.locale),
    index('address3dVersionsI18n_current_lookup_idx').on(
      table.address3dId,
      table.locale,
      table.isCurrent,
    ),
  ],
)
