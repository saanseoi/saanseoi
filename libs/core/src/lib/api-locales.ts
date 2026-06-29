export const apiLocales = ['en', 'zhHant', 'zhHans'] as const

export type ApiLocale = (typeof apiLocales)[number]
export type ApiProfileName = 'compact' | 'default' | 'full' | 'map'

export const defaultApiLocalesByProfile: Record<ApiProfileName, ApiLocale[]> = {
  compact: [],
  default: ['en', 'zhHant'],
  full: ['en', 'zhHant', 'zhHans'],
  map: ['en', 'zhHant'],
}

export function isApiLocale(value: string): value is ApiLocale {
  return apiLocales.includes(value as ApiLocale)
}

export function isValidRequestedApiLocales(value: string): boolean {
  if (value.trim().toLowerCase() === 'none') {
    return true
  }

  return value
    .split(',')
    .map(locale => locale.trim())
    .every(locale => locale.length > 0 && isApiLocale(locale))
}

export function parseRequestedApiLocales(
  value: string | undefined,
  defaults: ApiLocale[],
): ApiLocale[] {
  if (!value) {
    return defaults
  }

  if (value.trim().toLowerCase() === 'none') {
    return []
  }

  const locales = value
    .split(',')
    .map(locale => locale.trim())
    .filter((locale): locale is ApiLocale => isApiLocale(locale))

  return [...new Set(locales)]
}
