import { getLocale, locales, setLocale } from '@repo/i18n/runtime'

import { getCurrentLocale, updateLocale } from './localeState.svelte'
import {
  getLocalisedMessage,
  type AppLocale,
  type MessageKey,
} from './localisedMessages'

export { getLocale, locales, setLocale }
export { getCurrentLocale, updateLocale }
export { getLocalisedMessage }
export type { AppLocale, MessageKey }

export function selectLocalisedRow<T extends { locale: string }>(
  rows: readonly T[] | null | undefined,
  locale: AppLocale,
) {
  const registryLocale = locale.toLowerCase()

  return (
    rows?.find(row => row.locale.toLowerCase() === registryLocale) ??
    rows?.find(row => row.locale.toLowerCase() === 'en')
  )
}

function resolveMessage(key: MessageKey) {
  return getLocalisedMessage(key, getCurrentLocale())
}

export const m = new Proxy({} as { [K in MessageKey]: () => string }, {
  get: (_, property) => {
    const key = property as MessageKey
    return () => resolveMessage(key)
  },
})

export const localeOptions = [
  { value: 'en', label: () => m.language_option_en() },
  { value: 'zh-Hant', label: () => m.language_option_zh_hant() },
  { value: 'zh-Hans', label: () => m.language_option_zh_hans() },
] as const satisfies ReadonlyArray<{ value: AppLocale; label: () => string }>
