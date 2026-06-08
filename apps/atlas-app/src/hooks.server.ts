import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { building } from '$app/environment'
import { paraglideMiddleware } from '@repo/i18n/server'
import { createAuth } from '$lib/server/auth'
import { svelteKitHandler } from 'better-auth/svelte-kit'

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

export const handle: Handle = sequence(handleI18n, handleBetterAuth)
