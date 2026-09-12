import { resolveDataRegion } from '../schema/region'
import { runWithD1ReadRetry } from '../lib/d1'
import type { StatisticReadSelection } from '../db/statistics'
import type { AppEnv } from '../types'
import type {
  ActiveStatisticSnapshot,
  StatisticListQuery,
  StatisticServiceDependencies,
} from './statistics'

export function statisticDatabases(
  args: Pick<AppEnv['Variables'], 'currentDb' | 'historyDbs'>,
  selection: StatisticReadSelection,
) {
  return selection.mode === 'current' ? [args.currentDb] : args.historyDbs
}

export async function resolveStatisticReadSelection(
  metaDb: AppEnv['Variables']['metaDb'],
  selectors: Pick<
    StatisticListQuery,
    'catalogRevision' | 'releaseSet' | 'knownAt' | 'effectiveAt' | 'region'
  >,
  selected: Pick<
    StatisticReadSelection,
    'datasetCodes' | 'snapshotIds' | 'publications'
  >,
  dependencies: StatisticServiceDependencies,
): Promise<StatisticReadSelection> {
  const explicitSelection = Boolean(
    selectors.catalogRevision ||
      selectors.releaseSet ||
      selectors.knownAt ||
      selectors.effectiveAt,
  )
  if (!explicitSelection) return { mode: 'current', ...selected }
  const periods = [
    ...new Set(
      selected.publications.map(publication => publication.referencePeriodCode),
    ),
  ]
  const latest = await Promise.all(
    periods.map(cohortKey =>
      dependencies.resolveApiReleaseSetSnapshotsForRequest(
        metaDb as never,
        'divisionStatistic',
        {
          cohortKey,
          domainCode: 'government',
          regionCode: resolveDataRegion(selectors.region),
        },
      ),
    ),
  )
  const latestIds = new Set(
    latest.flatMap(
      selection =>
        selection?.snapshots
          .filter(snapshot => snapshot.snapshotResourceType === 'divisionStatistic')
          .map(snapshot => snapshot.snapshotId) ?? [],
    ),
  )
  if (selected.snapshotIds.every(snapshotId => latestIds.has(snapshotId)))
    return { mode: 'current', ...selected }
  const plans = await Promise.all(
    selected.snapshotIds.map(snapshotId =>
      dependencies.resolveSnapshotReplayPlan(metaDb as never, snapshotId),
    ),
  )
  return {
    mode: 'history',
    publications: selected.publications,
    datasetCodes: selected.datasetCodes,
    snapshotIds: [...new Set(plans.flatMap(plan => plan.map(step => step.snapshotId)))],
  }
}

export async function getActiveStatisticSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  selectors: Pick<
    StatisticListQuery,
    | 'region'
    | 'catalogRevision'
    | 'cohort'
    | 'effectiveAt'
    | 'knownAt'
    | 'releaseSet'
    | 'filter[referencePeriod]'
  >,
  dependencies: StatisticServiceDependencies,
  includeAllPeriods = false,
) {
  const selection = await runWithD1ReadRetry(() =>
    dependencies.resolveApiReleaseSetSnapshotsForRequest(
      metaDb as never,
      'divisionStatistic',
      {
        catalogRevision: selectors.catalogRevision,
        // Statistics release sets are published per exact reference period.
        // Keep explicit publication selectors authoritative, but make the
        // required geography period useful without a redundant cohort param.
        cohortKey: selectors.cohort ?? selectors['filter[referencePeriod]'],
        domainCode: 'government',
        effectiveAt: selectors.effectiveAt,
        knownAt: selectors.knownAt,
        regionCode: resolveDataRegion(selectors.region),
        releaseSet: selectors.releaseSet,
      },
    ),
  )
  if (!selection) return null
  const registry = includeAllPeriods
    ? await dependencies.listApiReleaseSetSnapshotsForRegistryRequest(
        metaDb as never,
        'divisionStatistic',
        {
          catalogRevision: selectors.catalogRevision,
          cohortKey: selectors.cohort,
          domainCode: 'government',
          effectiveAt: selectors.effectiveAt,
          knownAt: selectors.knownAt,
          regionCode: resolveDataRegion(selectors.region),
          releaseSet: selectors.releaseSet,
        },
      )
    : null
  if (includeAllPeriods && !registry) return null
  const selectedSnapshots = registry
    ? registry.releaseSets.flatMap(release => release.snapshots)
    : selection.snapshots
  const snapshotIds = selectedSnapshots
    .filter(snapshot => snapshot.snapshotResourceType === 'divisionStatistic')
    .map(snapshot => snapshot.snapshotId)
  if (snapshotIds.length === 0) return null
  const sources = await runWithD1ReadRetry(() =>
    dependencies.listSnapshotSourceReleases(metaDb as never, snapshotIds),
  )
  const periodsBySnapshot = new Map(
    registry
      ? registry.releaseSets.flatMap(release =>
          release.snapshots.map(
            snapshot => [snapshot.snapshotId, release.cohortKey] as const,
          ),
        )
      : selectedSnapshots.map(
          snapshot => [snapshot.snapshotId, selection.releaseSet.cohortKey] as const,
        ),
  )
  const readSelection = await resolveStatisticReadSelection(
    metaDb,
    selectors,
    {
      datasetCodes: [...new Set(sources.map(source => source.datasetCode))],
      snapshotIds,
      publications: sources.map(source => {
        const referencePeriodCode = periodsBySnapshot.get(source.snapshotId)
        if (!referencePeriodCode)
          throw new Error(
            `Missing publication period for Statistics snapshot ${source.snapshotId}.`,
          )
        return {
          datasetCode: source.datasetCode,
          referencePeriodCode,
          snapshotId: source.snapshotId,
        }
      }),
    },
    dependencies,
  )
  return {
    readSelection,
    region: resolveDataRegion(selectors.region),
    datasetCodes: [...new Set(sources.map(source => source.datasetCode))],
    snapshotIds,
    sourceReleaseIds: [...new Set(sources.map(source => source.sourceReleaseId))],
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: 'government',
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
  } satisfies ActiveStatisticSnapshot
}
