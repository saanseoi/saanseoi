import type { ApiRelease, RegistryApi } from '#lib/registry/types.js'

export type ReleaseHeaderDomainOption = {
  code: string
  href: string
}

/**
 * Gives each published domain one destination: its newest release. The API
 * registry returns releases newest first, so preserving that order is
 * intentional. Configured domains come first, followed by any legacy or
 * otherwise unconfigured domains that still have published releases.
 */
export function getReleaseHeaderDomainOptions(
  api: RegistryApi,
  currentRelease: ApiRelease,
): ReleaseHeaderDomainOption[] {
  const releasesByDomain = new Map<string, ApiRelease>()

  for (const release of api.releases ?? []) {
    if (release.status === 'draft' && release.code !== currentRelease.code) continue

    const domainCode = release.domainCode ?? 'default'
    if (!releasesByDomain.has(domainCode)) releasesByDomain.set(domainCode, release)
  }

  const currentDomainCode = currentRelease.domainCode ?? 'default'
  if (!releasesByDomain.has(currentDomainCode)) {
    releasesByDomain.set(currentDomainCode, currentRelease)
  }

  const composition = api.apiComposition
    ?.filter(item => item.status === 'current')
    .sort((left, right) => right.version - left.version)[0]
  const configuredDomainCodes = Object.keys(composition?.i18n ?? {})
  const domainCodes = [
    ...configuredDomainCodes.filter(code => releasesByDomain.has(code)),
    ...[...releasesByDomain.keys()].filter(
      code => !configuredDomainCodes.includes(code),
    ),
  ]

  return domainCodes.flatMap(code => {
    const release = releasesByDomain.get(code)
    return release ? [{ code, href: `/apis/${api.familyType}/${release.code}` }] : []
  })
}
