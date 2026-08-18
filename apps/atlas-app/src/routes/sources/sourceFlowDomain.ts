import type { SourcesPageSource } from '#lib/registry/meta.remote.js'

/**
 * Source variants describe publisher material (for example, a census), while
 * flow domains describe the API-facing domain. Statistics currently use the
 * single default Stats domain.
 */
export const sourceFlowDomain = (source: SourcesPageSource, familyType: string) => {
  if (familyType === 'stats') return 'default'

  if (source.theme !== 'divisions') return 'default'

  const publishedDomain = source.sourceVersions
    ?.find(version => version.status === 'published')
    ?.releaseAs.find(release => release.apiFamily === familyType)?.domainCode
  if (publishedDomain) return publishedDomain

  return source.sourceVariant === 'default'
    ? source.publisherCode
    : source.sourceVariant
}
