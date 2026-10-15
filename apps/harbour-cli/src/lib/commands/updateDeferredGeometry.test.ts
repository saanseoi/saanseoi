import { expect, test } from 'bun:test'
import { verifyDeferredGeometryTarget } from './updateTargets'
import { loadDatasetFixtures } from '../sources/sourceUpdates'
import type { fetchReleaseReport, fetchProcessingRunReport } from '../api/reporting'
const dataset = (
  await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-censtatd-division-statistic-population-households-district']),
  )
)[0]!
const target = { remote: false, environment: 'dev' as const }
const update = { version: '2024.0' }
const rows = [
  {
    sourceVersion: '2024',
    resourceType: 'divisionStatistic',
    status: 'current',
    resourceReleaseId: 'stats',
  },
  {
    sourceVersion: '2024',
    resourceType: 'divisionArea',
    status: 'processing',
    resourceReleaseId: 'area',
    releaseCode: 'area',
  },
]
const reads = (sourceRows = rows, status = 'completed') => ({
  releases: async () =>
    ({ rows: sourceRows }) as Awaited<ReturnType<typeof fetchReleaseReport>>,
  runs: async () =>
    ({
      rows: [{ phase: 'processDataset', status, finishedAt: '2026-10-15T00:00:00Z' }],
    }) as Awaited<ReturnType<typeof fetchProcessingRunReport>>,
})
test('deferred geometry requires a published Statistics child and completed geometry delivery', async () => {
  expect(await verifyDeferredGeometryTarget(target, dataset, update, reads())).toBe(
    true,
  )
  await expect(
    verifyDeferredGeometryTarget(target, dataset, update, reads(rows, 'running')),
  ).rejects.toThrow('no completed delivery evidence')
  await expect(
    verifyDeferredGeometryTarget(target, dataset, update, reads(rows, 'error')),
  ).rejects.toThrow('no completed delivery evidence')
  expect(
    await verifyDeferredGeometryTarget(target, dataset, update, reads(rows.slice(1))),
  ).toBe(false)
  expect(
    await verifyDeferredGeometryTarget(
      target,
      dataset,
      update,
      reads(rows.map(r => ({ ...r, status: 'failed' }))),
    ),
  ).toBe(false)
  expect(
    await verifyDeferredGeometryTarget(target, dataset, { version: '2023.0' }, reads()),
  ).toBe(false)
})
