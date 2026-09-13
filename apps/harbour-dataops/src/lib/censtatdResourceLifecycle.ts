export type CenstatdCombinedResourceType =
  | 'division'
  | 'divisionArea'
  | 'divisionStatistic'

export function planCenstatdResourceLifecycle(
  resourceTypes: readonly CenstatdCombinedResourceType[],
) {
  const totals = new Map<CenstatdCombinedResourceType, number>()
  for (const type of resourceTypes) totals.set(type, (totals.get(type) ?? 0) + 1)
  const seen = new Map<CenstatdCombinedResourceType, number>()
  return resourceTypes.map(type => {
    const occurrence = (seen.get(type) ?? 0) + 1
    seen.set(type, occurrence)
    const total = totals.get(type) ?? 1
    return {
      // Multiple snapshot cohorts share one resource release. Keep it open until
      // its final cohort, then publish all snapshots attached to the release.
      deferSourcePublish: occurrence < total,
      reuseExistingRelease: occurrence > 1,
      type,
    }
  })
}
