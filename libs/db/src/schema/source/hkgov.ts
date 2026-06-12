import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { sourceRecordColumns, sourceRecordIndexes } from './_shared'

export const sourceHkgovAlsAddresses2d = sqliteTable(
  'sourceHkgovAlsAddresses2d',
  {
    ...sourceRecordColumns,
    regionCode: text('regionCode').notNull(),
    geoAddress: text('geoAddress'),
    csuId: text('csuId'),
    x: real('x'),
    y: real('y'),
    geometryJson: text('geometryJson'),
    districtCode: text('districtCode'),
    districtName: text('districtName'),
    estateName: text('estateName'),
    buildingName: text('buildingName'),
    blockNumber: text('blockNumber'),
    blockDescriptor: text('blockDescriptor'),
    phaseName: text('phaseName'),
    phaseNumber: text('phaseNumber'),
    floor: text('floor'),
    unit: text('unit'),
    streetNumber: text('streetNumber'),
    streetName: text('streetName'),
    villageName: text('villageName'),
    dataOwner: text('dataOwner'),
    rawPayloadJson: text('rawPayloadJson'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId],
    }),
    ...sourceRecordIndexes(table, 'sourceHkgovAlsAddresses2d'),
    index('sourceHkgovAlsAddresses2d_regionCode_idx').on(table.regionCode),
    index('sourceHkgovAlsAddresses2d_csuId_idx').on(table.csuId),
    index('sourceHkgovAlsAddresses2d_geoAddress_idx').on(table.geoAddress),
    index('sourceHkgovAlsAddresses2d_street_lookup_idx').on(
      table.regionCode,
      table.streetName,
      table.streetNumber,
    ),
  ],
)

export const sourceHkgovAlsAddress2dI18n = sqliteTable(
  'sourceHkgovAlsAddress2dI18n',
  {
    releaseId: text('releaseId').notNull(),
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    formattedAddress: text('formattedAddress'),
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
    villageName: text('villageName'),
    districtName: text('districtName'),
  },
  table => [
    primaryKey({
      columns: [table.releaseId, table.sourceRecordId, table.locale],
    }),
    index('sourceHkgovAlsAddress2dI18n_locale_idx').on(table.locale),
  ],
)
