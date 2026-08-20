import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { building } from '$app/env'
import { paraglideMiddleware } from '@repo/i18n/server'
import { createAuth } from '#lib/server/auth.js'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { initTheme, THEME_STORAGE_KEY } from '#lib/bits/internal/theme.js'
import { recordProductUsage } from '@repo/core/productUsage'

const themeInitScript = '('.concat(
  initTheme.toString(),
  ')(',
  JSON.stringify(THEME_STORAGE_KEY),
  ')',
)

const supportedLocales = ['en', 'zh-Hant', 'zh-Hans'] as const
const getDocumentLocale = (value: string | undefined) =>
  supportedLocales.includes(value as (typeof supportedLocales)[number]) ? value : 'en'

const handleTheme: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get(THEME_STORAGE_KEY)
  const locale = getDocumentLocale(event.cookies.get('PARAGLIDE_LOCALE'))
  const themeAttributes =
    theme === 'light' || theme === 'dark'
      ? theme === 'dark'
        ? ' class="dark" style="color-scheme: dark;"'
        : ' class="" style="color-scheme: light;"'
      : ''

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace('%theme-init%', '<script>'.concat(themeInitScript, '</scr', 'ipt>'))
        .replace(
          `<html lang="en">`,
          `<html lang="${locale}"`.concat(themeAttributes, '>'),
        ),
  })
}

const handleI18n: Handle = async ({ event, resolve }) =>
  paraglideMiddleware(event.request, () => resolve(event))

const handleBetterAuth: Handle = async ({ event, resolve }) => {
  if (!event.platform?.env?.DB_META)
    throw new Error('D1 binding "DB_META" not found - are you running with wrangler?')

  event.locals.auth = createAuth(
    event.platform.env.DB_META,
    event.url.origin,
    event.platform.env,
  )

  const { auth } = event.locals
  const session = await auth.api.getSession({ headers: event.request.headers })

  if (session) {
    event.locals.session = session.session
    event.locals.user = session.user
  }

  const response = await svelteKitHandler({ event, resolve, auth, building })
  if (event.url.pathname.startsWith('/api/auth/')) {
    const path = event.url.pathname
    const method = path.includes('sign-up')
      ? 'sign_up'
      : path.includes('sign-in')
        ? 'sign_in'
        : path.includes('reset-password') || path.includes('request-password-reset')
          ? 'password_reset'
          : path.includes('passkey')
            ? 'passkey'
            : path.includes('callback')
              ? 'social_callback'
              : 'other'
    recordProductUsage(event.platform?.env.PRODUCT_USAGE, {
      event: 'auth.outcome',
      producer: 'atlas-app',
      surface: 'auth',
      route: path,
      entityType: 'auth_method',
      entityId: method,
      outcome: response.status >= 200 && response.status < 400 ? 'success' : 'failure',
      httpStatus: response.status,
    })
  }
  return response
}

export const handle: Handle = sequence(handleTheme, handleI18n, handleBetterAuth)
