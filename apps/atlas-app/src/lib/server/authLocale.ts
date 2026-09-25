import type { BetterAuthOptions } from 'better-auth'
import { toLocale } from '@repo/i18n/runtime'
import type { UserLocale } from '@repo/db'

const matchBrowserLocale = (tag: string): UserLocale | undefined => {
  try {
    const locale = new Intl.Locale(tag)
    if (locale.language === 'en') return 'en'
    if (locale.language === 'zh') {
      const script = locale.maximize().script
      if (script === 'Hant') return 'zh-Hant'
      if (script === 'Hans') return 'zh-Hans'
    }
  } catch {
    // Ignore malformed or wildcard language tags.
  }
  return undefined
}

export const getInitialUserLocale = (
  acceptLanguage?: string | null,
  selectedLocale?: string | null,
): UserLocale => {
  const selected = toLocale(selectedLocale ?? undefined)
  if (selected) return selected

  const preferences = (acceptLanguage ?? '')
    .split(',')
    .map(value => {
      const [tag = '', ...parameters] = value.trim().split(';')
      const quality = parameters.find(parameter => parameter.trim().startsWith('q='))
      return {
        tag: tag.trim(),
        quality: quality === undefined ? 1 : Number(quality.trim().slice(2)),
      }
    })
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((left, right) => right.quality - left.quality)

  for (const { tag } of preferences) {
    const locale = matchBrowserLocale(tag)
    if (locale) return locale
  }
  return 'en'
}

export const authLocaleOptions = {
  user: {
    additionalFields: { locale: { type: 'string', required: false, input: false } },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => ({
          data: {
            ...user,
            locale: getInitialUserLocale(
              context?.headers?.get('accept-language'),
              context?.getCookie('PARAGLIDE_LOCALE'),
            ),
          },
        }),
      },
    },
  },
} satisfies Pick<BetterAuthOptions, 'user' | 'databaseHooks'>
