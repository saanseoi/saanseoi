import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { divisions } from './divisions'
import { datasets } from './shared'

export const address2d = sqliteTable(
  'address2d',
  {
    id: text('id').primaryKey(),
    geometry: text('geometryJson'),
    countryId: text('countryId').references(() => divisions.id),
    areaId: text('areaId').references(() => divisions.id),
    districtId: text('districtId').references(() => divisions.id),
    townId: text('townId').references(() => divisions.id),
    macrohoodId: text('macrohoodId').references(() => divisions.id),
    villageId: text('villageId').references(() => divisions.id),
    neighbourhoodId: text('neighbourhoodId').references(() => divisions.id),
    hamletId: text('hamletId').references(() => divisions.id),
    microhoodId: text('microhoodId').references(() => divisions.id),
    streetId: text('streetId'),
    otBboxJson: text('otBboxJson'),
    otVersion: text('otVersion'),
    otStreet: text('otStreet'),
    otNumber: text('otNumber'),
    identifiersJson: text('identifiersJson'),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    index('address2d_streetId_idx').on(table.streetId),
    index('address2d_division_idx').on(
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

export const address2dVersions = sqliteTable(
  'address2dVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
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
    geometry: text('geometryJson'),
    identifiersJson: text('identifiersJson'),
    otStreet: text('otStreet'),
    otNumber: text('otNumber'),
    otBboxJson: text('otBboxJson'),
    otVersion: text('otVersion'),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address2dVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('address2dVersions_validity_idx').on(
      table.validFromMonth,
      table.validToMonth,
    ),
  ],
)

export const address2dVersionsDatasets = sqliteTable(
  'address2dVersionsDatasets',
  {
    addressId: text('addressId').notNull(),
    versionHash: text('versionHash').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.versionHash, table.datasetId],
    }),
    index('address2dVersionsDatasets_datasetId_idx').on(table.datasetId),
    index('address2dVersionsDatasets_version_idx').on(
      table.addressId,
      table.versionHash,
    ),
  ],
)

export const address2dI18n = sqliteTable(
  'address2dI18n',
  {
    addressId: text('addressId')
      .notNull()
      .references(() => address2d.id),
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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.locale],
    }),
    index('address2dI18n_locale_idx').on(table.locale),
  ],
)

export const address2dVersionsI18n = sqliteTable(
  'address2dVersionsI18n',
  {
    addressId: text('addressId').notNull(),
    versionHash: text('versionHash').notNull(),
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
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.versionHash, table.locale],
    }),
    index('address2dVersionsI18n_locale_idx').on(table.locale),
  ],
)

export const address3d = sqliteTable(
  'address3d',
  {
    id: text('id').primaryKey(),
    address2dId: text('address2dId')
      .notNull()
      .references(() => address2d.id),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [index('address3d_address2dId_idx').on(table.address2dId)],
)

export const address3dVersions = sqliteTable(
  'address3dVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    address2dId: text('address2dId').notNull(),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.id, table.versionHash],
    }),
    index('address3dVersions_current_lookup_idx').on(table.id, table.isCurrent),
    index('address3dVersions_validity_idx').on(
      table.validFromMonth,
      table.validToMonth,
    ),
    index('address3dVersions_datasetId_idx').on(table.datasetId),
    index('address3dVersions_address2dId_idx').on(table.address2dId),
  ],
)

export const address3dI18n = sqliteTable(
  'address3dI18n',
  {
    address3dId: text('address3dId')
      .notNull()
      .references(() => address3d.id),
    locale: text('locale').notNull(),
    formattedAddressPart: text('formattedAddressPart').notNull(),
    accessHint: text('accessHint'),
    unitPortion: text('unitPortion'),
    unitNumber: text('unitNumber'),
    unitType: text('unitType'),
    floorNumber: text('floorNumber'),
    floorType: text('floorType'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.locale],
    }),
    index('address3dI18n_locale_idx').on(table.locale),
  ],
)

export const address3dVersionsI18n = sqliteTable(
  'address3dVersionsI18n',
  {
    address3dId: text('address3dId').notNull(),
    versionHash: text('versionHash').notNull(),
    locale: text('locale').notNull(),
    formattedAddressPart: text('formattedAddressPart').notNull(),
    accessHint: text('accessHint'),
    unitPortion: text('unitPortion'),
    unitNumber: text('unitNumber'),
    unitType: text('unitType'),
    floorNumber: text('floorNumber'),
    floorType: text('floorType'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.versionHash, table.locale],
    }),
    index('address3dVersionsI18n_locale_idx').on(table.locale),
  ],
)
