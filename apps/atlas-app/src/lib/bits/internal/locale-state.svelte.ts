import { getLocale, setLocale } from '@repo/i18n/runtime'

import type { AppLocale } from './i18n'

const localeState = $state({
  current: getLocale() as AppLocale,
})

export function getCurrentLocale() {
  return localeState.current
}

export async function updateLocale(nextLocale: AppLocale) {
  if (localeState.current === nextLocale) return

  localeState.current = nextLocale
  await setLocale(nextLocale, { reload: false })
}
