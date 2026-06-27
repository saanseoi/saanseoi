import { isReleaseId } from '@repo/core'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  finalizeExistingUpload,
  requeueExistingUpload,
  resolveRelease,
} from './upload.ts'

import type { UploadTarget } from './options.ts'

const target: UploadTarget = {
  environment: 'production',
  remote: true,
}

const releaseRow = {
  createdAt: '2026-06-27T00:00:00.000Z',
  datasetCode: 'hk-division',
  datasetId: '960b3f6f-437f-49e3-bd72-44e87d1cd5b9',
  ingestedAt: '2026-06-27T00:00:00.000Z',
  originalFileName: 'division.parquet',
  publicationDate: null,
  rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
  releaseCode: 'overture-hk-2025-09-24.0-division',
  releaseId: '1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70',
  revocationReason: null,
  revokedAt: null,
  rowCounts: [],
  snapshotMonth: '2025-09',
  source: 'overture',
  sourceVersion: '2025-09-24.0',
  status: 'uploading',
  supersededByReleaseId: null,
  type: 'division',
  updatedAt: '2026-06-27T00:00:00.000Z',
}

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalApiKey == null) {
    delete process.env.HARBOUR_API_KEY
  } else {
    process.env.HARBOUR_API_KEY = originalApiKey
  }
})

describe('upload release action helpers', () => {
  test('detects UUID release identifiers', () => {
    expect(isReleaseId('1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70')).toBe(true)
    expect(isReleaseId('overture-hk-2025-09-24.0-division')).toBe(false)
  })

  test('resolves a releaseCode through the releases report and finalizes that release', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url.startsWith('https://harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(JSON.stringify({ rows: [releaseRow] }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        })
      }

      if (url === 'https://harbour.saanseoi.hk/v1/finalizeUpload') {
        return new Response(
          JSON.stringify({ releaseId: releaseRow.releaseId, status: 'staged' }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    const finalized = await finalizeExistingUpload(
      target,
      'overture-hk-2025-09-24.0-division',
    )

    expect(finalized.release.releaseId).toBe(releaseRow.releaseId)
    expect(finalized.result).toMatchObject({
      releaseId: releaseRow.releaseId,
      status: 'staged',
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toContain(
      '/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
    )
    expect(calls[1]?.url).toBe('https://harbour.saanseoi.hk/v1/finalizeUpload')
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({
        releaseId: releaseRow.releaseId,
      }),
    )
  })

  test('uses releaseId query matching when the release specifier is already a UUID', async () => {
    const calls: string[] = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)
      calls.push(url)

      return new Response(JSON.stringify({ rows: [releaseRow] }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      })
    }) as typeof fetch

    const release = await resolveRelease(target, releaseRow.releaseId)

    expect(release.releaseCode).toBe(releaseRow.releaseCode)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(
      `/v1/reports/releases?limit=1&releaseId=${releaseRow.releaseId}`,
    )
  })

  test('resolves a releaseCode through the releases report and requeues that release', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url.startsWith('https://harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(
          JSON.stringify({
            rows: [{ ...releaseRow, status: 'staged' }],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://harbour.saanseoi.hk/v1/requeueUpload') {
        return new Response(
          JSON.stringify({ releaseId: releaseRow.releaseId, status: 'staged' }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    const requeued = await requeueExistingUpload(
      target,
      'overture-hk-2025-09-24.0-division',
    )

    expect(requeued.release.releaseId).toBe(releaseRow.releaseId)
    expect(requeued.result).toMatchObject({
      releaseId: releaseRow.releaseId,
      status: 'staged',
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toContain(
      '/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
    )
    expect(calls[1]?.url).toBe('https://harbour.saanseoi.hk/v1/requeueUpload')
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({
        releaseId: releaseRow.releaseId,
      }),
    )
  })
})
