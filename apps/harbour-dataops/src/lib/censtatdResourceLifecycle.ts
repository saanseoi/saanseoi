export type CenstatdCombinedResourceType =
  | 'division'
  | 'divisionArea'
  | 'divisionStatistic'

export function planCenstatdResourceLifecycle(
  resourceTypes: readonly CenstatdCombinedResourceType[],
  options: { releaseAlreadyExists?: boolean } = {},
) {
  return resourceTypes.map((type, index) => ({
    deferSourcePublish: index < resourceTypes.length - 1,
    reuseExistingRelease: options.releaseAlreadyExists === true || index > 0,
    type,
  }))
}
