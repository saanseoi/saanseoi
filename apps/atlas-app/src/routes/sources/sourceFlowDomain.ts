import type { SourcesPageSource } from '#lib/registry/meta.remote.js'

/**
 * Source variants describe publisher material (for example, a census), while
 * flow domains describe the API-facing domain. Statistics currently use the
 * single Official Statistics domain.
 */
export const sourceFlowDomain = (source: SourcesPageSource, familyType: string) => {
  if (['addresses', 'stats', 'streets'].includes(familyType)) return 'official'

  if (
    source.theme !== 'divisions' &&
    !source.resourceTypes.some(resourceType =>
      ['division', 'divisionArea', 'divisionBoundary'].includes(resourceType),
    )
  ) {
    return 'default'
  }

  // Settlement Place Names is its own HKGOV division domain. Its published
  // release metadata predates that composition, so it must not take the old
  // Geographic assignment from releaseAs.
  if (familyType === 'divisions' && source.publisherCode === 'hkgov-landsd') {
    return 'hkgov-landsd'
  }

  const publishedDomain = source.sourceVersions
    ?.find(version => version.status === 'published')
    ?.releaseAs.find(release => release.apiFamily === familyType)?.domainCode
  if (publishedDomain) return publishedDomain

  if (
    source.sourceVariant === 'overture' ||
    source.sourceVariant === 'hkgov-had' ||
    /^(?:hkgov-censtatd|hkgov-censtatd-landclipped)(?::simplified)?$/.test(
      source.sourceVariant,
    )
  ) {
    return 'geographic'
  }

  if (source.sourceVariant === 'default') {
    return source.publisherCode === 'hkgov-landsd' ? 'hkgov-landsd' : 'geographic'
  }

  return source.sourceVariant
}

/**
 * The source-flow card represents the API composition's primary dataset, not
 * simply the first source that happens to emit a division resource. In
 * Geographic, C&SD geometry sources also emit canonical-division artefacts,
 * but Overture Divisions remains the primary dataset.
 */
export const sourceFlowPriority = (
  source: SourcesPageSource,
  familyType: string,
  domain: string,
  primaryType: string,
) => {
  if (
    familyType === 'divisions' &&
    domain === 'geographic' &&
    source.code === 'ds-hk-overture-division'
  ) {
    return 0
  }

  return source.resourceTypes.includes(primaryType) ? 1 : 2
}
