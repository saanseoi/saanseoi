import { env } from 'cloudflare:workers'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => ({
  // Google OAuth client IDs are public by design. Only this identifier is
  // serialised to the browser; the client secret remains server-only.
  googleClientId: env.GOOGLE_CLIENT_ID ?? null,
})
