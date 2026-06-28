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
})
