import { defineEnvVars } from '@sveltejs/kit/env'

// These optional credentials deliberately retain the former dynamic-env fallback.
export const variables = defineEnvVars({
  PUBLIC_ATLAS_API_BASE_URL: { public: true, schema: input => input ?? '' },
  BETTER_AUTH_SECRET: { schema: input => input ?? '' },
  GOOGLE_CLIENT_ID: { schema: input => input ?? '' },
  GOOGLE_CLIENT_SECRET: { schema: input => input ?? '' },
  FACEBOOK_CLIENT_ID: { schema: input => input ?? '' },
  FACEBOOK_CLIENT_SECRET: { schema: input => input ?? '' },
  GITHUB_CLIENT_ID: { schema: input => input ?? '' },
  GITHUB_CLIENT_SECRET: { schema: input => input ?? '' },
  ORIGIN: { schema: input => input ?? '' },
})
