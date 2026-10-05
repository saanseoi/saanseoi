import { camelCaseJson } from '@repo/core/jsonKeys'

/** Publisher records and schemas use their native vocabulary, not API field naming. */
export function usesCanonicalResponseKeys(path: string) {
  const match =
    /^\/(?:addresses|divisions|places|stats|streets)\/v\d+(?:\.\d+)?(?:\/(.*))?$/.exec(
      path,
    )
  if (!match) return false
  const endpoint = match[1]?.split('/')[0] ?? ''
  return ![
    'sources',
    'source-schema',
    'source-releases',
    'openapi.json',
    'schema',
    'docs',
  ].includes(endpoint)
}

export { camelCaseJson }

export function isJsonContentType(contentType: string | null) {
  return /^application\/(?:json|[^;\s]+\+json)(?:\s*;|$)/i.test(contentType ?? '')
}
