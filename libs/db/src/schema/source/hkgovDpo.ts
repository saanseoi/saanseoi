import { index, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceAssertionColumns, sourceVersionIndexes } from './shared'

/**
 * Publisher-supplied ALS address components in one language. These paired values
 * stay with their source assertion; locale-keyed records belong to canonical/API
 * address snapshots.
 */
export type HkgovAlsAddress = {
  formattedAddress: string
  buildingName: string | null
  buildingNumberExpression: string | null
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  buildingNumberConnector: string | null
  blockExpression: string | null
  blockType: string | null
  blockRef: string | null
  blockTypeBeforeNumber: boolean | null
  phaseExpression: string | null
  phaseName: string | null
  phaseRef: string | null
  estateName: string | null
  streetName: string | null
  villageName: string | null
  districtName: string | null
}

export const sourceHkgovAlsAddresses2d = sqliteTable(
  'hkgovAlsAddresses2d',
  {
    ...sourceAssertionColumns(),
    identifiers: jsonText('identifiers'),
    easting: real('easting'),
    northing: real('northing'),
    geometry: jsonText('geometry'),
    addressEn: jsonText<HkgovAlsAddress>('addressEn'),
    addressZhHant: jsonText<HkgovAlsAddress>('addressZhHant'),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddresses2d'),
    index('hkgovAlsAddresses2d_identifiers_idx').on(table.identifiers),
  ],
)
