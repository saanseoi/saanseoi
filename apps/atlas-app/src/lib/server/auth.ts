import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sveltekitCookies } from 'better-auth/svelte-kit'
import { passkey } from '@better-auth/passkey'
import { env } from '$env/dynamic/private'
import { getRequestEvent } from '$app/server'
import { getLocale } from '@repo/i18n/runtime'
import enMessages from '@repo/i18n/messages/en/shared.json'
import zhHansMessages from '@repo/i18n/messages/zh-Hans/shared.json'
import zhHantMessages from '@repo/i18n/messages/zh-Hant/shared.json'
import { userLocales } from '@repo/db'
import { createMetaDb } from '@repo/db/client'

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

type AuthLocale = (typeof userLocales)[number]
type AuthMessageKey =
  | 'auth_reset_subject'
  | 'auth_reset_text'
  | 'auth_verify_subject'
  | 'auth_verify_text'
  | 'auth_email_continue'

const messages = {
  en: enMessages,
  'zh-Hant': zhHantMessages,
  'zh-Hans': zhHansMessages,
} as const

const toAuthLocale = (locale: string | null | undefined): AuthLocale | null =>
  userLocales.find(candidate => candidate.toLowerCase() === locale?.toLowerCase()) ??
  null

const getAuthMessage = (locale: AuthLocale, key: AuthMessageKey) =>
  messages[locale][key]

const sendAuthEmail = (input: {
  to: string
  subject: string
  text: string
  url: string
  continueLabel: string
}) => {
  const event = getRequestEvent()
  const platform = event.platform
  const email = platform?.env.EMAIL

  if (!email) throw new Error('Email binding "EMAIL" not found.')

  platform.ctx.waitUntil(
    email.send({
      to: input.to,
      from: { email: 'noreply@saanseoi.hk', name: 'Saanseoi' },
      subject: input.subject,
      text: input.text,
      html: `<p>${escapeHtml(input.text)}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(input.continueLabel)}</a></p>`,
    }),
  )
}

const getEmailLocale = (preferredLocale: string | null | undefined): AuthLocale =>
  toAuthLocale(preferredLocale) ?? toAuthLocale(getLocale()) ?? 'en'

const getPreferredLocale = (user: unknown) =>
  (user as { locale?: string | null }).locale

const createAuthEmail = (
  kind: 'reset' | 'verify',
  preferredLocale: string | null | undefined,
  url: string,
) => {
  const locale = getEmailLocale(preferredLocale)
  const subject = getAuthMessage(locale, `auth_${kind}_subject`)
  const text = getAuthMessage(locale, `auth_${kind}_text`).replace('{url}', url)

  return {
    subject,
    text,
    url,
    continueLabel: getAuthMessage(locale, 'auth_email_continue'),
  }
}

type AuthEnvironment = {
  BETTER_AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  FACEBOOK_CLIENT_ID?: string
  FACEBOOK_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

const createSocialProviders = (authEnv: AuthEnvironment) => ({
  ...(authEnv.GOOGLE_CLIENT_ID && authEnv.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: authEnv.GOOGLE_CLIENT_ID,
          clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
          prompt: 'select_account' as const,
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
      },
    },
    user: {
      additionalFields: {
        locale: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendAuthEmail({
          to: user.email,
          ...createAuthEmail('reset', getPreferredLocale(user), url),
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
          ...createAuthEmail('verify', getPreferredLocale(user), url),
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
  baseURL = env.ORIGIN ?? 'http://localhost:5173',
  authEnv: AuthEnvironment = env,
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
