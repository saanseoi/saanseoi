import { describe, expect, test } from 'bun:test'
import { trackClientProductUsage } from './clientProductUsage'

describe('client product usage fallback', () => {
  test('uses the same-origin keepalive endpoint without sending copied content', async () => {
    const calls: RequestInit[] = []
    const originalFetch = globalThis.fetch
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      location: { pathname: '/apis/places/1.0.0' },
    }
    globalThis.fetch = (async (_input, init) => {
      calls.push(init ?? {})
      return new Response(null, { status: 204 })
    }) as typeof fetch

    try {
      trackClientProductUsage({
        event: 'client.download_click',
        surface: 'api_release',
        entityType: 'asset',
        entityId: 'asset-1',
      })
      await Promise.resolve()
      expect(calls[0]).toMatchObject({
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
      })
      expect(String(calls[0]?.body)).toContain('asset-1')
      expect(String(calls[0]?.body)).not.toContain('copied')
    } finally {
      globalThis.fetch = originalFetch
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })
})
