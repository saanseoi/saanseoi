import { getLocale, locales, setLocale } from '@repo/i18n/runtime'
import {
  language_option_en,
  language_option_zh_hans,
  language_option_zh_hant,
} from '@repo/i18n/messages'

import { getCurrentLocale, updateLocale } from './localeState.svelte'
import type { AppLocale, MessageKey } from './localisedMessages'

// Preserve Paraglide's generated namespace as an ESM re-export. Its message
// modules are side-effect-free, so Vite can retain only properties used by an
// individual client entry.
export { m } from '@repo/i18n/messages'
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

export const localeOptions = [
  { value: 'en', label: language_option_en },
  { value: 'zh-Hant', label: language_option_zh_hant },
  { value: 'zh-Hans', label: language_option_zh_hans },
] as const satisfies ReadonlyArray<{ value: AppLocale; label: () => string }>
