import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import {
  sourceAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

export const sourceHkgovAlsAddresses2d = sqliteTable(
  'hkgovAlsAddresses2d',
  {
    ...sourceAssertionColumns(),
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
    identifiers: jsonText('identifiers'),
    easting: real('easting'),
    northing: real('northing'),
    geometry: jsonText('geometry'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddresses2d'),
    index('hkgovAlsAddresses2d_identifiers_idx').on(table.identifiers),
    index('hkgovAlsAddresses2d_street_lookup_idx').on(
      table.streetName,
      table.streetNumber,
    ),
  ],
)

export const sourceHkgovAlsAddress2dI18n = sqliteTable(
  'hkgovAlsAddress2dI18n',
  {
    ...sourceVersionedRecordColumns(),
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
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddress2dI18n'),
    index('hkgovAlsAddress2dI18n_locale_idx').on(table.locale),
  ],
)
