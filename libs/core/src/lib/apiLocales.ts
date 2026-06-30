export const apiLocales = ['en', 'zh-hant', 'zh-hans'] as const

export type ApiLocale = (typeof apiLocales)[number]
export type ApiProfileName = 'compact' | 'default' | 'full' | 'map'
export type RequestedApiLocale = ApiLocale | (string & {})
export type RequestedApiLocaleSelection =
  | {
      mode: 'all'
      locales: ['*']
    }
  | {
      mode: 'none'
      locales: []
    }
  | {
      mode: 'requested'
      locales: RequestedApiLocale[]
    }

const LOCALE_SEPARATOR = ','
const LOCALE_LANGUAGE_RE = /^[a-z]{2,3}$/
const LOCALE_SCRIPT_RE = /^[a-z]{4}$/
const LOCALE_REGION_RE = /^[a-z]{2}$/
const REQUESTED_LOCALE_EXAMPLES = '"en", "zh-hant", "zh-hant-hk"'
const REQUESTED_LOCALE_LIST_EXAMPLE = '"en,zh-hant"'

export const defaultApiLocalesByProfile: Record<ApiProfileName, ApiLocale[]> = {
  compact: ['en', 'zh-hant'],
  default: ['en', 'zh-hant'],
  full: ['en', 'zh-hant', 'zh-hans'],
  map: ['en', 'zh-hant'],
}

export function isApiLocale(value: string): value is ApiLocale {
  return apiLocales.includes(value as ApiLocale)
}

export function normalizeRequestedApiLocale(value: string) {
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()

  return normalized.length > 0 ? normalized : null
}

function isValidStructuredLocale(value: string) {
  const parts = value.split('-')

  if (!LOCALE_LANGUAGE_RE.test(parts[0] ?? '')) {
    return false
  }

  if (parts.length === 1) {
    return true
  }

  if (parts.length === 2) {
    const secondPart = parts[1] ?? ''
    return LOCALE_SCRIPT_RE.test(secondPart) || LOCALE_REGION_RE.test(secondPart)
  }

  if (parts.length === 3) {
    return (
      LOCALE_SCRIPT_RE.test(parts[1] ?? '') && LOCALE_REGION_RE.test(parts[2] ?? '')
    )
  }

  return false
}

export function getRequestedApiLocalesValidationError(value: string): string | null {
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()

  if (normalized.length === 0) {
    return `locales must be ${REQUESTED_LOCALE_LIST_EXAMPLE}, "*", or "null"`
  }

  if (normalized === '*' || normalized === 'null') {
    return null
  }

  const locales = value.split(LOCALE_SEPARATOR)

  for (const rawLocale of locales) {
    const locale = normalizeRequestedApiLocale(rawLocale)

    if (!locale) {
      return `locales must be a comma-separated list like ${REQUESTED_LOCALE_LIST_EXAMPLE}, "*" for all locales, or "null" for no i18n`
    }

    if (locale === '*' || locale === 'null') {
      return '"*" and "null" must be used on their own'
    }

    if (!isValidStructuredLocale(locale)) {
      return `invalid locale "${locale}"; use lowercase tags like ${REQUESTED_LOCALE_EXAMPLES}, or "*" for all locales, or "null" for no i18n`
    }
  }

  return null
}

export function isValidRequestedApiLocales(value: string): boolean {
  return getRequestedApiLocalesValidationError(value) === null
}

export function parseRequestedApiLocales(
  value: string | undefined,
  defaults: RequestedApiLocaleSelection,
): RequestedApiLocaleSelection {
  if (value === undefined) {
    if (defaults.mode === 'all') {
      return {
        mode: 'all',
        locales: ['*'],
      }
    }

    if (defaults.mode === 'none') {
      return {
        mode: 'none',
        locales: [],
      }
    }

    return {
      mode: 'requested',
      locales: [...defaults.locales],
    }
  }

  const validationError = getRequestedApiLocalesValidationError(value)

  if (validationError) {
    throw new Error(validationError)
  }

  const normalized = value.trim().replaceAll('_', '-').toLowerCase()

  if (normalized === '*') {
    return {
      mode: 'all',
      locales: ['*'],
    }
  }

  if (normalized === 'null') {
    return {
      mode: 'none',
      locales: [],
    }
  }

  const locales = value
    .split(LOCALE_SEPARATOR)
    .map(locale => normalizeRequestedApiLocale(locale))
    .filter((locale): locale is RequestedApiLocale => locale !== null)

  return {
    mode: 'requested',
    locales: [...new Set(locales)],
  }
}
