import { expect, test } from 'bun:test'
import {
  getDueUpdatePhases,
  loadDatasetFixtures,
  lookupDatasetUpdates,
} from './sourceUpdates'
import { lookupOverture } from './sourceUpdatesOverture'
import { targetVersionsFromReport } from '../commands/updateTargets'

const reviewedCodes = ['ds-hk-protomaps-island', 'ds-hk-hkgov-rvd-division']

test('discovers only reviewed editions and retries unpublished cohorts despite saved check state', async () => {
  const datasets = await loadDatasetFixtures(new Set(reviewedCodes))
  expect(datasets).toHaveLength(2)
  for (const dataset of datasets) {
    const updates = await lookupDatasetUpdates(
      dataset,
      { versionKey: '2099-01-01.0' },
      new Map([[dataset.code, null]]),
      true,
    )
    expect(updates.map(update => update.version)).toEqual(
      dataset.releases!.map(release => release.sourceVersion),
    )
    expect(
      updates.every(
        update =>
          update.status === 'new' && update.ingest && update.deferStateUntilProcessed,
      ),
    ).toBe(true)
    const published = await lookupDatasetUpdates(
      dataset,
      undefined,
      new Map(updates.map(update => [update.version!, update.version!])),
      true,
    )
    expect(published.every(update => update.status === 'current')).toBe(true)
  }
})

test('a partial curated pair remains missing until both outputs are published', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-saanseoi-division']))
  const version = '2026-10-01.1'
  const inventory = {
    sourceVersion: version,
    resourceType: 'division',
    status: 'current',
  }
  const partial = targetVersionsFromReport(dataset!, [inventory])
  expect(partial.get(dataset!.code)).toBeNull()
  expect(partial.get(`${version}:division`)).toBe(version)
  expect(
    targetVersionsFromReport(dataset!, [
      inventory,
      { ...inventory, resourceType: 'divisionArea' },
    ]).get(version),
  ).toBe(version)
})

test('Overture retries missing outputs independently of a saved dataset baseline', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = Object.assign(
    async () => Response.json({ latest: '2026-09-23.0' }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  try {
    const [fixture] = await loadDatasetFixtures(new Set(['ds-hk-overture-division']))
    const dataset = { ...fixture!, releasePolicy: undefined }
    const version = '2026-09-23.0'
    const targetVersions = targetVersionsFromReport(dataset, [
      { sourceVersion: version, resourceType: 'division', status: 'current' },
    ])
    const result = await lookupOverture({
      dataset,
      targetVersions,
      previous: { versionKey: version },
    })
    const updates = Array.isArray(result) ? result : [result]
    expect(updates.map(update => [update.targetSourceKey, update.status])).toEqual([
      [`${version}:division`, 'current'],
      [`${version}:divisionArea`, 'new'],
      [`${version}:divisionBoundary`, 'new'],
    ])
    expect(updates[1]!.upload!.options['dataset-code']).toBe(dataset.code)
    expect(updates[1]!.upload!.options['cohort-key']).toBe(version)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('does not replay absent older reviewed editions into a target with a newer edition', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-protomaps-island']))
  const latest = dataset!.releases!.at(-1)!.sourceVersion!
  const updates = await lookupDatasetUpdates(
    dataset!,
    undefined,
    new Map([[latest, latest]]),
    true,
  )
  expect(updates.at(-1)?.status).toBe('current')
  expect(updates.slice(0, -1).every(update => update.status === 'skipped')).toBe(true)
})

test('Overture Places requires the supplementary Address output before reporting completion', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = Object.assign(
    async () => Response.json({ latest: '2026-09-23.0' }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
  try {
    const [fixture] = await loadDatasetFixtures(new Set(['ds-hk-overture-place']))
    const dataset = { ...fixture!, releasePolicy: undefined }
    const version = '2026-09-23.0'
    const targetVersions = targetVersionsFromReport(dataset, [
      { sourceVersion: version, resourceType: 'place', status: 'current' },
    ])
    const result = await lookupOverture({
      dataset,
      targetVersions,
      previous: { versionKey: version },
    })
    const [update] = Array.isArray(result) ? result : [result]
    expect(update!.status).toBe('new')
    expect(update!.targetSourceKey).toBe(version)
    expect(targetVersions.get(dataset.code)).toBeNull()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('SaanSeoi production is not scheduled as an upstream source check, even with --check-now', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-saanseoi-division']))
  expect(
    getDueUpdatePhases(dataset!, undefined, { force: true, hasTargetRelease: false }),
  ).toEqual([])
})
