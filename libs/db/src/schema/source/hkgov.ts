import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText } from '../shared'
import { sourceVersionIndexes, sourceVersioning } from './shared'

export const sourceHkgovAlsAddresses2d = sqliteTable(
  'hkgovAlsAddresses2d',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
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
    sources: jsonText('sources'),
    geometry: jsonText('geometry'),
    rawProperties: jsonText('rawProperties'),
    ...sourceVersioning,
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
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovAlsAddress2dI18n'),
    index('hkgovAlsAddress2dI18n_locale_idx').on(table.locale),
  ],
)

/**
 * Immutable LandsD street-register evidence. A Gazette notice is a source
 * record in its own right, including corrigenda, deletions, and changes; it is
 * not inferred from the mutable street name.
 */
export const sourceHkgovLandsdStreets = sqliteTable(
  'hkgovLandsdStreets',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    isGazetteNoticeListed: integer('isGazetteNoticeListed', {
      mode: 'boolean',
    }).notNull(),
    landsdPublicationDate: text('landsdPublicationDate'),
    governmentNoticeType: text('governmentNoticeType'),
    district: text('district'),
    districtCodes: jsonText('districtCodes'),
    districtIds: jsonText('districtIds'),
    sourceAssetLinks: jsonText('sourceAssetLinks'),
    sourcePageSnapshots: jsonText('sourcePageSnapshots'),
    translationAudit: jsonText('translationAudit'),
    rawProperties: jsonText('rawProperties'),
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreets'),
    index('hkgovLandsdStreets_publicationDate_idx').on(table.landsdPublicationDate),
    index('hkgovLandsdStreets_noticeType_idx').on(table.governmentNoticeType),
  ],
)

export const sourceHkgovLandsdStreetI18n = sqliteTable(
  'hkgovLandsdStreetI18n',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    district: text('district'),
    governmentNoticeLabel: text('governmentNoticeLabel'),
    governmentNoticeUrl: text('governmentNoticeUrl'),
    gazettePlanUrls: jsonText('gazettePlanUrls'),
    assetLinks: jsonText('assetLinks'),
    translationProvenance: jsonText('translationProvenance'),
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetI18n'),
    index('hkgovLandsdStreetI18n_locale_idx').on(table.locale),
    index('hkgovLandsdStreetI18n_name_idx').on(table.locale, table.name),
  ],
)
