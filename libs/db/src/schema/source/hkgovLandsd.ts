import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { jsonText, type StreetEvidenceAsset } from '../shared'
import {
  sourceReleaseRevisionAssertionColumns,
  sourceReleaseRevisionIndexes,
  sourceSpatialAssertionColumns,
  sourceVersionedAssertionColumns,
  sourceVersionIndexes,
  sourceVersionedRecordColumns,
} from './shared'

export type LandsdPlaceName = {
  nameEn: string | null
  nameZhHant: string | null
  status: 'Alias' | 'Official'
}

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
 * Complete native LandsD Place Name feature records.
 *
 * The divisions product selects only Settlement rows; Hydrographic and
 * Topographic records remain first-class publisher source data for a future
 * places projection.
 */
export const sourceHkgovLandsdPlaceNames = sqliteTable(
  'hkgovLandsdPlaceNames',
  {
    ...sourceSpatialAssertionColumns(),
    /** Native relationship rows absent from the parent feature rawProperties. */
    placeNames: jsonText<LandsdPlaceName[]>('placeNames').notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdPlaceNames'),
  ],
)

/** Immutable rows from a versioned LandsD Gazetted Street Name PDF. */
export const sourceHkgovLandsdStreetBaselineRecords = sqliteTable(
  'hkgovLandsdStreetBaselineRecords',
  {
    /** Stable internal key derived from the three fields in the baseline PDF table. */
    ...sourceVersionedAssertionColumns(),
    /** True when the authoritative state is established by Government Notices. */
    deferToNotices: integer('deferToNotices', {
      mode: 'boolean',
    }).notNull(),
    /** Publisher labels from the Gazetted Street Name PDF. */
    nameEn: text('nameEn').notNull(),
    nameZhHant: text('nameZhHant').notNull(),
    districtCode: text('districtCode').notNull(),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetBaselineRecords'),
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
    ...sourceVersionedAssertionColumns(),
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
    /** Publisher labels parsed from the paired bilingual notice PDFs. */
    nameEn: text('nameEn').notNull(),
    nameZhHant: text('nameZhHant').notNull(),
    descriptionEn: text('descriptionEn'),
    descriptionZhHant: text('descriptionZhHant'),
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

/**
 * Auditable reducer decision, produced either by deterministic parsing or a
 * manual fixture and keyed to exact notice evidence. Canonical street identity
 * is materialised only in canonical records, never in source storage.
 */
export const sourceHkgovLandsdStreetNoticeApplications = sqliteTable(
  'hkgovLandsdStreetNoticeApplications',
  {
    ...sourceVersionedRecordColumns(),
    method: text('method', { enum: landsdStreetNoticeApplicationMethods }).notNull(),
    disposition: text('disposition', {
      enum: landsdStreetNoticeApplicationDispositions,
    }).notNull(),
    nameChangeScope: text('nameChangeScope', {
      enum: landsdStreetNameChangeScopes,
    }),
    /** Required when nameChangeScope is partial. */
    retainedDescriptions: jsonText<Record<string, string>>('retainedDescriptions'),
  },
  table => [
    primaryKey({ columns: [table.sourceRecordId, table.versionHash] }),
    ...sourceVersionIndexes(table, 'hkgovLandsdStreetNoticeApplications'),
  ],
)

/**
 * Immutable LandsD Road Centreline source segment. Segments without publisher
 * street names are retained; only matched records become canonical street
 * geometry. Publisher attributes are preserved in rawProperties.
 */
export const sourceHkgovLandsdRoadCentrelines = sqliteTable(
  'hkgovLandsdRoadCentrelines',
  {
    ...sourceReleaseRevisionAssertionColumns(),
    rawProperties: jsonText('rawProperties'),
    /** Native EPSG:2326 geometry from the FileGDB. */
    sourceGeometry: jsonText('sourceGeometry').notNull(),
  },
  table => [
    primaryKey({
      columns: [table.sourceRecordId, table.releaseId, table.versionHash],
    }),
    ...sourceReleaseRevisionIndexes(table, 'hkgovLandsdRoadCentrelines'),
  ],
)
