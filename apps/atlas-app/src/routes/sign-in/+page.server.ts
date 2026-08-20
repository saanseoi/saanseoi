import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ platform }) => ({
  // Google OAuth client IDs are public by design. Only this identifier is
  // serialised to the browser; the client secret remains server-only.
  googleClientId: platform?.env.GOOGLE_CLIENT_ID ?? null,
})
