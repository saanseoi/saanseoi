import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { building } from '$app/env'
import { paraglideMiddleware } from '@repo/i18n/server'
import { createAuth } from '#lib/server/auth.js'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { initTheme, THEME_STORAGE_KEY } from '#lib/bits/internal/theme.js'

const themeInitScript = '('.concat(
  initTheme.toString(),
  ')(',
  JSON.stringify(THEME_STORAGE_KEY),
  ')',
)

const handleTheme: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get(THEME_STORAGE_KEY)
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
        .replace('<html lang="en">', '<html lang="en"'.concat(themeAttributes, '>')),
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

  return svelteKitHandler({ event, resolve, auth, building })
}

export const handle: Handle = sequence(handleTheme, handleI18n, handleBetterAuth)
