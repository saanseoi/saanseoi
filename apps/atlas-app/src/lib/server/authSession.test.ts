import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import type { Handle } from '@sveltejs/kit/hooks'
import type { RequestEvent } from '@sveltejs/kit'
import { betterAuth } from 'better-auth/minimal'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { sveltekitCookies } from 'better-auth/svelte-kit'

import { handleAuthSession } from './authSession'
import { authCookieOptions } from './authCookies'

const origin = 'http://localhost:5173'
const secret = 'local-auth-regression-test-secret-at-least-32-characters'

describe('handleAuthSession', () => {
  test('a stale session cannot delete the new callback cookie; the next page is signed in', async () => {
    const user = {
      id: 'fixture-user',
      name: 'Fixture',
      email: 'fixture@example.invalid',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const pendingCookies = new Map<string, { value: string; maxAge?: number }>()
    let event: RequestEvent
    const auth = betterAuth({
      baseURL: origin,
      secret,
      advanced: authCookieOptions,
      database: memoryAdapter({
        user: [user],
        session: [],
        account: [],
        verification: [],
      }),
      plugins: [
        {
          id: 'fixture-callback',
          endpoints: {
            callback: createAuthEndpoint(
              '/callback/fixture',
              { method: 'GET' },
              async ctx => {
                const session = await ctx.context.internalAdapter.createSession(user.id)
                await setSessionCookie(ctx, { session, user })
                throw ctx.redirect('/')
              },
            ),
          },
        },
        sveltekitCookies(() => event),
      ],
    })
    const staleToken = 'session-that-no-longer-exists'
    const signature = createHmac('sha256', secret).update(staleToken).digest('base64')
    const staleCookie = `saanseoi.session_token=${encodeURIComponent(`${staleToken}.${signature}`)}`
    const makeEvent = (path: string, cookie: string) =>
      ({
        url: new URL(path, origin),
        request: new Request(new URL(path, origin), { headers: { cookie } }),
        locals: { auth },
        cookies: {
          set: (name: string, value: string, options: { maxAge?: number }) => {
            pendingCookies.set(name, { value, maxAge: options.maxAge })
          },
        },
      }) as unknown as RequestEvent

    // Establish that this old cookie queues a deletion through the real plugin.
    event = makeEvent('/', staleCookie)
    expect(await auth.api.getSession({ headers: event.request.headers })).toBeNull()
    expect(pendingCookies.get('saanseoi.session_token')?.maxAge).toBe(0)
    pendingCookies.clear()

    event = makeEvent('/api/auth/callback/fixture', staleCookie)
    let resolved = false
    const resolve: Parameters<Handle>[0]['resolve'] = async () => {
      resolved = true
      return new Response('page')
    }
    const response = await handleAuthSession({ event, resolve }, false)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    expect(resolved).toBe(false)
    expect(pendingCookies.has('saanseoi.session_token')).toBe(false)

    const sessionCookie = response.headers
      .getSetCookie()
      .find(cookie => cookie.startsWith('saanseoi.session_token='))
    expect(sessionCookie).toBeDefined()
    event = makeEvent('/', sessionCookie!.split(';')[0])
    await handleAuthSession({ event, resolve }, false)
    expect(resolved).toBe(true)
    expect(event.locals.user?.id).toBe(user.id)
    expect(event.locals.session?.userId).toBe(user.id)

    // Reproduce the browser trace: a conflicting default cookie arrives before
    // a valid default cookie. Neither may mask the app's own session cookie.
    const ownCookie = sessionCookie!.split(';')[0]
    const genericCookie = ownCookie.replace('saanseoi.', 'better-auth.')
    const conflictingCookie = `better-auth.session_token=${encodeURIComponent(`${staleToken}.${createHmac('sha256', 'another-app-secret').update(staleToken).digest('base64')}`)}`
    event = makeEvent('/', `${conflictingCookie}; ${genericCookie}; ${ownCookie}`)
    await handleAuthSession({ event, resolve }, false)
    expect(event.locals.user?.id).toBe(user.id)
    expect(event.locals.session?.userId).toBe(user.id)
  })
})
