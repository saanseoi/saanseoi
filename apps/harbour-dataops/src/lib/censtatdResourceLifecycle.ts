export type CenstatdCombinedResourceType =
  | 'division'
  | 'divisionArea'
  | 'divisionStatistic'

export function planCenstatdResourceLifecycle(
  resourceTypes: readonly CenstatdCombinedResourceType[],
) {
  return resourceTypes.map(type => ({
    // Each child completes independently. The parent publication gate waits
    // for the expected resource types, including children absent from this run.
    deferSourcePublish: false,
    reuseExistingRelease: false,
    type,
  }))
}
