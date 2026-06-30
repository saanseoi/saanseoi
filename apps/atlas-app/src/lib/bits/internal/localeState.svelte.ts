import { browser } from '$app/environment'
import { getLocale, setLocale } from '@repo/i18n/runtime'

import type { AppLocale } from './i18n'

const localeState = $state<{ current: AppLocale | null }>({
  current: browser ? (getLocale() as AppLocale) : null,
})

export function getCurrentLocale() {
  if (!browser) return getLocale() as AppLocale

  return localeState.current ?? (getLocale() as AppLocale)
}

export async function updateLocale(nextLocale: AppLocale) {
  if (getLocale() === nextLocale) return

  localeState.current = nextLocale
  await setLocale(nextLocale, { reload: false })
}
