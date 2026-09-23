import type { Handle } from '@sveltejs/kit'
import { svelteKitHandler } from 'better-auth/svelte-kit'

export const handleAuthSession = (
  { event, resolve }: Parameters<Handle>[0],
  building: boolean,
) =>
  svelteKitHandler({
    event,
    auth: event.locals.auth,
    building,
    resolve: async event => {
      // Auth endpoints manage their own cookies. Reading an old session before
      // a callback can queue a deletion that overwrites its new session cookie.
      const session = await event.locals.auth.api.getSession({
        headers: event.request.headers,
      })

      if (session) {
        event.locals.session = session.session
        event.locals.user = session.user
      }

      return resolve(event)
    },
  })
