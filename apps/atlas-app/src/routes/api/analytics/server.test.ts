import { beforeEach, describe, expect, mock, test } from 'bun:test'

const events: unknown[] = []
mock.module('cloudflare:workers', () => ({
  waitUntil: () => {},
  env: {
    PRODUCT_USAGE: {
      writeDataPoint: (event: unknown) => events.push(event),
    },
  },
}))
const { POST } = await import('./+server')
beforeEach(() => {
  events.length = 0
})

describe('product usage fallback endpoint', () => {
  test('rejects events outside the client allowlist', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/analytics', {
        method: 'POST',
        body: JSON.stringify({
          event: 'api.request',
          surface: 'api',
        }),
      }),
    } as never)

    expect(response.status).toBe(400)
  })

  test('sanitises identifiers and never records copied text', async () => {
    const response = await POST({
      request: new Request('http://localhost/api/analytics', {
        method: 'POST',
        body: JSON.stringify({
          event: 'client.copy_request',
          surface: 'api_release',
          route: '/apis/places/1.0.0?token=secret',
          entityType: 'action',
          entityId: 'api-key-secret',
          entityId2: 'copied text should never be sent',
        }),
      }),
    } as never)

    expect(response.status).toBe(204)
    expect(JSON.stringify(events[0])).not.toContain('secret')
    expect(JSON.stringify(events[0])).not.toContain('copied text')
    expect(events[0]).toMatchObject({
      blobs: [
        'v1',
        'client.copy_request',
        'atlas-client',
        'api_release',
        '/apis/places/1.0.0',
        'action',
        '',
        '',
        'success',
        '',
      ],
    })
  })
})
