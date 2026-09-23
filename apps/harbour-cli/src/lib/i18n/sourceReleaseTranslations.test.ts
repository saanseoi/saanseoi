import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  resolveSourceReleaseNameTranslations,
  resolveSourceReleaseNameTranslationsBatch,
  sourceReleaseTranslationFixturePath,
} from './sourceReleaseTranslations.ts'

const SOURCE_RELEASE = 'dr-hk-hkgov-pland-division-pu-2001'

describe('source-release name translations', () => {
  test('does not generate Simplified Chinese names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'division-i18n-'))
    try {
      const result = await resolveSourceReleaseNameTranslations({
        allowGeneration: true,
        fixturePath: join(root, 'fixture.json'),
        localisations: [
          { locale: 'en', name: 'Central' },
          { locale: 'zh-hant', name: '中環' },
        ],
        recordId: 'PLAND:2001:001',
        sourceRelease: SOURCE_RELEASE,
        translate: async () => {
          throw new Error('must not call Azure')
        },
      })
      expect(result.translatedLocales).toEqual([])
      expect(result.localisations).toHaveLength(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('requires researched English instead of Azure translation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'division-i18n-'))
    try {
      await expect(
        resolveSourceReleaseNameTranslations({
          allowGeneration: true,
          fixturePath: join(root, 'fixture.json'),
          localisations: [{ locale: 'zh-hant', name: '中環' }],
          recordId: 'PLAND:2001:001',
          sourceRelease: SOURCE_RELEASE,
          translate: async () => {
            throw new Error('must not call Azure')
          },
        }),
      ).rejects.toThrow('Missing researched English division name')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('still generates and caches Traditional Chinese names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'division-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    const input = {
      fixturePath,
      sourceRelease: SOURCE_RELEASE,
      records: [
        {
          recordId: 'PLAND:2001:001',
          localisations: [{ locale: 'en', name: 'Central' }],
        },
      ],
    }
    try {
      const first = await resolveSourceReleaseNameTranslationsBatch({
        ...input,
        allowGeneration: true,
        translate: async (texts, { from, to }) => {
          expect([...texts]).toEqual(['Central'])
          expect(from).toBe('en')
          expect(to).toBe('zh-Hant')
          return new Map([['Central', '中環']])
        },
      })
      const second = await resolveSourceReleaseNameTranslationsBatch({
        ...input,
        translate: async () => {
          throw new Error('cache should prevent translation')
        },
      })
      expect(first).toEqual(second)
      expect(JSON.parse(await readFile(fixturePath, 'utf8')).entries).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('uses a source-release-only fixture path for a dotted release version', () => {
    const sourceRelease = 'dr-hk-overture-division-2025-09-24.0'

    expect(sourceReleaseTranslationFixturePath(sourceRelease)).toEndWith(
      `/fixtures/i18n/source-releases/${sourceRelease}.json`,
    )
  })

  test('requires a local import to create a missing fixture entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-i18n-fixture-'))
    try {
      await expect(
        resolveSourceReleaseNameTranslations({
          fixturePath: join(root, 'fixture.json'),
          localisations: [{ locale: 'en', name: 'Central' }],
          recordId: 'PLAND:2001:006',
          sourceRelease: SOURCE_RELEASE,
          translate: async () => new Map([['中環', 'ignored']]),
        }),
      ).rejects.toThrow('Run a local import')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
