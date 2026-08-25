import { getLocale, locales, setLocale } from '@repo/i18n/runtime'
import { m as generatedM } from '@repo/i18n/messages'

import { getCurrentLocale, updateLocale } from './localeState.svelte'
import type { AppLocale, MessageKey } from './localisedMessages'

export { getLocale, locales, setLocale }
export { getCurrentLocale, updateLocale }
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

type AppMessages = { [K in MessageKey]: () => string }

// Keep established call sites that interpolate placeholders after lookup while
// sourcing every message directly from Paraglide's generated ESM modules.
export const m = generatedM as unknown as AppMessages

export const localeOptions = [
  { value: 'en', label: () => m.language_option_en() },
  { value: 'zh-Hant', label: () => m.language_option_zh_hant() },
  { value: 'zh-Hans', label: () => m.language_option_zh_hans() },
] as const satisfies ReadonlyArray<{ value: AppLocale; label: () => string }>
