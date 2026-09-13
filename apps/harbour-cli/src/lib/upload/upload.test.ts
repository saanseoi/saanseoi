import { isReleaseId } from '@repo/core'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  dispatchUpload as dispatchUploadActual,
  reconcileDraftReleaseSets,
  resumePendingSqlDeliveryForUpload,
  scheduleSnapshotCleanup,
} from './upload.ts'
import type { UploadTarget } from '../cli/options.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { prepareSqlDelivery } from '../pipeline/local/sqlDeliveryFiles.ts'
import { readPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'

const dispatchUpload: typeof dispatchUploadActual = (
  target,
  registration,
  preview,
  schema,
  options = {},
) =>
  dispatchUploadActual(target, registration, preview, schema, {
    resolveWriteContext: async () =>
      ({ cleanup() {} }) as Awaited<
        ReturnType<NonNullable<typeof options.resolveWriteContext>>
      >,
    ...options,
  })

const target: UploadTarget = {
  environment: 'production',
  remote: true,
}

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

test.each([
  'address',
  'division',
  'divisionArea',
  'divisionBoundary',
  'place',
  'divisionStatistic',
  'street',
] as const)(
  '%s remote registration rejects an unusable mirror before any HTTP mutation',
  async resourceType => {
    let requests = 0
    globalThis.fetch = (async () => {
      requests++
      throw new Error('Unexpected HTTP request')
    }) as unknown as typeof fetch
    const preview = previewResult() as Parameters<typeof dispatchUpload>[2]
    preview.plan.resourceType = resourceType
    await expect(
      dispatchUploadActual(
        target,
        { filePath: 'fixture.parquet' } as never,
        preview,
        'schema',
        {
          resolvePendingReleaseId: async () => 'owner',
          resolveWriteContext: async (destination, region, year, options) => {
            expect(destination).toEqual(target)
            expect(region).toBe('hk')
            expect(year).toBe('2025')
            expect(options).toEqual({ resumeSqlDeliveryReleaseId: 'owner' })
            throw new Error('complete shared mirror required')
          },
        },
      ),
    ).rejects.toThrow('complete shared mirror required')
    expect(requests).toBe(0)
  },
)

test('remote registration releases a validated mirror before sending the request', async () => {
  process.env.HARBOUR_API_KEY = 'test-api-key'
  const events: string[] = []
  globalThis.fetch = (async () => {
    events.push('register')
    return Response.json({ status: 'staged' })
  }) as unknown as typeof fetch
  await dispatchUpload(
    target,
    { filePath: 'fixture.parquet' } as never,
    previewResult(),
    'schema',
    {
      resolvePendingReleaseId: async () => undefined,
      resolveWriteContext: async () => {
        events.push('validate')
        return {
          cleanup() {
            events.push('close')
          },
        } as LocalAddressDbContext
      },
    },
  )
  expect(events).toEqual(['validate', 'close', 'register'])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.HARBOUR_API_KEY
  else process.env.HARBOUR_API_KEY = originalApiKey
})

describe('upload helpers', () => {
  test.each([
    ['an empty body', ''],
    ['a non-JSON body', 'Proxy connection failed'],
    [
      'a lost-connection response',
      JSON.stringify({ error: 'Network connection lost.' }),
    ],
  ])('retries local release-set reconciliation after %s', async (_label, body) => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    const delays: number[] = []
    let calls = 0

    const result = await reconcileDraftReleaseSets(
      { environment: 'dev', remote: false },
      { apiFamily: 'stats', regionCode: 'hk' },
      {
        fetchImpl: async (_input, init) => {
          calls += 1
          expect(JSON.parse(String(init?.body))).toEqual({
            apiFamily: 'stats',
            regionCode: 'hk',
          })
          return calls === 1
            ? new Response(body, { status: 500 })
            : Response.json({
                inspected: 1,
                pendingReleaseSetCodes: [],
                publishedReleaseSetCodes: [],
                publishedReleaseSetStatsTargets: [],
              })
        },
        sleep: async delayMs => {
          delays.push(delayMs)
        },
      },
    )

    expect(result.inspected).toBe(1)
    expect(calls).toBe(2)
    expect(delays).toEqual([250])
  })

  test.each([
    ['a structured local failure', { environment: 'dev', remote: false } as const],
    [
      'a remote proxy-shaped failure',
      { environment: 'preview', remote: true } as const,
    ],
  ])('does not retry %s', async (_label, reconciliationTarget) => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    let calls = 0
    const body = reconciliationTarget.remote
      ? { error: 'Network connection lost.' }
      : { message: 'Validation failed.' }

    await expect(
      reconcileDraftReleaseSets(
        reconciliationTarget,
        {},
        {
          fetchImpl: async () => {
            calls += 1
            return Response.json(body, { status: 500 })
          },
          sleep: async () => {},
        },
      ),
    ).rejects.toThrow(
      reconciliationTarget.remote
        ? 'Harbour reconcileDraftReleaseSets failed with status 500.'
        : 'Validation failed.',
    )
    expect(calls).toBe(1)
  })

  test('caps local release-set reconciliation retries', async () => {
    process.env.HARBOUR_API_KEY = 'test-api-key'
    const delays: number[] = []
    let calls = 0

    await expect(
      reconcileDraftReleaseSets(
        { environment: 'dev', remote: false },
        {},
        {
          fetchImpl: async () => {
            calls += 1
            return Response.json({ error: 'Network connection lost.' }, { status: 500 })
          },
          sleep: async delayMs => {
            delays.push(delayMs)
          },
        },
      ),
    ).rejects.toThrow('Harbour reconcileDraftReleaseSets failed with status 500.')
    expect(calls).toBe(4)
    expect(delays).toEqual([250, 1_000, 3_000])
  })

  test('automatically resumes every retained SQL plan before upload planning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-'))
    const calls: string[] = []
    try {
      for (const phase of ['first', 'second']) {
        await prepareSqlDelivery(
          join(root, phase),
          recoveryContext(root, phase),
          async () => {},
        )
      }
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

  for (const missingPhase of ['first', 'second']) {
    test(`missing ${missingPhase} SQL plan blocks every replay and retains ownership`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-missing-'))
      const calls: string[] = []
      try {
        const pending = {
          releaseId: 'retained-release',
          directories: [join(root, 'first'), join(root, 'second')],
        }
        for (const phase of ['first', 'second']) {
          if (phase === missingPhase) continue
          await prepareSqlDelivery(
            join(root, phase),
            recoveryContext(root, phase),
            async () => {},
          )
        }
        await writeFile(
          join(root, 'pending-sql-delivery.json'),
          JSON.stringify(pending),
        )

        await expect(
          resumePendingSqlDeliveryForUpload(
            { remote: true, environment: 'preview' },
            root,
            {
              resolveCacheDir: async () => root,
              runSqlDeliveryCommand: async args => {
                calls.push(String(args.options.plan))
              },
            },
          ),
        ).rejects.toThrow(join(root, missingPhase))
        expect(calls).toEqual([])
        expect(await readPendingSqlDelivery(root)).toEqual(pending)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }

  test('corrupt SQL in a later plan blocks every replay and retains ownership', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-corrupt-'))
    const calls: string[] = []
    try {
      const pending = {
        releaseId: 'retained-release',
        directories: [join(root, 'first'), join(root, 'second')],
      }
      for (const phase of ['first', 'second']) {
        await prepareSqlDelivery(
          join(root, phase),
          recoveryContext(root, phase),
          async append => {
            await append(
              { bindingName: 'DB_META', databaseId: 'meta' },
              Buffer.from('SELECT 1;'),
            )
          },
        )
      }
      await writeFile(join(root, 'second', '0.sql'), 'SELECT 2;')
      await writeFile(join(root, 'pending-sql-delivery.json'), JSON.stringify(pending))

      await expect(
        resumePendingSqlDeliveryForUpload(
          { remote: true, environment: 'preview' },
          root,
          {
            resolveCacheDir: async () => root,
            runSqlDeliveryCommand: async args => {
              calls.push(String(args.options.plan))
            },
          },
        ),
      ).rejects.toThrow('has changed')
      expect(calls).toEqual([])
      expect(await readPendingSqlDelivery(root)).toEqual(pending)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  for (const mismatch of ['owner', 'cache', 'environment']) {
    test(`a later SQL plan with the wrong ${mismatch} blocks every replay`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'upload-sql-recovery-mismatch-'))
      const calls: string[] = []
      try {
        const pending = {
          releaseId: 'retained-release',
          directories: [join(root, 'first'), join(root, 'second')],
        }
        for (const phase of ['first', 'second']) {
          const context = recoveryContext(root, phase)
          if (phase === 'second') {
            if (mismatch === 'owner') context.releaseId = 'another-release'
            if (mismatch === 'cache') context.cacheDir = join(root, 'another-cache')
            if (mismatch === 'environment') context.environment = 'production'
          }
          await prepareSqlDelivery(join(root, phase), context, async () => {})
        }
        await writeFile(
          join(root, 'pending-sql-delivery.json'),
          JSON.stringify(pending),
        )

        await expect(
          resumePendingSqlDeliveryForUpload(
            { remote: true, environment: 'preview' },
            root,
            {
              resolveCacheDir: async () => root,
              runSqlDeliveryCommand: async args => {
                calls.push(String(args.options.plan))
              },
            },
          ),
        ).rejects.toThrow()
        expect(calls).toEqual([])
        expect(await readPendingSqlDelivery(root)).toEqual(pending)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }

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

function recoveryContext(
  root: string,
  phase: string,
): Parameters<typeof prepareSqlDelivery>[1] {
  return {
    cacheDir: root,
    cachePreparedAt: 'fixed',
    environment: 'preview',
    inputs: {},
    phase,
    releaseId: 'retained-release',
  }
}

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
