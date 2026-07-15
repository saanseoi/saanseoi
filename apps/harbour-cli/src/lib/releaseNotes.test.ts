import { describe, expect, test } from 'bun:test'

import type { UploadPlan } from '@repo/core'

import { resolveReleaseNotesUrl } from './releaseNotes.ts'

function buildOvertureDivisionPlan(
  type: 'division' | 'divisionArea' | 'divisionBoundary',
) {
  return {
    cohortKey: '2025-09-24.0',
    datasetCode: `ds-hk-overture-${type}`,
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
    releaseCode: `overture-hk-2025-09-24.0-${type}`,
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
})
