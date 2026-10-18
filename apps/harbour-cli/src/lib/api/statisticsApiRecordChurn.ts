import { pairStatisticRecords } from '@repo/core/pipeline/services/statistics/statisticRecordComparison'
import type { StatisticsStatsData } from './statisticsApiReleaseSetStats'

type RecordRow = StatisticsStatsData['records'][number]

/** Compare continuing geography packs across exact-period cohorts. */
export function buildStatisticsRecordChurn(
  current: RecordRow[],
  previous: RecordRow[] = [],
) {
  const counts = {
    count: current.length,
    added_count: 0,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  }
  for (const pair of pairStatisticRecords(current, previous))
    counts[`${pair.type}_count`]++
  return counts
}
