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
  test('generates and reuses a Simplified Chinese fixture entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-i18n-fixture-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      const first = await resolveSourceReleaseNameTranslations({
        allowGeneration: true,
        fixturePath,
        localisations: [
          { locale: 'en', name: 'Central' },
          { locale: 'zh-hant', name: '中環' },
        ],
        recordId: 'PLAND:2001:001',
        sourceRelease: SOURCE_RELEASE,
        translate: async (texts, { from, to }) => {
          expect([...texts]).toEqual(['中環'])
          expect(from).toBe('zh-Hant')
          expect(to).toBe('zh-Hans')
          return new Map([['中環', '中环']])
        },
      })

      expect(first.sourceLocales).toEqual(['en', 'zh-hant'])
      expect(first.translatedLocales).toEqual(['zh-hans'])
      expect(first.localisations).toContainEqual({ locale: 'zh-hans', name: '中环' })
      await expect(readFile(fixturePath, 'utf8')).resolves.toContain(
        '"isTranslationVerified": false',
      )

      const second = await resolveSourceReleaseNameTranslations({
        fixturePath,
        localisations: [
          { locale: 'en', name: 'Central' },
          { locale: 'zh-hant', name: '中環' },
        ],
        recordId: 'PLAND:2001:001',
        sourceRelease: SOURCE_RELEASE,
        translate: async () => {
          throw new Error('fixture cache should prevent translation')
        },
      })
      expect(second.translatedLocales).toEqual(['zh-hans'])
      expect(second.localisations).toContainEqual({ locale: 'zh-hans', name: '中环' })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('uses Simplified Chinese to supply English when both Chinese source labels exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-i18n-fixture-'))
    try {
      const result = await resolveSourceReleaseNameTranslations({
        allowGeneration: true,
        fixturePath: join(root, 'fixture.json'),
        localisations: [
          { locale: 'zh-hans', name: '中环' },
          { locale: 'zh-hant', name: '中環' },
        ],
        recordId: 'PLAND:2001:002',
        sourceRelease: SOURCE_RELEASE,
        translate: async (texts, { from, to }) => {
          expect([...texts]).toEqual(['中环'])
          expect(from).toBe('zh-Hans')
          expect(to).toBe('en')
          return new Map([['中环', 'Central']])
        },
      })
      expect(result.translatedLocales).toEqual(['en'])
      expect(result.localisations).toContainEqual({ locale: 'en', name: 'Central' })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('batches distinct names once per locale pair and writes each record cache entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-i18n-fixture-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      const result = await resolveSourceReleaseNameTranslationsBatch({
        allowGeneration: true,
        fixturePath,
        records: [
          {
            localisations: [{ locale: 'zh-hant', name: '中環' }],
            recordId: 'PLAND:2001:003',
          },
          {
            localisations: [{ locale: 'zh-hant', name: '中環' }],
            recordId: 'PLAND:2001:004',
          },
          {
            localisations: [{ locale: 'zh-hant', name: '灣仔' }],
            recordId: 'PLAND:2001:005',
          },
        ],
        sourceRelease: SOURCE_RELEASE,
        translate: async (texts, { from, to }) => {
          expect(from).toBe('zh-Hant')
          if (to === 'en') {
            expect([...texts].sort()).toEqual(['中環', '灣仔'])
            return new Map([
              ['中環', 'Central'],
              ['灣仔', 'Wan Chai'],
            ])
          }
          expect(to).toBe('zh-Hans')
          expect([...texts].sort()).toEqual(['中環', '灣仔'])
          return new Map([
            ['中環', '中环'],
            ['灣仔', '湾仔'],
          ])
        },
      })

      expect(result.get('PLAND:2001:003')?.localisations).toEqual([
        { locale: 'en', name: 'Central' },
        { locale: 'zh-hans', name: '中环' },
        { locale: 'zh-hant', name: '中環' },
      ])
      const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
        entries: unknown[]
      }
      expect(fixture.entries).toHaveLength(6)
    } finally {
      await rm(root, { force: true, recursive: true })
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
          localisations: [{ locale: 'zh-hant', name: '中環' }],
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
