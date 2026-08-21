/**
 * Frozen v0 Statistics handler bundle. Keep version-specific exports here when
 * a later API minor changes observable data or response shape.
 */
export {
  getStatisticDetail,
  listStatistics,
  type RequestedStatisticApiVersion,
  type RequestedStatisticVersion,
  type ResolvedStatisticApiVersion,
  type StatisticDetailQuery,
  type StatisticDetailResult,
  type StatisticListQuery,
  type StatisticListResult,
} from '../../services/statistics'
