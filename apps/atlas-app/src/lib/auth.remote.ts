import { command, getRequestEvent } from '$app/server'
import { redirect } from '@sveltejs/kit'

export const signOut = command(async () => {
  const event = getRequestEvent()
  await event.locals.auth.api.signOut({ headers: event.request.headers })
  redirect(303, '/')
})
