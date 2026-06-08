import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { building } from '$app/environment'
import { paraglideMiddleware } from '@repo/i18n/server'
import { createAuth } from '$lib/server/auth'
import { svelteKitHandler } from 'better-auth/svelte-kit'
import { initTheme, THEME_STORAGE_KEY } from '$lib/bits/internal/theme'

const themeInitScript = `(${initTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)})`

const handleTheme: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get(THEME_STORAGE_KEY)
  const themeAttributes =
    theme === 'light' || theme === 'dark'
      ? ` class="${theme === 'dark' ? 'dark' : ''}" style="color-scheme: ${theme};"`
      : ''

  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace('%theme-init%', `<script>${themeInitScript}</script>`)
        .replace('<html lang="en">', `<html lang="en"${themeAttributes}>`),
  })
}

const handleI18n: Handle = async ({ event, resolve }) =>
  paraglideMiddleware(event.request, () => resolve(event))

const handleBetterAuth: Handle = async ({ event, resolve }) => {
  if (!event.platform?.env?.DB)
    throw new Error('D1 binding "DB" not found - are you running with wrangler?')

  event.locals.auth = createAuth(event.platform.env.DB, event.url.origin)

  const { auth } = event.locals
  const session = await auth.api.getSession({ headers: event.request.headers })

  if (session) {
    event.locals.session = session.session
    event.locals.user = session.user
  }

  return svelteKitHandler({ event, resolve, auth, building })
}

export const handle: Handle = sequence(handleTheme, handleI18n, handleBetterAuth)
