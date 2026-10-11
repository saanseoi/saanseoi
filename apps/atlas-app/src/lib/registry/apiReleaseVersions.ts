export type ApiReleaseVersion = {
  code: string
  apiVersion?: string
  cohortKey?: string | null
  href: string
  label: string
  revision?: number
}

/** API release codes are intentionally human-readable, so navigation is too. */
export function compareApiReleaseVersions(
  left: Pick<ApiReleaseVersion, 'label' | 'apiVersion'>,
  right: Pick<ApiReleaseVersion, 'label' | 'apiVersion'>,
) {
  const contractOrder = (right.apiVersion ?? '').localeCompare(
    left.apiVersion ?? '',
    undefined,
    { numeric: true, sensitivity: 'base' },
  )
  if (contractOrder) return contractOrder
  return right.label.localeCompare(left.label, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function getVisibleApiReleaseVersions(
  versions: ApiReleaseVersion[],
  showAllRevisions: boolean,
  currentVersionCode?: string,
) {
  const sorted = [...versions].sort(compareApiReleaseVersions)
  if (showAllRevisions) return sorted

  const cohorts = new Set<string>()
  return sorted.filter(version => {
    const cohort = `${version.apiVersion ?? ''}:${version.cohortKey ?? version.code}`
    const isCurrentVersion = version.code === currentVersionCode
    if (cohorts.has(cohort) && !isCurrentVersion) return false
    cohorts.add(cohort)
    return true
  })
}
