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

function buildSimplifiedCenstatdPlan() {
  const type = 'divisionArea' as const
  return {
    ...buildOvertureDivisionPlan(type),
    cohortKey: '2016',
    datasetCode: buildDatasetCode('hk', 'hkgov-censtatd', type),
    releaseCode: buildDatasetReleaseCode(
      'hk',
      'hkgov-censtatd',
      '2016-simplified-v1',
      type,
    ),
    source: 'hkgov-censtatd',
    sourceVersion: '2016-simplified-v1',
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

  test('omits release notes for locally derived C&SD display geometry', async () => {
    await expect(
      resolveReleaseNotesUrl(buildSimplifiedCenstatdPlan(), { skipPrompt: false }),
    ).resolves.toBeUndefined()
  })
})
