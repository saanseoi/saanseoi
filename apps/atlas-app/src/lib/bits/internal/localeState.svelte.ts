import { getLocale, setLocale } from '@repo/i18n/runtime'
import { setUserLocale } from '#lib/locale.remote.js'
import type { AppLocale } from './i18n'

export function getCurrentLocale() {
  return getLocale() as AppLocale
}

export async function updateLocale(nextLocale: AppLocale) {
  if (getLocale() === nextLocale) return

  try {
    await setUserLocale(nextLocale)
  } catch (error) {
    console.error('Unable to persist locale preference.', error)
  }

  await setLocale(nextLocale)
}
