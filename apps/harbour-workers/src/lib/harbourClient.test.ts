import { afterEach, describe, expect, mock, test } from 'bun:test'

import { __test__, createHarbourClient } from './harbourClient'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('createHarbourControlApi', () => {
  test('retries transient network failures for control callbacks', async () => {
    let attempts = 0

    globalThis.fetch = mock(async () => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Network connection lost.')
      }

      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as unknown as typeof fetch

    const api = createHarbourClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8788',
    })

    await api.stageCompleted('1', 'extractDivisions', {
      localizedRows: 42,
    })

    expect(attempts).toBe(2)
    expect(
      __test__.isRetryableControlError(new Error('Network connection lost.')),
    ).toBe(true)
  })

  test('does not retry normal control API errors', async () => {
    let attempts = 0

    globalThis.fetch = mock(async () => {
      attempts += 1

      return new Response(
        JSON.stringify({
          message: 'Dataset not found.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        },
      )
    }) as unknown as typeof fetch

    const api = createHarbourClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8788',
    })

    await expect(api.publishDataset('1')).rejects.toThrow('Dataset not found.')
    expect(attempts).toBe(1)
  })

  test('retries transient HTTP failures for control callbacks', async () => {
    let attempts = 0

    globalThis.fetch = mock(async () => {
      attempts += 1

      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            message: 'Service temporarily unavailable.',
          }),
          {
            status: 503,
            headers: {
              'content-type': 'application/json',
            },
          },
        )
      }

      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as unknown as typeof fetch

    const api = createHarbourClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8788',
    })

    await api.stageRunning('1', 'extractDivisions')

    expect(attempts).toBe(2)
  })

  test('sends releaseCode alongside releaseId when provided', async () => {
    let payload: Record<string, unknown> | null = null

    globalThis.fetch = mock(async (_input, init) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>

      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    }) as unknown as typeof fetch

    const api = createHarbourClient({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8788',
    })

    await api.stageFailed(
      '62f558b9-6fad-413f-8283-287a90febcac',
      'processDataset',
      'Release not found.',
      undefined,
      'overture-hk-2025-09-24.0-division',
    )

    expect(payload).not.toBeNull()

    if (!payload) {
      throw new Error('Expected control payload to be captured.')
    }

    const capturedPayload: Record<string, unknown> = payload

    expect(capturedPayload).toEqual({
      error: 'Release not found.',
      phase: 'processDataset',
      releaseCode: 'overture-hk-2025-09-24.0-division',
      releaseId: '62f558b9-6fad-413f-8283-287a90febcac',
    })
  })
})
