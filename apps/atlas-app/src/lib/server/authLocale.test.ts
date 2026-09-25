import { describe, expect, test } from 'bun:test'
import { betterAuth } from 'better-auth/minimal'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { createAuthEndpoint } from 'better-auth/api'
import { authLocaleOptions, getInitialUserLocale } from './authLocale'

describe('initial user locale', () => {
  test.each([
    ['en-GB,en;q=0.9', 'en'],
    ['zh-HK,en;q=0.9', 'zh-Hant'],
    ['zh-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hant-CN', 'zh-Hant'],
    ['zh-Hans-HK', 'zh-Hans'],
    ['en;q=0.5,zh-TW;q=0.9', 'zh-Hant'],
    ['fr-FR,zh-CN;q=0.8,en;q=0.5', 'zh-Hans'],
    ['zh-TW;q=0,zh-CN;q=0.5', 'zh-Hans'],
    ['zh-TW;q=oops,zh-CN;q=2,en-GB', 'en'],
    ['*,invalid_tag,fr-FR', 'en'],
    ['', 'en'],
  ] as const)('maps %s to %s', (header, expected) => {
    expect(getInitialUserLocale(header)).toBe(expected)
  })

  test('preserves the selected site language and ignores invalid cookies', () => {
    expect(getInitialUserLocale('zh-HK', 'en')).toBe('en')
    expect(getInitialUserLocale('en-GB', 'zh-Hans')).toBe('zh-Hans')
    expect(getInitialUserLocale('zh-HK', 'invalid')).toBe('zh-Hant')
    expect(getInitialUserLocale()).toBe('en')
  })

  test('persists locale before verification email and on callback user creation', async () => {
    const database: Record<string, Record<string, unknown>[]> = {
      user: [],
      account: [],
      session: [],
      verification: [],
    }
    let verificationLocale: unknown
    const origin = 'http://localhost:5173'
    const auth = betterAuth({
      baseURL: origin,
      secret: 'locale-test-secret-at-least-32-characters-long',
      database: memoryAdapter(database),
      ...authLocaleOptions,
      emailAndPassword: { enabled: true, requireEmailVerification: true },
      emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user }) => {
          verificationLocale = (user as { locale?: string }).locale
        },
      },
      plugins: [
        {
          id: 'fixture-social-callback',
          endpoints: {
            callback: createAuthEndpoint(
              '/callback/fixture',
              { method: 'GET' },
              async ctx => {
                const user = await ctx.context.internalAdapter.createUser(
                  {
                    name: 'Social user',
                    email: 'social@example.invalid',
                    emailVerified: true,
                  },
                  { method: 'oauth', oauth: { providerId: 'fixture', profile: {} } },
                )
                return ctx.json(user)
              },
            ),
          },
        },
      ],
    })

    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-language': 'zh-HK',
          origin,
        },
        body: JSON.stringify({
          name: 'Email user',
          email: 'email@example.invalid',
          password: 'test-password-123',
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(database.user?.[0]?.locale).toBe('zh-Hant')
    expect(verificationLocale).toBe('zh-Hant')

    const callback = await auth.handler(
      new Request(`${origin}/api/auth/callback/fixture`, {
        headers: { 'accept-language': 'en-GB', cookie: 'PARAGLIDE_LOCALE=zh-Hans' },
      }),
    )
    expect(callback.status).toBe(200)
    expect(database.user?.[1]?.locale).toBe('zh-Hans')
  })
})
