const DEFAULT_AUTH_REDIRECT = '/api-keys'

/** Returns a same-origin application path suitable for post-authentication navigation. */
export function getAuthRedirectPath(
  candidate: string | null | undefined,
  currentUrl: { origin: string },
  fallback = DEFAULT_AUTH_REDIRECT,
) {
  if (!candidate || candidate.includes('\\')) return fallback

  try {
    const target = new URL(candidate, currentUrl.origin)
    if (target.origin !== currentUrl.origin) return fallback

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}
