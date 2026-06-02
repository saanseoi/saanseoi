import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { divisions } from './divisions'
import { datasets } from './shared'

export const address2d = sqliteTable(
  'address2d',
  {
    id: text('id').primaryKey(),
    canonicalKey: text('canonicalKey').notNull().unique(),
    streetId: text('streetId'),
    microhoodId: text('microhoodId').references(() => divisions.id),
    neighbourhoodId: text('neighbourhoodId').references(() => divisions.id),
    subDistrictId: text('subDistrictId').references(() => divisions.id),
    districtId: text('districtId').references(() => divisions.id),
    regionId: text('regionId').references(() => divisions.id),
    countryId: text('countryId').references(() => divisions.id),
    otLng: real('otLng').notNull(),
    otLat: real('otLat').notNull(),
    otStreet: text('otStreet'),
    otNumber: text('otNumber'),
    otBboxJson: text('otBboxJson'),
    otVersion: text('otVersion'),
    sourcesJson: text('sourcesJson'),
  },
  table => ({
    streetIdx: index('address2d_streetId_idx').on(table.streetId),
    divisionIdx: index('address2d_division_idx').on(
      table.microhoodId,
      table.neighbourhoodId,
      table.subDistrictId,
      table.districtId,
    ),
  }),
)

export const address2dVersions = sqliteTable(
  'address2dVersions',
  {
    id: text('id').notNull(),
    versionHash: text('versionHash').notNull(),
    datasetId: text('datasetId')
      .notNull()
      .references(() => datasets.datasetId),
    validFromMonth: text('validFromMonth').notNull(),
    validToMonth: text('validToMonth'),
    isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
    canonicalKey: text('canonicalKey').notNull(),
    streetId: text('streetId'),
    microhoodId: text('microhoodId'),
    neighbourhoodId: text('neighbourhoodId'),
    subDistrictId: text('subDistrictId'),
    districtId: text('districtId'),
    regionId: text('regionId'),
    countryId: text('countryId'),
    otLng: real('otLng').notNull(),
    otLat: real('otLat').notNull(),
    otStreet: text('otStreet'),
    otNumber: text('otNumber'),
    otBboxJson: text('otBboxJson'),
    otVersion: text('otVersion'),
    sourcesJson: text('sourcesJson'),
    createdAt: text('createdAt').notNull(),
  },
  table => ({
    pk: primaryKey({
      columns: [table.id, table.versionHash],
    }),
    currentLookupIdx: index('address2dVersions_current_lookup_idx').on(
      table.id,
      table.isCurrent,
    ),
    validityIdx: index('address2dVersions_validity_idx').on(
      table.validFromMonth,
      table.validToMonth,
    ),
    datasetIdx: index('address2dVersions_datasetId_idx').on(table.datasetId),
    canonicalIdx: index('address2dVersions_canonicalKey_idx').on(table.canonicalKey),
  }),
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
    intersection: text('intersection'),
  },
  table => ({
    pk: primaryKey({
      columns: [table.addressId, table.locale],
    }),
    localeIdx: index('address2dI18n_locale_idx').on(table.locale),
  }),
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
    intersection: text('intersection'),
  },
  table => ({
    pk: primaryKey({
      columns: [table.addressId, table.versionHash, table.locale],
    }),
    localeIdx: index('address2dVersionsI18n_locale_idx').on(table.locale),
  }),
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
  table => ({
    address2dIdx: index('address3d_address2dId_idx').on(table.address2dId),
  }),
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
  table => ({
    pk: primaryKey({
      columns: [table.id, table.versionHash],
    }),
    currentLookupIdx: index('address3dVersions_current_lookup_idx').on(
      table.id,
      table.isCurrent,
    ),
    validityIdx: index('address3dVersions_validity_idx').on(
      table.validFromMonth,
      table.validToMonth,
    ),
    datasetIdx: index('address3dVersions_datasetId_idx').on(table.datasetId),
    address2dIdx: index('address3dVersions_address2dId_idx').on(table.address2dId),
  }),
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
  },
  table => ({
    pk: primaryKey({
      columns: [table.address3dId, table.locale],
    }),
    localeIdx: index('address3dI18n_locale_idx').on(table.locale),
  }),
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
  },
  table => ({
    pk: primaryKey({
      columns: [table.address3dId, table.versionHash, table.locale],
    }),
    localeIdx: index('address3dVersionsI18n_locale_idx').on(table.locale),
  }),
)
