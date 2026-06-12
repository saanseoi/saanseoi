import { describe, expect, test } from 'bun:test'

import app from './index'
import type { AppBindings } from './types'

type MockDbOptions = {
  failOnRun?: (query: string, values: unknown[]) => boolean
}

function createMockDb(options: MockDbOptions = {}) {
  const operations: Array<{ query: string; values: unknown[] }> = []

  return {
    db: {
      prepare(query: string) {
        return {
          values: [] as unknown[],
          bind(...values: unknown[]) {
            this.values = values
            return this
          },
          async first<T>() {
            if (query.includes('SELECT 1 AS ok')) {
              return { ok: 1 } as T
            }

            if (query.includes('COUNT(*) AS "count"')) {
              return { count: 0 } as T
            }

            return null as T
          },
          async run() {
            operations.push({
              query,
              values: this.values,
            })

            if (options.failOnRun?.(query, this.values)) {
              throw new Error('Mock DB write failed')
            }

            return {
              success: true,
            }
          },
          async all<T>() {
            return {
              results: [] as T[],
              success: true,
            }
          },
        }
      },
    } as unknown as D1Database,
    operations,
  }
}

function createEnv(
  overrides: Partial<AppBindings> = {},
  dbOptions: MockDbOptions = {},
) {
  const { db, operations } = createMockDb(dbOptions)

  return {
    env: {
      DB: db,
      DB_META: db,
      DB_CURRENT: db,
      DB_HISTORY_HK_2026: db,
      DB_SOURCE_HK_2026: db,
      ATLAS_BASE_URL: 'http://localhost:8787',
      HARBOUR_BASE_URL: 'http://localhost:8788',
      SUBSTACK_PUBLICATION: 'demo-publication',
      SUBSTACK_SESSION_COOKIE:
        'substack.sid=s%3ADYiS7mTGqE6SdTN-7rB_hI-FYbXML9sL.Uvo1ovQf1%2BmxoCaSrEeoCkovfDAC3HU2URRfswdJsEQ; _ga_TLW0DF6G5V=GS2.1.s1781075256$o4$g1$t1781075559$j52$l0$h0',
      TELEGRAM_BOT_TOKEN: 'telegram-token',
      TELEGRAM_ADMIN_ID: '-1001234567890',
      ...overrides,
    } as AppBindings,
    operations,
  }
}

describe('atlas-api', () => {
  test('GET / redirects to the OpenAPI document', async () => {
    const res = await app.request('http://localhost/')

    expect(res.status).toBe(302)
    expect(res.headers.get('x-powered-by')).toBe('Hono')
    expect(res.headers.get('location')).toBe('/openapi')
  })

  test('GET /v0/meta/health checks DB access', async () => {
    const { env } = createEnv()
    const res = await app.fetch(new Request('http://localhost/v0/meta/health'), env)
    const body = (await res.json()) as {
      ok: boolean
      datasetCount: number
    }

    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      datasetCount: 0,
    })
  })

  test('POST /v0/meta/substack forwards the subscription request to Substack', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv()
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription request accepted.',
        subscriptionState: 'subscribed',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[0]?.input)).toBe(
        'https://demo-publication.substack.com/api/v1/subscriber/add',
      )
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(fetchCalls[0]?.init?.method).toBe('POST')
      expect(fetchCalls[0]?.init?.headers).toMatchObject({
        accept: 'application/json',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        cookie:
          'substack.sid=s%3ADYiS7mTGqE6SdTN-7rB_hI-FYbXML9sL.Uvo1ovQf1%2BmxoCaSrEeoCkovfDAC3HU2URRfswdJsEQ',
        origin: 'https://demo-publication.substack.com',
        pragma: 'no-cache',
        referer: 'https://demo-publication.substack.com/publish/subscribers/add',
      })
      expect(fetchCalls[0]?.init?.body).toBe(
        JSON.stringify({
          email: 'hello@example.com',
          subscription: false,
          sendEmail: true,
        }),
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.values.includes('hello@example.com') &&
            operation.values.includes('pending'),
        ),
      ).toBe(true)
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('subscribed') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack still returns 200 and notifies Telegram when subscribed persistence fails', async () => {
    const originalFetch = globalThis.fetch
    const originalConsoleError = console.error
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const consoleErrors: unknown[] = []

    console.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env } = createEnv(
        {},
        {
          failOnRun: (query, values) =>
            query.includes('insert into "newsletterSubscription"') &&
            query.includes('on conflict') &&
            values.includes('subscribed'),
        },
      )
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
      }

      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        consoleErrors.some(
          entry =>
            Array.isArray(entry) &&
            String(entry[0]).includes('Failed to mark newsletter as subscribed'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalConsoleError
    }
  })

  test('POST /v0/meta/substack returns 500 when the session cookie is missing', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv({
        SUBSTACK_SESSION_COOKIE: '',
      })
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        httpStatus: number
        error: string
        message: string
      }

      expect(res.status).toBe(500)
      expect(body).toEqual({
        httpStatus: 500,
        error: 'substack_not_configured',
        message: 'SUBSTACK_SESSION_COOKIE is not configured.',
      })
      expect(fetchCalls).toHaveLength(1)
      expect(String(fetchCalls[0]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('pending') &&
            operation.values.includes('SUBSTACK_SESSION_COOKIE is not configured.') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack returns 200 and notifies Telegram when Substack rejects the request after persistence', async () => {
    const originalFetch = globalThis.fetch
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      if (String(input).includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env, operations } = createEnv()
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription recorded. We will retry delivery with Substack.',
        subscriptionState: 'pending',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        operations.some(
          operation =>
            operation.query.includes('insert into "newsletterSubscription"') &&
            operation.query.includes('on conflict') &&
            operation.values.includes('pending') &&
            operation.values.includes('Too Many Requests') &&
            operation.values.includes('hello@example.com'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('POST /v0/meta/substack still returns 200 and notifies Telegram when failed persistence logging fails', async () => {
    const originalFetch = globalThis.fetch
    const originalConsoleError = console.error
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const consoleErrors: unknown[] = []

    console.error = (...args: unknown[]) => {
      consoleErrors.push(args)
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })

      if (String(input).includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: {} }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      }

      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as typeof fetch

    try {
      const { env } = createEnv(
        {},
        {
          failOnRun: (query, values) =>
            query.includes('insert into "newsletterSubscription"') &&
            query.includes('on conflict') &&
            values.includes('Too Many Requests'),
        },
      )
      const res = await app.fetch(
        new Request('http://localhost/v0/meta/substack', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'hello@example.com',
          }),
        }),
        env,
      )

      const body = (await res.json()) as {
        ok: boolean
        message: string
        subscriptionState: 'subscribed' | 'pending'
      }

      expect(res.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        message: 'Subscription recorded. We will retry delivery with Substack.',
        subscriptionState: 'pending',
      })
      expect(fetchCalls).toHaveLength(2)
      expect(String(fetchCalls[1]?.input)).toBe(
        'https://api.telegram.org/bottelegram-token/sendMessage',
      )
      expect(
        consoleErrors.some(
          entry =>
            Array.isArray(entry) &&
            String(entry[0]).includes('Failed to mark newsletter as failed'),
        ),
      ).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalConsoleError
    }
  })
})
