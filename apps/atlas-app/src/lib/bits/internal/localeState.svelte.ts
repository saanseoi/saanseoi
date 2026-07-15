import { browser } from '$app/environment'
import { getLocale, setLocale } from '@repo/i18n/runtime'

import { setUserLocale } from '$lib/locale.remote'

import type { AppLocale } from './i18n'

const localeState = $state<{ current: AppLocale | null }>({
  current: browser ? (getLocale() as AppLocale) : null,
})

export function getCurrentLocale() {
  if (!browser) return getLocale() as AppLocale

  return localeState.current ?? (getLocale() as AppLocale)
}

export function updateLocale(nextLocale: AppLocale) {
  if (getLocale() === nextLocale) return

  localeState.current = nextLocale
  void Promise.all([
    setLocale(nextLocale, { reload: false }),
    setUserLocale(nextLocale),
  ]).catch(error => {
    console.error('Unable to persist locale preference.', error)
  })
}
