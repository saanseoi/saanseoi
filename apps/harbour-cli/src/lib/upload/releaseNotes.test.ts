import { describe, expect, test } from 'bun:test'

import { buildDatasetCode, buildDatasetReleaseCode, type UploadPlan } from '@repo/core'

import { resolveReleaseNotesUrl } from './releaseNotes.ts'

function buildOvertureDivisionPlan(
  type: 'division' | 'divisionArea' | 'divisionBoundary',
) {
  return {
    cohortKey: '2025-09-24.0',
    datasetCode: buildDatasetCode('hk', 'overture', type),
    datasetId: `dataset-overture-${type}`,
    fileName: `${type}.parquet`,
    filePath: `/tmp/${type}.parquet`,
    inferredFrom: {
      cohortKey: 'path',
      regionCode: 'path',
      source: 'path',
      sourceVersion: 'cohortKey',
      theme: 'path',
      type: 'path',
    },
    originalFileName: `${type}.parquet`,
    regionCode: 'hk',
    releaseCode: buildDatasetReleaseCode('hk', 'overture', '2025-09-24.0', type),
    rowCount: 1,
    schemaFingerprint: 'schema-fingerprint',
    source: 'overture',
    sourceVersion: '2025-09-24.0',
    supersedesDatasetId: null,
    theme: 'divisions',
    type,
  } satisfies UploadPlan
}

describe('Overture release notes', () => {
  test('uses the divisions notes for all division resource types', async () => {
    const urls = await Promise.all(
      (['division', 'divisionArea', 'divisionBoundary'] as const).map(type =>
        resolveReleaseNotesUrl(buildOvertureDivisionPlan(type), { skipPrompt: true }),
      ),
    )

    expect(urls).toEqual([
      'https://docs.overturemaps.org/blog/2025/09/24/release-notes/#divisions',
      'https://docs.overturemaps.org/blog/2025/09/24/release-notes/#divisions',
      'https://docs.overturemaps.org/blog/2025/09/24/release-notes/#divisions',
    ])
  })

  test('uses the release code as the cache key', async () => {
    const plan = buildOvertureDivisionPlan('division')
    plan.sourceVersion = '2025-09-25.0'

    await expect(resolveReleaseNotesUrl(plan, { skipPrompt: true })).resolves.toBe(
      'https://docs.overturemaps.org/blog/2025/09/24/release-notes/#divisions',
    )
  })

  test('uses the built-in release notes mapping for 2026-07-22.0', async () => {
    const plan = buildOvertureDivisionPlan('division')
    plan.sourceVersion = '2026-07-22.0'
    plan.releaseCode = buildDatasetReleaseCode(
      'hk',
      'overture',
      '2026-07-22.0',
      'division',
    )

    await expect(resolveReleaseNotesUrl(plan, { skipPrompt: true })).resolves.toBe(
      'https://docs.overturemaps.org/blog/2026/07/22/release-notes/#divisions',
    )
  })

  test('offers an interactive updater retry when release notes are missing', async () => {
    const plan = buildOvertureDivisionPlan('division')
    plan.releaseCode = buildDatasetReleaseCode(
      'hk',
      'overture',
      '2026-09-16.0',
      'division',
    )

    await expect(
      resolveReleaseNotesUrl(plan, {
        interactiveRetryCommand:
          './bin/saanseoi update --target local --dataset ds-hk-overture-division --download --check-now',
        skipPrompt: true,
      }),
    ).rejects.toThrow(
      'No upstream release-notes URL is cached for dr-hk-overture-division-2026-09-16.0. Pass --release-notes-url URL.\n\nRun interactively with:\n./bin/saanseoi update --target local --dataset ds-hk-overture-division --download --check-now',
    )
  })
})
