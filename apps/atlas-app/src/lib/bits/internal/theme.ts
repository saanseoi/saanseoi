export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'saanseoi-theme'
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function initTheme(storageKey: string) {
  const stored = window.localStorage.getItem(storageKey)
  const theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

export function getPreferredTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return 'light'
}

export function resolveTheme(): ThemeMode {
  return getStoredTheme() ?? getPreferredTheme()
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function setTheme(theme: ThemeMode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    document.cookie = `${THEME_STORAGE_KEY}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  applyTheme(theme)
}
