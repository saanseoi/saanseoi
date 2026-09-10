import { env } from 'cloudflare:workers'
import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { getAuthRedirectPath } from '#lib/authRedirect.js'

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user && !url.searchParams.has('error'))
    redirect(303, getAuthRedirectPath(url.searchParams.get('next'), url))
  return {
    // Google OAuth client IDs are public by design. Only this identifier is
    // serialised to the browser; the client secret remains server-only.
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
  }
}
