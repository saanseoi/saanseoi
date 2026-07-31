export type OriginAccessConfig = {
  DIAGNOSTIC_ORIGINS?: string
  DEV_ORIGINS?: string
  CORE_ORIGIN_SUFFIXES?: string
  HUB_ORIGINS?: string
  PREVIEW_PREFIXES?: string
  EXTERNAL_ORIGINS?: string
}

const normalizeCsv = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

const isFirstPartyOrigin = (parsedOrigin: URL, config: OriginAccessConfig) => {
  const hostname = parsedOrigin.hostname.toLowerCase()
  const hubOrigins = normalizeCsv(config.HUB_ORIGINS)
  const derivedPreviewOrigins = hubOrigins.flatMap(hubOrigin => {
    try {
      const parsedHubOrigin = new URL(hubOrigin)
      return normalizeCsv(config.PREVIEW_PREFIXES).map(prefix => {
        const normalizedPrefix = prefix.endsWith('.') ? prefix : `${prefix}.`
        return `${parsedHubOrigin.protocol}//${normalizedPrefix}${parsedHubOrigin.hostname}`
      })
    } catch {
      return []
    }
  })
  const exactOrigins = new Set([
    ...normalizeCsv(config.DIAGNOSTIC_ORIGINS),
    ...normalizeCsv(config.DEV_ORIGINS),
    ...hubOrigins,
    ...derivedPreviewOrigins,
  ])
  if (exactOrigins.has(parsedOrigin.origin)) return true

  const allowedSuffixes = normalizeCsv(config.CORE_ORIGIN_SUFFIXES).map(suffix =>
    suffix.replace(/^\*\./, '.').toLowerCase(),
  )
  return allowedSuffixes.some(suffix => hostname.endsWith(suffix))
}

export const getAllowedOrigin = (
  requestOrigin: string | null,
  config: OriginAccessConfig,
): string => {
  if (!requestOrigin) return ''

  let parsedOrigin: URL
  try {
    parsedOrigin = new URL(requestOrigin)
  } catch {
    return ''
  }

  const origin = parsedOrigin.origin
  if (isFirstPartyOrigin(parsedOrigin, config)) return origin

  const exactOrigins = new Set([...normalizeCsv(config.EXTERNAL_ORIGINS)])
  if (exactOrigins.has('*') || exactOrigins.has(origin)) return origin
  return ''
}

export const applyAccessHeaders = (
  headers: Headers,
  allowedOrigin: string,
): Headers => {
  const responseHeaders = new Headers(headers)
  if (allowedOrigin) responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
  responseHeaders.set('Vary', 'Origin')
  return responseHeaders
}

export const isUnmeteredOrigin = (
  requestOrigin: string | null,
  config: OriginAccessConfig,
) => {
  if (!requestOrigin) return false
  try {
    return isFirstPartyOrigin(new URL(requestOrigin), config)
  } catch {
    return false
  }
}
