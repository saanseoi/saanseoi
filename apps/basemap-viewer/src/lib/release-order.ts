export type ComparisonRelease = 'primary' | 'comparison'

export interface ComparisonReleaseOrder {
  oldest: ComparisonRelease
  newest: ComparisonRelease
}

export function resolveReleaseVersion(
  version: string,
  availableVersions: readonly string[],
): string {
  return version === 'latest' ? (availableVersions[0] ?? version) : version
}

export function formatReleaseVersion(version: string, latestLabel: string): string {
  return version === 'latest' ? latestLabel : version
}

/** Returns whether two selections currently identify the same published release. */
export function isSameRelease(
  primaryVersion: string,
  comparisonVersion: string,
  availableVersions: readonly string[],
): boolean {
  return (
    resolveReleaseVersion(primaryVersion, availableVersions) ===
    resolveReleaseVersion(comparisonVersion, availableVersions)
  )
}

/**
 * Orders the selected releases from oldest to newest. The published versions
 * list is newest-first, with an ISO date comparison as a safe fallback.
 */
export function orderComparisonReleases(
  primaryVersion: string,
  comparisonVersion: string,
  availableVersions: readonly string[],
): ComparisonReleaseOrder {
  const resolvedPrimary = resolveReleaseVersion(primaryVersion, availableVersions)
  const resolvedComparison = resolveReleaseVersion(comparisonVersion, availableVersions)
  const primaryIndex = availableVersions.indexOf(resolvedPrimary)
  const comparisonIndex = availableVersions.indexOf(resolvedComparison)

  const primaryIsOlder =
    primaryIndex >= 0 && comparisonIndex >= 0
      ? primaryIndex > comparisonIndex
      : resolvedPrimary.localeCompare(resolvedComparison) < 0

  return primaryIsOlder
    ? { oldest: 'primary', newest: 'comparison' }
    : { oldest: 'comparison', newest: 'primary' }
}
