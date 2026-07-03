import { isReleaseId } from '@repo/core'

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { dispatchUpload, scheduleSnapshotCleanup } from './upload.ts'

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
  cohortKey: '2025-09',
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

describe('upload helpers', () => {
  test('detects UUID release identifiers', () => {
    expect(isReleaseId('1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70')).toBe(true)
    expect(isReleaseId('overture-hk-2025-09-24.0-division')).toBe(false)
  })

  test('passes force through remote signed uploads', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url === 'https://harbour.saanseoi.hk/v1/signUpload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            expiresAt: '2026-06-27T00:15:00.000Z',
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'uploading',
            uploadHeaders: {
              'content-type': 'application/octet-stream',
              'x-amz-meta-releaseCode': releaseRow.releaseCode,
            },
            uploadMethod: 'PUT',
            uploadUrl:
              'https://r2.example/upload?X-Amz-SignedHeaders=content-type%3Bhost',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://r2.example/upload?X-Amz-SignedHeaders=content-type%3Bhost') {
        return new Response(null, { status: 200 })
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

    await dispatchUpload(
      target,
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
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
      {
        force: true,
      },
    )

    const signBody = JSON.parse(String(calls[0]?.init?.body)) as { force?: boolean }
    const finalizeBody = JSON.parse(String(calls[2]?.init?.body)) as {
      releaseId?: string
    }

    expect(calls.map(call => call.url)).toEqual([
      'https://harbour.saanseoi.hk/v1/signUpload',
      'https://r2.example/upload?X-Amz-SignedHeaders=content-type%3Bhost',
      'https://harbour.saanseoi.hk/v1/finalizeUpload',
    ])
    expect(calls[1]?.init?.headers).toEqual({
      'content-type': 'application/octet-stream',
    })
    expect(signBody.force).toBe(true)
    expect(finalizeBody).toEqual({
      releaseId: releaseRow.releaseId,
    })
  })

  test('passes skip cleanup through remote signed uploads', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url === 'https://harbour.saanseoi.hk/v1/signUpload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            expiresAt: '2026-06-27T00:15:00.000Z',
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'uploading',
            uploadHeaders: {
              'content-type': 'application/octet-stream',
            },
            uploadMethod: 'PUT',
            uploadUrl: 'https://r2.example/upload',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://r2.example/upload') {
        return new Response(null, { status: 200 })
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

    await dispatchUpload(
      target,
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
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
      {
        skipSnapshotCleanup: true,
      },
    )

    const signBody = JSON.parse(String(calls[0]?.init?.body)) as {
      skipSnapshotCleanup?: boolean
    }
    const finalizeBody = JSON.parse(String(calls[2]?.init?.body)) as {
      skipSnapshotCleanup?: boolean
    }

    expect(signBody.skipSnapshotCleanup).toBe(true)
    expect(finalizeBody.skipSnapshotCleanup).toBe(true)
  })

  test('includes R2 response details when signed upload fails', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)

      if (url === 'https://harbour.saanseoi.hk/v1/signUpload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            expiresAt: '2026-06-27T00:15:00.000Z',
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'uploading',
            uploadHeaders: {
              'content-type': 'application/octet-stream',
            },
            uploadMethod: 'PUT',
            uploadUrl: 'https://r2.example/upload',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://r2.example/upload') {
        return new Response('<Code>SignatureDoesNotMatch</Code>', { status: 403 })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    await expect(
      dispatchUpload(
        target,
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
            cohortKey: '2025-09',
            source: 'overture',
            sourceVersion: '2025-09-24.0',
            theme: 'divisions',
            type: 'division',
          },
        } as never,
        'schema-version-1',
      ),
    ).rejects.toThrow(
      'R2 upload failed with status 403: <Code>SignatureDoesNotMatch</Code>',
    )
  })

  test('does not send processingMode through remote signed uploads', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url === 'https://harbour.saanseoi.hk/v1/signUpload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            expiresAt: '2026-06-27T00:15:00.000Z',
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'uploading',
            uploadHeaders: {
              'content-type': 'application/octet-stream',
            },
            uploadMethod: 'PUT',
            uploadUrl: 'https://r2.example/upload',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://r2.example/upload') {
        return new Response(null, { status: 200 })
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

    await dispatchUpload(
      target,
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
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
      {},
    )

    const signBody = JSON.parse(String(calls[0]?.init?.body)) as {
      processingMode?: string
    }
    const finalizeBody = JSON.parse(String(calls[2]?.init?.body)) as {
      processingMode?: string
      releaseId?: string
    }

    expect(signBody.processingMode).toBeUndefined()
    expect(finalizeBody).toEqual({
      releaseId: releaseRow.releaseId,
    })
  })

  test('schedules snapshot cleanup through Harbour control API', async () => {
    const calls: Array<{ init?: RequestInit; url: string }> = []

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ init, url })

      if (url === 'https://harbour.saanseoi.hk/v1/control/cleanupSnapshots') {
        return new Response(
          JSON.stringify({
            candidateCount: 1,
            delaySeconds: 30,
            dryRun: false,
            snapshotIds: ['1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70'],
            status: 'queued',
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

    const result = await scheduleSnapshotCleanup(target, {
      delaySeconds: 30,
      resourceType: 'division',
      snapshotIds: ['1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70'],
    })

    expect(result.status).toBe('queued')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({
        delaySeconds: 30,
        resourceType: 'division',
        snapshotIds: ['1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70'],
      }),
    )
  })

  test('explains when a forced remote upload is rejected by an old API deployment', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async input => {
      const url = String(input)

      if (url === 'https://harbour.saanseoi.hk/v1/signUpload') {
        return new Response(
          JSON.stringify({
            message:
              'Dataset already exists with status uploading: overture-hk-division',
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 400,
          },
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    }) as typeof fetch

    await expect(
      dispatchUpload(
        target,
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
            cohortKey: '2025-09',
            source: 'overture',
            sourceVersion: '2025-09-24.0',
            theme: 'divisions',
            type: 'division',
          },
        } as never,
        'schema-version-1',
        {
          force: true,
        },
      ),
    ).rejects.toThrow('/v1/signUpload supports forced upload-session replacement')
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
            cohortKey: '2025-09',
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

  test('allows a local direct upload over an uploading release when forced', async () => {
    const calls: Array<{ body?: RequestInit['body']; url: string }> = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ body: init?.body, url })

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(
          JSON.stringify({
            rows: [releaseRow],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://preview.harbour.saanseoi.hk/v1/upload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'staged',
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

    await dispatchUpload(
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
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
      {
        force: true,
      },
    )

    const uploadBody = calls[1]?.body

    expect(uploadBody).toBeInstanceOf(FormData)
    expect((uploadBody as FormData).get('force')).toBe('true')
    expect(calls.map(call => call.url)).toEqual([
      'https://preview.harbour.saanseoi.hk/v1/reports/releases?limit=1&releaseCode=overture-hk-2025-09-24.0-division',
      'https://preview.harbour.saanseoi.hk/v1/upload',
    ])
  })

  test('does not send processingMode through local direct uploads', async () => {
    const calls: Array<{ body?: RequestInit['body']; url: string }> = []
    const tempDir = mkdtempSync(join(tmpdir(), 'harbour-cli-upload-test-'))
    const filePath = join(tempDir, 'division.parquet')
    tempDirs.push(tempDir)
    writeFileSync(filePath, new Uint8Array([0x50, 0x41, 0x52, 0x31]))

    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ body: init?.body, url })

      if (url.startsWith('https://preview.harbour.saanseoi.hk/v1/reports/releases')) {
        return new Response(
          JSON.stringify({
            rows: [],
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 200,
          },
        )
      }

      if (url === 'https://preview.harbour.saanseoi.hk/v1/upload') {
        return new Response(
          JSON.stringify({
            datasetCode: releaseRow.datasetCode,
            datasetId: releaseRow.datasetId,
            rawObjectKey: releaseRow.rawObjectKey,
            releaseCode: releaseRow.releaseCode,
            releaseId: releaseRow.releaseId,
            status: 'staged',
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

    await dispatchUpload(
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
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
          theme: 'divisions',
          type: 'division',
        },
      } as never,
      'schema-version-1',
      {},
    )

    const uploadBody = calls[1]?.body

    expect(uploadBody).toBeInstanceOf(FormData)
    expect((uploadBody as FormData).get('processingMode')).toBeNull()
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
            cohortKey: '2025-09',
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
