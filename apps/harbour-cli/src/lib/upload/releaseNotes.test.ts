import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { buildDatasetCode, buildDatasetReleaseCode, type UploadPlan } from '@repo/core'

import { parseFixtureReleaseNotesUrl, resolveReleaseNotesUrl } from './releaseNotes.ts'

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

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

describe('release-notes fixtures', () => {
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

  test('uses the release code to resolve fixture metadata', async () => {
    const plan = buildOvertureDivisionPlan('division')
    plan.sourceVersion = '2025-09-25.0'

    await expect(resolveReleaseNotesUrl(plan, { skipPrompt: true })).resolves.toBe(
      'https://docs.overturemaps.org/blog/2025/09/24/release-notes/#divisions',
    )
  })

  test('uses fixture metadata for 2026-07-22.0', async () => {
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

  test('includes a valid URL in every release fixture', async () => {
    const paths = [] as string[]

    for await (const path of new Bun.Glob('fixtures/meta/releases/**/*.md').scan({
      cwd: REPO_ROOT,
    })) {
      paths.push(path)
    }

    expect(paths.length).toBeGreaterThan(0)

    for (const path of paths) {
      const content = await Bun.file(resolve(REPO_ROOT, path)).text()
      const datasetCode = content.match(/^dataset:\s*"([^"]+)"$/m)?.[1]
      const releaseCode = content.match(/^release:\s*"([^"]+)"$/m)?.[1]
      const url = parseFixtureReleaseNotesUrl(content)

      if (!datasetCode || !releaseCode || !url) {
        throw new Error(`Incomplete release fixture: ${path}`)
      }

      expect(url).toMatch(/^https?:\/\//)
      await expect(
        resolveReleaseNotesUrl({ datasetCode, releaseCode } as UploadPlan, {
          skipPrompt: true,
        }),
      ).resolves.toBe(url)
    }
  })
})

describe('fixture release notes', () => {
  test('reads a release-notes URL from frontmatter', () => {
    expect(
      parseFixtureReleaseNotesUrl(`---
release: "dr-hk-hkgov-had-division-area-district-2022"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218"
---
`),
    ).toBe(
      'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218',
    )
  })

  test('ignores fixtures without release-notes metadata', () => {
    expect(
      parseFixtureReleaseNotesUrl('---\nrelease: "dr-hk-example"\n---\n'),
    ).toBeUndefined()
  })
})
