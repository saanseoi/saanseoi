import type { ApiRelease } from './types.js'

const domainReleaseSetRefPattern = /^(.+):(latest|first)$/

type ReleaseSetReference = Pick<
  ApiRelease,
  'code' | 'displayStatus' | 'domainCode' | 'status'
>

/**
 * Resolves either an immutable release-set code or a stable domain reference.
 * Registry releases are ordered newest first.
 */
export function resolveReleaseSetRef<T extends ReleaseSetReference>(
  releases: T[] | undefined,
  releaseSetRef: string,
) {
  const directRelease = releases?.find(release => release.code === releaseSetRef)
  if (directRelease) return directRelease

  const domainReference = releaseSetRef.match(domainReleaseSetRefPattern)
  if (!domainReference) return undefined

  const [, domainCode, position] = domainReference
  const domainReleases = releases?.filter(
    release => release.domainCode === domainCode && release.status !== 'draft',
  )

  if (position === 'latest') {
    return (
      domainReleases?.find(release => release.displayStatus === 'current') ??
      domainReleases?.[0]
    )
  }

  return domainReleases?.at(-1)
}
