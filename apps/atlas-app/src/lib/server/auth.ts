import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sveltekitCookies } from 'better-auth/svelte-kit'
import { passkey } from '@better-auth/passkey'

import {
  BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  ORIGIN,
} from '$app/env/private'

import { getRequestEvent } from '$app/server'
import { createMetaDb } from '@repo/db/client'
import { createAuthEmail } from './auth-email'

const sendAuthEmail = (input: {
  to: string
  subject: string
  text: string
  html: string
}) => {
  const event = getRequestEvent()
  const platform = event.platform
  const email = platform?.env.EMAIL

  if (!email) throw new Error('Email binding "EMAIL" not found.')
  platform.ctx.waitUntil(
    email.send({
      to: input.to,
      from: { email: 'noreply@saanseoi.hk', name: 'SaanSeoi' },
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  )
}

const getPreferredLocale = (user: unknown) =>
  (user as { locale?: string | null }).locale

type AuthEnvironment = {
  BETTER_AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  FACEBOOK_CLIENT_ID?: string
  FACEBOOK_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

const localAuthEnvironment: AuthEnvironment = {
  BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
}

const createSocialProviders = (authEnv: AuthEnvironment) => ({
  ...(authEnv.GOOGLE_CLIENT_ID && authEnv.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: authEnv.GOOGLE_CLIENT_ID,
          clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
          prompt: 'select_account' as const,
          overrideUserInfoOnSignIn: true,
        },
      }
    : {}),

  ...(authEnv.FACEBOOK_CLIENT_ID && authEnv.FACEBOOK_CLIENT_SECRET
    ? {
        facebook: {
          clientId: authEnv.FACEBOOK_CLIENT_ID,
          clientSecret: authEnv.FACEBOOK_CLIENT_SECRET,
        },
      }
    : {}),

  ...(authEnv.GITHUB_CLIENT_ID && authEnv.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: authEnv.GITHUB_CLIENT_ID,
          clientSecret: authEnv.GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
})

const createAuthConfig = (baseURL: string, authEnv: AuthEnvironment) =>
  ({
    baseURL,
    secret: authEnv.BETTER_AUTH_SECRET,
    account: {
      accountLinking: {
        allowDifferentEmails: true,
        trustedProviders: ['facebook'],
        updateUserInfoOnLink: true,
      },
    },
    user: {
      additionalFields: { locale: { type: 'string', required: false, input: false } },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendAuthEmail({
          to: user.email,
          ...createAuthEmail('reset', getPreferredLocale(user), url, user.name),
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendAuthEmail({
          to: user.email,
          ...createAuthEmail('verify', getPreferredLocale(user), url, user.name),
        })
      },
    },
    socialProviders: createSocialProviders(authEnv),
    plugins: [
      passkey({
        rpID: new URL(baseURL).hostname,
        rpName: 'SaanSeoi',
        origin: baseURL,
      }),
      sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
    ],
  }) satisfies Omit<Parameters<typeof betterAuth>[0], 'database'>

export const createAuth = (
  d1: D1Database,
  baseURL = ORIGIN || 'http://localhost:5173',
  authEnv: AuthEnvironment = localAuthEnvironment,
) =>
  betterAuth({
    ...createAuthConfig(baseURL, authEnv),
    database: drizzleAdapter(createMetaDb(d1), { provider: 'sqlite' }),
  })

/**
 * DO NOT USE!
 *
 * This instance is used by the `better-auth` CLI for schema generation ONLY.
 * To access `auth` at runtime, use `event.locals.auth`.
 */
const cliDatabase = null as unknown as D1Database

export const auth = createAuth(cliDatabase)
