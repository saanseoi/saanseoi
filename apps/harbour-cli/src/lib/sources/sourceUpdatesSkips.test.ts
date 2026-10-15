import { expect, spyOn, test } from 'bun:test'
import { loadDatasetFixtures, lookupDatasetUpdates } from './sourceUpdates.ts'
import { applySkippedRelease, assertSkippedReleases } from './sourceUpdatesSkips.ts'
import { processUpdate, shouldDownloadUpdate } from '../commands/updateProcessing.ts'
import { recordUpdateState } from './sourceUpdatesState.ts'
import type { DatasetUpdate, UpdateState } from './sourceUpdatesTypes.ts'
import { UpdateRow } from '../commands/updateDisplay.ts'

const patch = '2026-09-23.1'
const baseline = '2026-09-23.0'
const reason = 'This patch does not affect the data ingested by SaanSeoi.'

test('rejects empty reasons, empty versions and duplicate skip decisions', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-overture-place']))
  for (const skippedReleases of [
    [{ sourceVersion: patch, reason: ' ' }],
    [{ sourceVersion: '', reason }],
    [
      { sourceVersion: patch, reason },
      { sourceVersion: patch, reason },
    ],
  ]) {
    expect(() => assertSkippedReleases({ ...dataset!, skippedReleases })).toThrow()
  }
})

test('skips exact Overture versions while retaining an ingestible baseline and older archives', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = Object.assign(async () => Response.json({ latest: patch }), {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch
  const originalSpawn = Bun.spawn
  const spawn = spyOn(Bun, 'spawn').mockImplementation((() =>
    originalSpawn(
      [
        process.execPath,
        '-e',
        `process.stdout.write(JSON.stringify({versions: ['${patch}', '${baseline}', '2026-08-19.0']}))`,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )) as typeof Bun.spawn)
  try {
    const datasets = await loadDatasetFixtures(
      new Set(['ds-hk-overture-place', 'ds-hk-overture-division']),
    )
    for (const dataset of datasets) {
      for (const published of [false, true]) {
        const targetVersions = new Map<string, string | null>([
          [dataset.code, published ? baseline : null],
        ])
        if (published) {
          targetVersions.set(baseline, baseline)
          for (const type of dataset.resourceTypes!)
            targetVersions.set(`${baseline}:${type}`, baseline)
        }
        const updates = await lookupDatasetUpdates(
          dataset,
          undefined,
          targetVersions,
          true,
        )
        const skipped = updates.filter(update => update.version === patch)
        expect(skipped.length).toBeGreaterThan(0)
        for (const update of skipped) {
          expect(update.status).toBe('skipped')
          expect(update.message).toBe(reason)
          expect(update.phase).toBeUndefined()
          expect(update.download).toBeUndefined()
          expect(update.upload).toBeUndefined()
          expect(shouldDownloadUpdate(update, true)).toBe(false)
        }
        const eligible = updates.filter(update => update.version === baseline)
        expect(eligible.length).toBeGreaterThan(0)
        expect(
          eligible.every(
            update =>
              update.phase === undefined &&
              update.upload &&
              update.status === (published ? 'current' : 'new'),
          ),
        ).toBe(true)
        expect(
          updates
            .filter(update => update.version === '2026-08-19.0')
            .every(update => update.phase === 'archives'),
        ).toBe(true)
      }
    }
  } finally {
    spawn.mockRestore()
    globalThis.fetch = originalFetch
  }
})

test('forced processing cannot invoke skipped actions or advance source state', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-overture-place']))
  let called = false
  const candidate: DatasetUpdate = {
    dataset: dataset!,
    version: patch,
    versionKey: patch,
    status: 'new',
    checkedAt: new Date().toISOString(),
    download: async () => {
      called = true
      throw new Error('must not download')
    },
    ingest: async () => {
      called = true
      throw new Error('must not ingest')
    },
  }
  const update = applySkippedRelease(candidate)
  expect(update.ingest).toBeUndefined()
  // Keep callbacks attached to prove the processing guard also protects callers.
  const guarded = { ...candidate, status: 'skipped' as const }
  expect(shouldDownloadUpdate(guarded, true)).toBe(false)
  expect(
    await processUpdate(guarded, {
      row: new UpdateRow(dataset!),
      target: { environment: 'dev', remote: false },
      forceDownload: true,
      forceUpload: true,
      shouldDownload: true,
      continueUpload: true,
      deferStatsReleaseSet: false,
      includeGeography: false,
      skipPrompts: true,
      skipUpload: false,
      printUsage: () => {},
      targetVersion: baseline,
      updateIndex: 0,
      updateTotal: 1,
    }),
  ).toBe('skipped')
  expect(called).toBe(false)
  const state: UpdateState = {
    [dataset!.code]: { version: baseline, versionKey: baseline },
  }
  recordUpdateState(state, dataset!.code, update)
  expect(state[dataset!.code]).toEqual({ version: baseline, versionKey: baseline })
  expect(applySkippedRelease({ ...candidate, version: '2026-09-23.2' }).status).toBe(
    'new',
  )
})
