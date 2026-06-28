import { isReleaseId } from '@repo/core'

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  dispatchUpload,
  finalizeExistingUpload,
  requeueExistingUpload,
  resolveRelease,
} from './upload.ts'

import type { UploadTarget } from './options.ts'

const target: UploadTarget = {
  environment: 'production',
  remote: true,
}

const localTarget: UploadTarget = {
  environment: 'preview',
  remote: false,
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
const tempDirs: string[] = []

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalApiKey == null) {
    delete process.env.HARBOUR_API_KEY
  } else {
    process.env.HARBOUR_API_KEY = originalApiKey
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
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

  test('recovers a local direct upload from a transient 503 when the release was already staged', async () => {
    const calls: string[] = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    let reportAttempt = 0
    globalThis.fetch = (async input => {
      const url = String(input)
      calls.push(url)

      if (url === 'https://preview.harbour.saanseoi.hk/v1/upload') {
        return new Response('busy', { status: 503 })
      }

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        reportAttempt += 1

        return new Response(
          JSON.stringify({
            rows: reportAttempt === 1 ? [] : [{ ...releaseRow, status: 'processing' }],
          }),
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

    const result = await dispatchUpload(
      localTarget,
      {
        filePath,
      } as never,
      {
        inspection: {
          rowCount: 1810,
          schema: [],
        },
        plan: {
          datasetCode: 'hk-division',
          fileName: 'division.parquet',
          regionCode: 'hk',
          releaseCode: releaseRow.releaseCode,
          snapshotMonth: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
    )

    expect(result).toMatchObject({
      datasetCode: releaseRow.datasetCode,
      datasetId: releaseRow.datasetId,
      releaseCode: releaseRow.releaseCode,
      releaseId: releaseRow.releaseId,
      status: 'processing',
    })
    expect(calls[0]).toContain(
      '/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
    )
    expect(calls[1]).toBe('https://preview.harbour.saanseoi.hk/v1/upload')
    expect(calls[2]).toContain(
      '/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
    )
  })

  test('polls the release report before retrying a local transient 503', async () => {
    const calls: string[] = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    let reportAttempt = 0

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)
      calls.push(url)

      if (url === 'https://preview.harbour.saanseoi.hk/v1/upload') {
        return new Response('busy', { status: 503 })
      }

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        reportAttempt += 1

        return new Response(
          JSON.stringify({
            rows:
              reportAttempt === 1
                ? []
                : [
                    {
                      ...releaseRow,
                      status: reportAttempt >= 4 ? 'processing' : 'uploading',
                    },
                  ],
          }),
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

    const result = await dispatchUpload(
      localTarget,
      {
        filePath,
      } as never,
      {
        inspection: {
          rowCount: 1810,
          schema: [],
        },
        plan: {
          datasetCode: 'hk-division',
          fileName: 'division.parquet',
          regionCode: 'hk',
          releaseCode: releaseRow.releaseCode,
          snapshotMonth: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
    )

    expect(result).toMatchObject({
      releaseId: releaseRow.releaseId,
      status: 'processing',
    })
    expect(
      calls.filter(url => url === 'https://preview.harbour.saanseoi.hk/v1/upload'),
    ).toHaveLength(1)
    expect(
      calls.filter(url =>
        url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases'),
      ),
    ).toHaveLength(4)
  })

  test('fails immediately for a local direct upload when the release already exists in processing', async () => {
    const calls: string[] = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)
      calls.push(url)

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(
          JSON.stringify({
            rows: [{ ...releaseRow, status: 'processing' }],
          }),
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

    await expect(
      dispatchUpload(
        localTarget,
        {
          filePath,
        } as never,
        {
          inspection: {
            rowCount: 1810,
            schema: [],
          },
          plan: {
            datasetCode: 'hk-division',
            fileName: 'division.parquet',
            regionCode: 'hk',
            releaseCode: releaseRow.releaseCode,
            snapshotMonth: '2025-09',
            source: 'overture',
            sourceVersion: '2025-09-24.0',
            theme: 'divisions',
            type: 'division',
          },
        } as never,
        'schema-version-1',
      ),
    ).rejects.toThrow(
      'Dataset already exists with status processing: overture-hk-division',
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(
      '/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
    )
  })

  test('fails immediately for a local direct upload when the release preflight probe errors', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(JSON.stringify({ message: 'backend unavailable' }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 503,
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    await expect(
      dispatchUpload(
        localTarget,
        {
          filePath,
        } as never,
        {
          inspection: {
            rowCount: 1810,
            schema: [],
          },
          plan: {
            datasetCode: 'hk-division',
            fileName: 'division.parquet',
            regionCode: 'hk',
            releaseCode: releaseRow.releaseCode,
            snapshotMonth: '2025-09',
            source: 'overture',
            sourceVersion: '2025-09-24.0',
            theme: 'divisions',
            type: 'division',
          },
        } as never,
        'schema-version-1',
      ),
    ).rejects.toThrow('backend unavailable')
  })
})
