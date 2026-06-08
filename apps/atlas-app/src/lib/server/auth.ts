import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sveltekitCookies } from 'better-auth/svelte-kit'
import { env } from '$env/dynamic/private'
import { getRequestEvent } from '$app/server'
import { createDb } from '@repo/db'

const createAuthConfig = (baseURL: string) =>
  ({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true },
    plugins: [
      sveltekitCookies(getRequestEvent), // make sure this is the last plugin in the array
    ],
  }) satisfies Omit<Parameters<typeof betterAuth>[0], 'database'>

export const createAuth = (
  d1: D1Database,
  baseURL = env.ORIGIN ?? 'http://localhost:5173',
) =>
  betterAuth({
    ...createAuthConfig(baseURL),
    database: drizzleAdapter(createDb(d1), { provider: 'sqlite' }),
  })

/**
 * DO NOT USE!
 *
 * This instance is used by the `better-auth` CLI for schema generation ONLY.
 * To access `auth` at runtime, use `event.locals.auth`.
 */
const cliDatabase = null as unknown as D1Database

export const auth = createAuth(cliDatabase)
