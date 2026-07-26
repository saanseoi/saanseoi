import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { jsonText, type StreetEvidenceAsset } from '../shared'
import { sourceVersionIndexes, sourceVersioning } from './shared'

export const landsdStreetNoticeApplicationMethods = ['automatic', 'manual'] as const
export const landsdStreetNoticeApplicationDispositions = ['apply', 'noOp'] as const
export const landsdStreetNameChangeScopes = ['whole', 'partial'] as const
export const landsdStreetNoticeTypes = [
  'declaration',
  'change',
  'deletion',
  'intention',
  'corrigendum',
] as const

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

/** Immutable rows from a versioned LandsD Gazetted Street Name PDF. */
export const sourceHkgovLandsdStreetBaselineRecords = sqliteTable(
  'hkgovLandsdStreetBaselineRecords',
  {
    /** Stable internal key derived from the three fields in the baseline PDF table. */
    sourceRecordId: text('sourceRecordId').notNull(),
    /** Opaque SaanSeoi identity minted when this baseline street is accepted. */
    streetId: text('streetId').notNull(),
    /** True when the authoritative state is established by Government Notices. */
    deferToNotices: integer('deferToNotices', {
      mode: 'boolean',
    }).notNull(),
    englishName: text('englishName').notNull(),
    chineseName: text('chineseName').notNull(),
    districtCode: text('districtCode').notNull(),
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetBaselineRecords'),
    index('hkgovLandsdStreetBaselineRecords_street_idx').on(table.streetId),
    index('hkgovLandsdStreetBaselineRecords_deferToNotices_idx').on(
      table.deferToNotices,
    ),
  ],
)

/** Immutable publisher facts extracted from one LandsD Government Notice entry. */
export const sourceHkgovLandsdStreetNotices = sqliteTable(
  'hkgovLandsdStreetNotices',
  {
    /** Stable internal key: notice reference plus the PDF table row ordinal. */
    sourceRecordId: text('sourceRecordId').notNull(),
    /** Gazette date parsed directly from the bilingual notice PDFs. */
    gazetteDate: text('gazetteDate').notNull(),
    /** Publisher's notice classification, parsed from the notice PDF. */
    kind: text('kind', { enum: landsdStreetNoticeTypes }).notNull(),
    /** Publisher Government Notice reference, for example G.N. 377. */
    noticeRef: text('noticeRef').notNull(),
    effectiveDate: text('effectiveDate'),
    /** Literal `Previous G.N.` values from the publisher notice. */
    previousNoticeRefs: jsonText<string[]>('previousNoticeRefs'),
    rawExtractedText: jsonText('rawExtractedText'),
    parserDiagnostics: jsonText('parserDiagnostics'),
    districtCodes: jsonText<string[]>('districtCodes'),
    /** Bilingual Government Notice PDFs and any legally referenced plans. */
    evidenceAssets: jsonText<StreetEvidenceAsset[]>('evidenceAssets').notNull(),
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetNotices'),
    index('hkgovLandsdStreetNotices_gazetteDate_idx').on(table.gazetteDate),
    index('hkgovLandsdStreetNotices_kind_idx').on(table.kind),
    index('hkgovLandsdStreetNotices_noticeRef_idx').on(table.noticeRef),
  ],
)

export const sourceHkgovLandsdStreetNoticeI18n = sqliteTable(
  'hkgovLandsdStreetNoticeI18n',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...sourceVersioning,
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.versionHash, table.locale],
    }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetNoticeI18n'),
    index('hkgovLandsdStreetNoticeI18n_locale_name_idx').on(table.locale, table.name),
  ],
)

/**
 * Persisted reducer input, produced either by deterministic parsing or a manual
 * fixture. It never repeats immutable publisher facts from StreetNotices.
 */
export const sourceHkgovLandsdStreetNoticeApplications = sqliteTable(
  'hkgovLandsdStreetNoticeApplications',
  {
    sourceRecordId: text('sourceRecordId').notNull(),
    method: text('method', { enum: landsdStreetNoticeApplicationMethods }).notNull(),
    disposition: text('disposition', {
      enum: landsdStreetNoticeApplicationDispositions,
    }).notNull(),
    /** Existing logical street to which the notice applies; no cross-shard FK. */
    sourceStreetId: text('sourceStreetId'),
    /** New logical street produced by a declaration or whole-name change. */
    resultStreetId: text('resultStreetId'),
    nameChangeScope: text('nameChangeScope', {
      enum: landsdStreetNameChangeScopes,
    }),
    /** Required when nameChangeScope is partial. */
    retainedDescriptions: jsonText<Record<string, string>>('retainedDescriptions'),
    ...sourceVersioning,
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetNoticeApplications'),
    index('hkgovLandsdStreetNoticeApplications_sourceStreet_idx').on(
      table.sourceStreetId,
    ),
    index('hkgovLandsdStreetNoticeApplications_resultStreet_idx').on(
      table.resultStreetId,
    ),
  ],
)
