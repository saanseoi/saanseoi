import { defineEnvVars } from '@sveltejs/kit/env'
import { z } from 'zod'

const runtimeStringSchema = z.string().optional()

export const variables = defineEnvVars({
  PUBLIC_ATLAS_API_BASE_URL: { public: true, schema: runtimeStringSchema },
  BETTER_AUTH_SECRET: { schema: runtimeStringSchema },
  GOOGLE_CLIENT_ID: { schema: runtimeStringSchema },
  GOOGLE_CLIENT_SECRET: { schema: runtimeStringSchema },
  FACEBOOK_CLIENT_ID: { schema: runtimeStringSchema },
  FACEBOOK_CLIENT_SECRET: { schema: runtimeStringSchema },
  GITHUB_CLIENT_ID: { schema: runtimeStringSchema },
  GITHUB_CLIENT_SECRET: { schema: runtimeStringSchema },
})
