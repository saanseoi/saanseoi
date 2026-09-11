import { isReleaseId } from '@repo/core'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  dispatchUpload,
  resumePendingSqlDeliveryForUpload,
  scheduleSnapshotCleanup,
} from './upload.ts'
import type { UploadTarget } from '../cli/options.ts'

const target: UploadTarget = {
  environment: 'production',
  remote: true,
}

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalApiKey
})

describe('upload helpers', () => {
  test('automatically resumes every retained SQL plan before upload planning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-'))
    const calls: string[] = []
    try {
      await writeFile(
        join(root, 'pending-sql-delivery.json'),
        JSON.stringify({
          releaseId: 'retained-release',
          directories: [join(root, 'first'), join(root, 'second')],
        }),
      )

      await expect(
        resumePendingSqlDeliveryForUpload(
          { remote: true, environment: 'preview' },
          root,
          {
            resolveCacheDir: async () => root,
            runSqlDeliveryCommand: async (args, target, invocationCwd) => {
              calls.push(`${args.options.plan}:${target.environment}:${invocationCwd}`)
            },
          },
        ),
      ).resolves.toBe(true)

      expect(calls).toEqual([
        `${join(root, 'first')}:preview:${root}`,
        `${join(root, 'second')}:preview:${root}`,
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('returns without recovery when the cache has no pending delivery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-empty-'))
    try {
      await expect(
        resumePendingSqlDeliveryForUpload(
          { remote: true, environment: 'preview' },
          root,
          { resolveCacheDir: async () => root },
        ),
      ).resolves.toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('detects UUID release identifiers', () => {
    expect(isReleaseId('1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70')).toBe(true)
    expect(isReleaseId('dr-hk-overture-division-2025-09-24.0')).toBe(false)
  })

  test('registers a remote release without uploading Parquet to R2', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    const calls: string[] = []
    globalThis.fetch = (async (input, init) => {
      calls.push(String(input))
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({
        'content-type': 'application/json',
        'x-api-key': 'test-api-key',
      })
      expect(JSON.parse(String(init?.body))).toMatchObject({
        fileName: 'division.parquet',
        force: true,
        allowHistoricalCohort: true,
        plan: {
          cohortKey: '2025-09',
          source: 'overture',
          sourceVersion: '2025-09-24.0',
        },
      })
      return Response.json({
        datasetCode: 'ds-hk-overture-division',
        datasetId: '960b3f6f-437f-49e3-bd72-44e87d1cd5b9',
        rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
        releaseCode: 'dr-hk-overture-division-2025-09-24.0',
        releaseId: '1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70',
        rowCount: 1810,
        source: 'overture',
        sourceVersion: '2025-09-24.0',
        status: 'staged',
        type: 'division',
      })
    }) as typeof fetch

    const result = await dispatchUpload(
      target,
      { filePath: 'division.parquet' } as never,
      previewResult(),
      'schema-version-1',
      { force: true, allowHistoricalCohort: true },
    )

    expect(calls).toEqual(['https://harbour.saanseoi.hk/v1/registerUpload'])
    expect(result.rawObjectKey).toBe('hk/overture/2025-09-24.0/division.parquet')
  })

  test('requests a staged-only remote retry without forcing a published repair', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        force: false,
        resumeStagedRelease: true,
      })
      return Response.json({
        datasetCode: 'ds-hk-overture-division',
        datasetId: '960b3f6f-437f-49e3-bd72-44e87d1cd5b9',
        rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
        releaseCode: 'dr-hk-overture-division-2025-09-24.0',
        releaseId: '1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70',
        rowCount: 1810,
        source: 'overture',
        sourceVersion: '2025-09-24.0',
        status: 'staged',
        type: 'division',
      })
    }) as typeof fetch

    await dispatchUpload(
      target,
      { filePath: 'division.parquet' } as never,
      previewResult(),
      'schema-version-1',
      { resumeStagedRelease: true },
    )
  })

  test('surfaces remote registration failures', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () =>
      Response.json(
        { message: 'Schema drift detected.' },
        { status: 400 },
      )) as unknown as typeof fetch

    await expect(
      dispatchUpload(
        target,
        { filePath: 'division.parquet' } as never,
        previewResult(),
        'schema-version-1',
      ),
    ).rejects.toThrow('Schema drift detected.')
  })

  test('re-registers an exact retained owner with staged/processing-only reuse', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    let requested = false
    globalThis.fetch = (async (_input, init) => {
      requested = true
      expect(JSON.parse(String(init?.body))).toMatchObject({
        force: true,
        reuseExistingRelease: true,
        resumeStagedRelease: true,
      })
      return Response.json({ status: 'staged' })
    }) as typeof fetch
    await dispatchUpload(
      target,
      { filePath: 'division.parquet' } as never,
      previewResult(),
      'schema-version-1',
      {
        resolvePendingReleaseId: async (_cacheDir, releaseCode) => {
          expect(releaseCode).toBe('dr-hk-overture-division-2025-09-24.0')
          return 'retained-owner'
        },
        resumeStagedRelease: true,
      },
    )
    expect(requested).toBe(true)
  })

  test('schedules post-publication snapshot cleanup separately', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe(
        'https://harbour.saanseoi.hk/v1/control/cleanupSnapshots',
      )
      expect(JSON.parse(String(init?.body))).toEqual({ delaySeconds: 30 })
      return Response.json({
        candidateCount: 0,
        delaySeconds: 30,
        dryRun: false,
        snapshotIds: [],
        status: 'skipped',
      })
    }) as typeof fetch

    await expect(
      scheduleSnapshotCleanup(target, { delaySeconds: 30 }),
    ).resolves.toMatchObject({
      status: 'skipped',
    })
  })
})

function previewResult() {
  return {
    inspection: {
      distinctCountryValues: ['hk'],
      distinctRegionValues: ['hk'],
      distinctThemeValues: ['divisions'],
      distinctTypeValues: ['division'],
      rowCount: 1810,
      schema: [],
    },
    plan: {
      cohortKey: '2025-09',
      datasetCode: 'ds-hk-overture-division',
      fileName: 'division.parquet',
      regionCode: 'hk',
      releaseCode: 'dr-hk-overture-division-2025-09-24.0',
      source: 'overture',
      sourceVersion: '2025-09-24.0',
      theme: 'divisions',
      type: 'division',
    },
  } as never
}
