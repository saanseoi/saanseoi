import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, timestamps } from './_shared'

export const address2d = sqliteTable(
  'address2d',
  {
    id: text('id').primaryKey(),
    geometry: jsonText('geometry'),
    bbox: jsonText('bbox'),
    countryId: text('countryId'),
    areaId: text('areaId'),
    districtId: text('districtId'),
    townId: text('townId'),
    macrohoodId: text('macrohoodId'),
    villageId: text('villageId'),
    neighbourhoodId: text('neighbourhoodId'),
    hamletId: text('hamletId'),
    microhoodId: text('microhoodId'),
    streetId: text('streetId'),
    identifiers: jsonText('identifiers'),
    sources: jsonText('sources'),
    ...timestamps,
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
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.addressId, table.locale],
    }),
    index('address2dI18n_locale_idx').on(table.locale),
  ],
)

export const address3d = sqliteTable(
  'address3d',
  {
    id: text('id').primaryKey(),
    address2dId: text('address2dId')
      .notNull()
      .references(() => address2d.id),
    sources: jsonText('sources'),
    ...timestamps,
  },
  table => [index('address3d_address2dId_idx').on(table.address2dId)],
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
    ...timestamps,
  },
  table => [
    primaryKey({
      columns: [table.address3dId, table.locale],
    }),
    index('address3dI18n_locale_idx').on(table.locale),
  ],
)
