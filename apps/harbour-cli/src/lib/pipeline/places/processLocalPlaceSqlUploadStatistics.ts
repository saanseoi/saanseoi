import {
  buildPlaceLocalisationStatistics,
  type PlaceLocalisationStatistics,
} from '@repo/core/pipeline/services/place'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import type {
  EnrichedPlace,
  PlaceReleaseStatsAccumulator,
} from './processLocalPlaceSqlUploadTypes.ts'

export function buildPlaceReleaseStatsRows(
  places: EnrichedPlace[],
): ReleaseScopedStatsRow[] {
  const accumulator = createPlaceReleaseStatsAccumulator()
  for (const place of places) addPlaceReleaseStats(accumulator, place)
  return buildPlaceReleaseStatsRowsFromAccumulator(accumulator)
}

export function createPlaceReleaseStatsAccumulator(): PlaceReleaseStatsAccumulator {
  return {
    addressLinkedRows: 0,
    divisionLinkedRows: 0,
    localeCounts: new Map(),
    localisedPlaceCount: 0,
    localisedRows: 0,
    localisation: {
      bilingualReferenceNameCount: 0,
      fields: new Map(),
      referenceNameCount: 0,
      totalPlaces: 0,
    },
    processedRows: 0,
  }
}

export function addPlaceReleaseStats(
  accumulator: PlaceReleaseStatsAccumulator,
  enriched: EnrichedPlace,
) {
  accumulator.processedRows += 1
  if (enriched.address2dId || enriched.address3dId) accumulator.addressLinkedRows += 1
  accumulator.divisionLinkedRows += enriched.divisionIds.length
  if (enriched.place.i18n.length) accumulator.localisedPlaceCount += 1
  accumulator.localisedRows += enriched.place.i18n.length
  for (const localised of enriched.place.i18n) {
    accumulator.localeCounts.set(
      localised.locale,
      (accumulator.localeCounts.get(localised.locale) ?? 0) + 1,
    )
  }
  const single = buildPlaceLocalisationStatistics([enriched.place])
  accumulator.localisation.referenceNameCount += single.referenceNameCount
  accumulator.localisation.bilingualReferenceNameCount +=
    single.bilingualReferenceNameCount
  for (const [key, value] of single.fields) {
    const existing = accumulator.localisation.fields.get(key)
    if (existing) {
      existing.valueCount += value.valueCount
      existing.providedCount += value.providedCount
      existing.inferredCount += value.inferredCount
      existing.aiTranslatedCount += value.aiTranslatedCount
      existing.humanTranslatedCount += value.humanTranslatedCount
      existing.conflictCount += value.conflictCount
      continue
    }
    accumulator.localisation.fields.set(key, {
      ...value,
      missingCount: 0,
    })
  }
}

export function buildPlaceReleaseStatsRowsFromAccumulator(
  accumulator: PlaceReleaseStatsAccumulator,
): ReleaseScopedStatsRow[] {
  const localisationStats: PlaceLocalisationStatistics = {
    ...accumulator.localisation,
    fields: new Map(
      [...accumulator.localisation.fields].map(([key, value]) => [
        key,
        {
          ...value,
          missingCount: accumulator.processedRows - value.valueCount,
        },
      ]),
    ),
    totalPlaces: accumulator.processedRows,
  }
  return buildPlaceReleaseStatsRowsFromValues({
    addressLinkedRows: accumulator.addressLinkedRows,
    divisionLinkedRows: accumulator.divisionLinkedRows,
    localeCounts: accumulator.localeCounts,
    localisedPlaceCount: accumulator.localisedPlaceCount,
    localisedRows: accumulator.localisedRows,
    localisationStats,
    processedRows: accumulator.processedRows,
  })
}

function buildPlaceReleaseStatsRowsFromValues(input: {
  addressLinkedRows: number
  divisionLinkedRows: number
  localeCounts: Map<string, number>
  localisedPlaceCount: number
  localisedRows: number
  localisationStats: PlaceLocalisationStatistics
  processedRows: number
}): ReleaseScopedStatsRow[] {
  const timestamp = new Date().toISOString()
  const row = (
    dimension: string,
    value: number,
    groupBy: string | null = null,
    groupValue: string | null = null,
    metric: 'count' | 'percentage' = 'count',
  ): ReleaseScopedStatsRow => ({
    createdAt: timestamp,
    dimension,
    groupBy,
    groupValue,
    metric,
    metricUnit: metric,
    type: 'release',
    updatedAt: timestamp,
    value,
  })

  const statsRows: ReleaseScopedStatsRow[] = [
    row('records', input.processedRows),
    row('localised_records', input.localisedPlaceCount),
    row('localised_rows', input.localisedRows),
    row('address_links', input.addressLinkedRows),
    row('division_links', input.divisionLinkedRows),
    ...[...input.localeCounts.entries()].map(([locale, count]) =>
      row('localised_records', count, 'locale', locale),
    ),
  ]
  for (const [fieldLocale, stats] of input.localisationStats.fields) {
    const [field, locale] = fieldLocale.split('\u0000')
    const grouping = { groupBy: 'field_locale', groupValue: `${field}:${locale}` }
    statsRows.push(
      row(
        'localisation_value_count',
        stats.valueCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_coverage',
        percentage(stats.valueCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_provided_coverage',
        percentage(stats.providedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_inferred_coverage',
        percentage(stats.inferredCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_ai_translated_coverage',
        percentage(stats.aiTranslatedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_human_translated_coverage',
        percentage(stats.humanTranslatedCount, input.processedRows),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_conflict_count',
        stats.conflictCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_missing_value_count',
        stats.missingCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
    )
  }
  const referenceGrouping = { groupBy: 'field', groupValue: 'referenceName' }
  statsRows.push(
    row('reference_name_count', input.localisationStats.referenceNameCount),
    row(
      'reference_name_coverage',
      percentage(input.localisationStats.referenceNameCount, input.processedRows),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
    row(
      'bilingual_reference_name_count',
      input.localisationStats.bilingualReferenceNameCount,
    ),
    row(
      'bilingual_reference_name_coverage',
      percentage(
        input.localisationStats.bilingualReferenceNameCount,
        input.processedRows,
      ),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
  )
  return statsRows
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2))
}
