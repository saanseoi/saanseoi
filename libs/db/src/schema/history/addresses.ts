import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const address2dVersions = sqliteTable(
  'address2dVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    regionCode: text('regionCode').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
    geometry: jsonText('geometryJson'),
    identifiers: jsonText('identifiersJson'),
    otBbox: jsonText('otBboxJson'),
    sources: jsonText('sourcesJson'),
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
    index('address2dVersions_releaseSet_validity_idx').on(
      table.regionCode,
      table.validFromReleaseSetId,
      table.validToReleaseSetId,
    ),
    index('address2dVersions_validity_idx').on(
      table.regionCode,
      table.validFromMonth,
      table.validToMonth,
    ),
    index('address2dVersions_releaseId_idx').on(table.releaseId),
  ],
)

export const address2dVersionsI18n = sqliteTable(
  'address2dVersionsI18n',
  {
    addressId: text('addressId').notNull(),
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    address2dId: text('address2dId').notNull(),
    sources: jsonText('sourcesJson'),
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address3dVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('address3dVersions_releaseSet_validity_idx').on(
      table.validFromReleaseSetId,
      table.validToReleaseSetId,
    ),
    index('address3dVersions_validity_idx').on(
      table.validFromMonth,
      table.validToMonth,
    ),
    index('address3dVersions_releaseId_idx').on(table.releaseId),
    index('address3dVersions_address2dId_idx').on(table.address2dId),
  ],
)

export const address3dVersionsI18n = sqliteTable(
  'address3dVersionsI18n',
  {
    address3dId: text('address3dId').notNull(),
    versionHash: text('versionHash').notNull(),
    releaseId: text('releaseId').notNull(),
    validFromReleaseSetId: text('validFromReleaseSetId').notNull(),
    validToReleaseSetId: text('validToReleaseSetId'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
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
