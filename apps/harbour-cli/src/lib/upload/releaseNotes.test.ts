import { cp, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

import { buildDatasetCode, buildDatasetReleaseCode, type UploadPlan } from '@repo/core'

import {
  parseFixtureReleaseNotesUrl,
  resolveReleaseNotesUrl as resolveActualReleaseNotesUrl,
} from './releaseNotes.ts'

function buildOvertureDivisionPlan(
  resourceType: 'division' | 'divisionArea' | 'divisionBoundary',
) {
  return {
    cohortKey: '2025-09-24.0',
    datasetCode: buildDatasetCode('hk', 'overture', resourceType),
    datasetId: `dataset-overture-${resourceType}`,
    fileName: `${resourceType}.parquet`,
    filePath: `/tmp/${resourceType}.parquet`,
    inferredFrom: {
      cohortKey: 'path',
      regionCode: 'path',
      source: 'path',
      sourceVersion: 'cohortKey',
      theme: 'path',
      resourceType: 'path',
    },
    originalFileName: `${resourceType}.parquet`,
    regionCode: 'hk',
    releaseCode: buildDatasetReleaseCode(
      'hk',
      'overture',
      '2025-09-24.0',
      resourceType,
    ),
    rowCount: 1,
    schemaFingerprint: 'schema-fingerprint',
    source: 'overture',
    sourceVersion: '2025-09-24.0',
    supersedesDatasetId: null,
    theme: 'divisions',
    resourceType: resourceType,
  } satisfies UploadPlan
}

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
let fixtureRoot: string
beforeAll(async () => {
  fixtureRoot = await mkdtemp(resolve(tmpdir(), 'release-notes-'))
  await cp(resolve(REPO_ROOT, 'fixtures'), resolve(fixtureRoot, 'fixtures'), {
    recursive: true,
  })
})
afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
})
const resolveReleaseNotesUrl = (
  plan: UploadPlan,
  options: Parameters<typeof resolveActualReleaseNotesUrl>[1],
) => resolveActualReleaseNotesUrl(plan, { root: fixtureRoot, ...options })

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

  test('uses the source version to resolve fixture metadata', async () => {
    const plan = buildOvertureDivisionPlan('division')
    plan.releaseCode = buildDatasetReleaseCode(
      'hk',
      'overture',
      '2025-09-25.0',
      'division',
    )

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
    plan.sourceVersion = '2099-09-16.0'
    plan.releaseCode = buildDatasetReleaseCode(
      'hk',
      'overture',
      '2099-09-16.0',
      'division',
    )

    await expect(
      resolveReleaseNotesUrl(plan, {
        interactiveRetryCommand:
          './bin/saanseoi update --target local --dataset ds-hk-overture-division --download --check-now',
        skipPrompt: true,
      }),
    ).rejects.toThrow(
      'No upstream release-notes URL is cached for dr-hk-overture-division-2099-09-16.0. Pass --release-notes-url URL.\n\nRun interactively with:\n./bin/saanseoi update --target local --dataset ds-hk-overture-division --download --check-now',
    )
  })

  test('validates upstream URLs and local prose in release fixtures', async () => {
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

      const source = content.match(/^source:\s*"([^"]+)"$/m)?.[1]
      expect(datasetCode, path).toBeTruthy()
      expect(releaseCode, path).toBeTruthy()
      if (!url) {
        // Source releases can provide local prose without an upstream notes URL.
        expect(content.split('---')[2]?.trim(), path).toBeTruthy()
        if (source === 'saanseoi') {
          expect(content).toContain('## Changelog')
          await expect(
            resolveReleaseNotesUrl(
              {
                source,
                datasetCode,
                releaseCode,
                sourceVersion: content.match(/^sourceVersion:\s*"([^"]+)"$/m)?.[1],
              } as UploadPlan,
              { skipPrompt: true },
            ),
          ).resolves.toBeUndefined()
        }
        continue
      }

      expect(url).toMatch(/^https?:\/\//)
      await expect(
        resolveReleaseNotesUrl(
          {
            datasetCode,
            releaseCode,
            sourceVersion: content.match(/^sourceVersion:\s*"([^"]+)"$/m)?.[1],
          } as UploadPlan,
          {
            skipPrompt: true,
          },
        ),
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

test('curated releases cannot bypass their fixture changelog with an explicit URL', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'curated-notes-'))
  try {
    const notesDirectory = resolve(
      directory,
      'fixtures/meta/releases/ds-hk-saanseoi-division',
    )
    await mkdir(notesDirectory, { recursive: true })
    await writeFile(
      resolve(notesDirectory, 'dr-hk-saanseoi-division-2025-09-24.0.md'),
      '# Introduction\n',
    )
    const plan: UploadPlan = {
      ...buildOvertureDivisionPlan('division'),
      source: 'saanseoi',
      datasetCode: 'ds-hk-saanseoi-division',
      releaseCode: 'dr-hk-saanseoi-division-2025-09-24.0',
    }
    await expect(
      resolveReleaseNotesUrl(plan, {
        skipPrompt: true,
        explicitUrl: 'https://example.com/notes',
        root: directory,
      }),
    ).rejects.toThrow('Curated releases require their own fixture changelog.')
  } finally {
    await rm(directory, { recursive: true })
  }
})
