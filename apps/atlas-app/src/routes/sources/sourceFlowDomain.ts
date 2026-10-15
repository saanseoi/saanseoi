import type { SourcesPageSource } from '#lib/registry/meta.remote.js'

/**
 * Source variants describe publisher material (for example, a census), while
 * flow domains describe the API-facing domain. Statistics use the Government
 * domain, while Streets use the SaanSeoi domain.
 */
export const sourceFlowDomain = (source: SourcesPageSource, familyType: string) => {
  if (familyType === 'addresses') return 'saanseoi'
  if (familyType === 'stats') return 'government'
  if (familyType === 'streets') return 'saanseoi'
  if (
    familyType === 'divisions' &&
    [
      'ds-hk-protomaps-island',
      'ds-hk-saanseoi-division',
      'ds-hk-hkgov-landsd-division',
    ].includes(source.code)
  )
    return 'geographic'

  if (
    source.theme !== 'divisions' &&
    !source.resourceTypes.some(resourceType =>
      ['division', 'divisionArea', 'divisionBoundary'].includes(resourceType),
    )
  ) {
    return 'default'
  }

  const publishedDomain = source.sourceVersions
    ?.find(version => version.status === 'current')
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
    return 'geographic'
  }

  return source.sourceVariant
}

/**
 * The source-flow card represents the API composition's primary dataset, not
 * simply the first source that happens to emit a division resource. In
 * Geographic, SaanSeoi owns the curated divisions and their selected areas.
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
    source.code === 'ds-hk-saanseoi-division'
  ) {
    return 0
  }

  if (familyType === 'divisions' && domain === 'geographic') {
    if (source.code === 'ds-hk-overture-division') return 2
    return source.resourceTypes.includes(primaryType) ? 3 : 4
  }

  return source.resourceTypes.includes(primaryType) ? 1 : 2
}
