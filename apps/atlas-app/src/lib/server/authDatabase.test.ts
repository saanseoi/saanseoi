import { expect, test } from 'bun:test'
import { betterAuth } from 'better-auth/minimal'
import { passkey } from '@better-auth/passkey'
import { createAuthDatabase } from './authDatabase'

test('the D1 auth adapter exposes the core and passkey schema to Better Auth', async () => {
  const auth = betterAuth({
    baseURL: 'http://localhost:5173',
    secret: 'auth-schema-test-secret-at-least-32-characters',
    database: createAuthDatabase({} as D1Database),
    plugins: [passkey()],
  })

  const context = await auth.$context
  expect(context.checkSchema).toBeFunction()
  await context.checkSchema!()
})
