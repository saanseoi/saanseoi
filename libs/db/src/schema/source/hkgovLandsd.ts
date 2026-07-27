import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, type StreetEvidenceAsset } from '../shared'
import {
  sourceReleaseRevisionIndexes,
  sourceReleaseRevisionRecordColumns,
  sourceSpatialAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

export const landsdStreetNoticeApplicationMethods = ['automatic', 'manual'] as const
export type LandsdStreetNoticeApplicationMethod =
  (typeof landsdStreetNoticeApplicationMethods)[number]

export const landsdStreetNoticeApplicationDispositions = ['apply', 'noOp'] as const
export type LandsdStreetNoticeApplicationDisposition =
  (typeof landsdStreetNoticeApplicationDispositions)[number]

export const landsdStreetNameChangeScopes = ['whole', 'partial'] as const
export type LandsdStreetNameChangeScope = (typeof landsdStreetNameChangeScopes)[number]

export const landsdStreetNoticeTypes = [
  'declaration',
  'change',
  'deletion',
  'intention',
  'corrigendum',
] as const
export type LandsdStreetNoticeType = (typeof landsdStreetNoticeTypes)[number]

/**
 * Complete native LandsD Place Name feature assertions.
 *
 * The divisions product selects only Settlement rows; Hydrographic and
 * Topographic records remain first-class publisher source data for a future
 * places projection.
 */
export const sourceHkgovLandsdPlaceNames = sqliteTable(
  'hkgovLandsdPlaceNames',
  {
    ...sourceSpatialAssertionColumns(),
    // Geographic Name Identifier
    geoNameId: text('geoNameId').notNull(),
    // Class of Place Name (e.g., Topographic, Hydrographic or Settlement)
    placeClass: text('placeClass').notNull(),
    // Type of Place Name (e.g., Cape, Cave, Hill, Island, Pass, Peninsula, Reef, Rock, Valley,
    // Area, Town, Village, Bay, Channel, Creek, Harbour, River, Strait, Stream or Islands)
    placeType: text('placeType').notNull(),
    // The District Council Code referenced from the District Boundary dataset of the Functional Area FSDT
    district: text('district'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdPlaceNames'),
    index('hkgovLandsdPlaceNames_geoNameId_idx').on(table.geoNameId),
    index('hkgovLandsdPlaceNames_placeClass_idx').on(table.placeClass),
    index('hkgovLandsdPlaceNames_district_idx').on(table.district),
  ],
)

/** Immutable rows from a versioned LandsD Gazetted Street Name PDF. */
export const sourceHkgovLandsdStreetBaselineRecords = sqliteTable(
  'hkgovLandsdStreetBaselineRecords',
  {
    /** Stable internal key derived from the three fields in the baseline PDF table. */
    ...sourceVersionedRecordColumns(),
    /** Opaque SaanSeoi identity minted when this baseline street is accepted. */
    streetId: text('streetId').notNull(),
    /** True when the authoritative state is established by Government Notices. */
    deferToNotices: integer('deferToNotices', {
      mode: 'boolean',
    }).notNull(),
    englishName: text('englishName').notNull(),
    chineseName: text('chineseName').notNull(),
    districtCode: text('districtCode').notNull(),
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
    ...sourceVersionedRecordColumns(),
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
    ...sourceVersionedRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
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
    ...sourceVersionedRecordColumns(),
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

/**
 * Immutable LandsD Road Centreline source segment. `streetId` is validated by
 * the ingestion matcher; it deliberately has no SQL foreign key because the
 * authoritative street state is stored in a separate D1 shard.
 */
export const sourceHkgovLandsdRoadCentrelines = sqliteTable(
  'hkgovLandsdRoadCentrelines',
  {
    ...sourceReleaseRevisionRecordColumns(),
    streetId: text('streetId').notNull(),
    objectId: integer('objectId').notNull(),
    streetCode: text('streetCode').notNull(),
    streetType: text('streetType'),
    sourceGeometry: jsonText('sourceGeometry').notNull(),
    geometry: jsonText('geometry').notNull(),
    bbox: jsonText('bbox').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.releaseId, table.versionHash],
    }),
    ...sourceReleaseRevisionIndexes(table, 'hkgovLandsdRoadCentrelines'),
    index('hkgovLandsdRoadCentrelines_street_idx').on(table.streetId),
    index('hkgovLandsdRoadCentrelines_objectId_idx').on(table.objectId),
  ],
)

export const sourceHkgovLandsdRoadCentrelineI18n = sqliteTable(
  'hkgovLandsdRoadCentrelineI18n',
  {
    ...sourceReleaseRevisionRecordColumns(),
    locale: text('locale').notNull(),
    name: text('name').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.releaseId, table.versionHash, table.locale],
    }),
    ...sourceReleaseRevisionIndexes(table, 'hkgovLandsdRoadCentrelineI18n'),
    index('hkgovLandsdRoadCentrelineI18n_locale_name_idx').on(table.locale, table.name),
  ],
)
