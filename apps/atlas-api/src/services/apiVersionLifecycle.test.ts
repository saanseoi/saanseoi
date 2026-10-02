import { describe, expect, test, vi } from 'vitest'

import { apiVersionLifecycleMiddleware } from './apiVersionLifecycle'

function createContext(path: string, statuses: string[]) {
  const json = vi.fn((body: unknown, status: number) => ({ body, status }))
  const notFound = vi.fn(() => ({ status: 404 }))
  const rows = statuses.map(status => ({ status }))
  const c = {
    req: { path },
    get: () => ({
      $client: {
        prepare: () => ({
          bind: () => ({ all: async () => ({ results: rows }) }),
        }),
      },
    }),
    json,
    notFound,
  }
  return { c, json, notFound }
}

describe('apiVersionLifecycleMiddleware', () => {
  test('returns 410 when every matching API version is retired', async () => {
    const { c, json } = createContext('/divisions/v0.1/123', ['retired'])
    const next = vi.fn()

    await apiVersionLifecycleMiddleware(c as never, next)

    expect(json).toHaveBeenCalledWith(
      {
        error: 'api_version_retired',
        message: 'This API version is no longer available.',
      },
      410,
    )
    expect(next).not.toHaveBeenCalled()
  })

  test('keeps archived API versions readable', async () => {
    const { c } = createContext('/divisions/v0.1/123', ['archived'])
    const next = vi.fn()

    await apiVersionLifecycleMiddleware(c as never, next)

    expect(next).toHaveBeenCalledOnce()
  })

  test('does not expose routes for draft API versions', async () => {
    const { c, notFound } = createContext('/divisions/v0.1/123', ['draft'])
    const next = vi.fn()

    await apiVersionLifecycleMiddleware(c as never, next)

    expect(notFound).toHaveBeenCalledOnce()
    expect(next).not.toHaveBeenCalled()
  })
})
