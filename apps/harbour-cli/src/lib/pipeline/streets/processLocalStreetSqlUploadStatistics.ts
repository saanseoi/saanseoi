import {
  buildDistrictDistributionStatsRows,
  buildLocaleStatsRows,
  createLocaleStatsAccumulator,
  updateLocaleStatsAccumulator,
} from '@repo/core/pipeline/services/metrics/releaseStats'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import type { LandsdStreetMaterialisedStreet } from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type { PreparedStreet } from './processLocalStreetSqlUploadTypes.ts'
import { increment, isNoticeSource } from './processLocalStreetSqlUploadParsing.ts'

export function buildStreetStats(
  records: PreparedStreet[],
  current: LandsdStreetMaterialisedStreet[],
  lifecycle: {
    added: number
    changed: number
    deleted: number
    noOpEvents: number
    restored: number
    versionsCreated: number
  },
  now: string,
) {
  const localeStats = createLocaleStatsAccumulator()
  const districtCounts = new Map<string, number>()
  const noticeTypeCounts = new Map<string, number>()
  const sourceAssetRoleCounts = new Map<string, number>()
  const descriptionCounts = new Map<string, number>()
  const descriptionTotals = new Map<string, number>()
  let pdfExtractionSuccess = 0
  let pdfExtractionFailure = 0
  for (const record of records) {
    if (isNoticeSource(record))
      increment(noticeTypeCounts, record.base.noticeType ?? 'unknown')
    for (const asset of record.evidenceAssets)
      increment(sourceAssetRoleCounts, asset.role)
    if (isNoticeSource(record)) {
      if (record.parserDiagnostics?.status === 'success') pdfExtractionSuccess += 1
      else pdfExtractionFailure += 1
    }
  }
  for (const street of current) {
    updateLocaleStatsAccumulator(
      localeStats,
      street.i18n.map(item => ({
        hasAltName: false,
        hasName: Boolean(item.name),
        isLocaleInferred: false,
        locale: item.locale,
      })),
    )
    for (const districtId of street.districtIds) increment(districtCounts, districtId)
    for (const item of street.i18n) {
      increment(descriptionTotals, item.locale)
      if (item.description) increment(descriptionCounts, item.locale)
    }
  }
  return [
    streetStat('source_events', 'processed_count', 'count', records.length, now),
    streetStat('canonical_streets', 'added_count', 'count', lifecycle.added, now),
    streetStat('canonical_streets', 'changed_count', 'count', lifecycle.changed, now),
    streetStat('canonical_streets', 'deleted_count', 'count', lifecycle.deleted, now),
    streetStat('canonical_streets', 'restored_count', 'count', lifecycle.restored, now),
    streetStat(
      'canonical_streets',
      'versions_created',
      'count',
      lifecycle.versionsCreated,
      now,
    ),
    streetStat('canonical_streets', 'no_op_events', 'count', lifecycle.noOpEvents, now),
    streetStat(
      'current_streets',
      'active_count',
      'count',
      current.filter(street => street.status === 'active').length,
      now,
    ),
    streetStat(
      'current_streets',
      'deleted_count',
      'count',
      current.filter(street => street.status === 'deleted').length,
      now,
    ),
    streetStat(
      'quality',
      'unmatched_district_count',
      'count',
      0,
      now,
      'qualityCheck',
      'district_normalization',
    ),
    streetStat(
      'quality',
      'pdf_extraction_success_count',
      'count',
      pdfExtractionSuccess,
      now,
    ),
    streetStat(
      'quality',
      'pdf_extraction_failure_count',
      'count',
      pdfExtractionFailure,
      now,
    ),
    streetStat('quality', 'unmatched_pdf_mapping_count', 'count', 0, now),
    streetStat('quality', 'ambiguous_lifecycle_target_count', 'count', 0, now),
    ...buildLocaleStatsRows(localeStats),
    ...statRowsForCounts(
      'description_completeness',
      'present_count',
      'count',
      descriptionCounts,
      now,
      'locale',
    ),
    ...statRowsForCounts(
      'description_completeness',
      'total_count',
      'count',
      descriptionTotals,
      now,
      'locale',
    ),
    ...buildDistrictDistributionStatsRows(districtCounts),
    ...statRowsForCounts(
      'notice_type',
      'count',
      'count',
      noticeTypeCounts,
      now,
      'noticeType',
    ),
    ...statRowsForCounts(
      'source_assets',
      'count',
      'count',
      sourceAssetRoleCounts,
      now,
      'role',
    ),
  ] satisfies ReleaseScopedStatsRow[]
}

function statRowsForCounts(
  dimension: string,
  metric: string,
  unit: string,
  counts: Map<string, number>,
  now: string,
  groupBy: string,
) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupValue, value]) =>
      streetStat(dimension, metric, unit, value, now, groupBy, groupValue),
    )
}

function streetStat(
  dimension: string,
  metric: string,
  metricUnit: string,
  value: number,
  now: string,
  groupBy: string | null = null,
  groupValue: string | null = null,
): ReleaseScopedStatsRow {
  return {
    createdAt: now,
    dimension,
    groupBy,
    groupValue,
    metric,
    metricUnit,

    updatedAt: now,
    value,
  }
}
