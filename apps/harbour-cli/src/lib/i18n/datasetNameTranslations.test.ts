import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { resolveDatasetNameTranslationsBatch } from './datasetNameTranslations.ts'

const DATASET = 'ds-hk-overture-division'
const RELEASE_1 = 'dr-hk-overture-division-2025-09-24.0'
const RELEASE_2 = 'dr-hk-overture-division-2026-08-19.0'

const hash = (value: string) =>
  createHash('sha256').update(value.normalize('NFKC')).digest('hex')

const record = (recordId: string, parentName = 'Hong Kong Island') => ({
  context: { parentDivisionId: 'parent-1', parentName },
  localisations: [{ locale: 'zh-hant', name: '中環' }],
  recordId,
})

describe('dataset name translations', () => {
  test('reuses one context-aware entry across records and releases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-dataset-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      const first = await resolveDatasetNameTranslationsBatch({
        allowGeneration: true,
        datasetCode: DATASET,
        fixturePath,
        records: [record('division-1')],
        sourceRelease: RELEASE_1,
        translate: async (_, { to }) =>
          new Map([['中環', to === 'en' ? 'Central' : '中环']]),
      })
      expect(first.get('division-1')?.localisations).toEqual([
        { locale: 'en', name: 'Central' },
        { locale: 'zh-hans', name: '中环' },
      ])

      const second = await resolveDatasetNameTranslationsBatch({
        datasetCode: DATASET,
        fixturePath,
        records: [record('division-2')],
        sourceRelease: RELEASE_2,
        translate: async () => {
          throw new Error('dataset cache should prevent translation')
        },
      })
      expect(second.get('division-2')?.localisations).toEqual([
        { locale: 'en', name: 'Central' },
        { locale: 'zh-hans', name: '中环' },
      ])

      const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
        entries: Array<{
          firstSeenRelease: string
          lastSeenRelease: string
          recordIds: string[]
          sourceText: string
        }>
      }
      expect(fixture.entries).toHaveLength(2)
      expect(fixture.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            firstSeenRelease: RELEASE_1,
            lastSeenRelease: RELEASE_2,
            recordIds: ['division-1', 'division-2'],
            sourceText: '中環',
          }),
        ]),
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('keeps identical source text distinct when its parent context differs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-dataset-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    try {
      await resolveDatasetNameTranslationsBatch({
        allowGeneration: true,
        datasetCode: DATASET,
        fixturePath,
        records: [
          record('division-1', 'Hong Kong Island'),
          record('division-2', 'Kowloon'),
        ],
        sourceRelease: RELEASE_1,
        translate: async (_, { to }) =>
          new Map([['中環', to === 'en' ? 'Central' : '中环']]),
      })

      const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
        entries: Array<{ contextHash: string }>
      }
      expect(fixture.entries).toHaveLength(4)
      expect(new Set(fixture.entries.map(entry => entry.contextHash)).size).toBe(2)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('seeds a dataset fixture from the matching legacy release entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-dataset-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    const legacyFixturePath = join(root, 'legacy.json')
    try {
      await writeFile(
        legacyFixturePath,
        JSON.stringify({
          entries: [
            {
              field: 'name',
              recordId: 'division-1',
              sourceLocale: 'zh-hant',
              sourceTextHash: hash('中環'),
              targetLocale: 'zh-hans',
              text: '中环',
            },
          ],
        }),
      )
      const result = await resolveDatasetNameTranslationsBatch({
        datasetCode: DATASET,
        fixturePath,
        legacyFixturePath,
        records: [
          {
            context: { parentDivisionId: 'parent-1', parentName: 'Hong Kong Island' },
            localisations: [
              { locale: 'en', name: 'Central' },
              { locale: 'zh-hant', name: '中環' },
            ],
            recordId: 'division-1',
          },
        ],
        sourceRelease: RELEASE_1,
        translate: async () => {
          throw new Error('legacy fixture should prevent translation')
        },
      })
      expect(result.get('division-1')?.localisations).toEqual([
        { locale: 'zh-hans', name: '中环' },
      ])
      await expect(readFile(fixturePath, 'utf8')).resolves.toContain('"text": "中环"')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('returns human provenance from a reviewed dataset entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-dataset-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    const context = { parentDivisionId: 'parent-1', parentName: 'Hong Kong Island' }
    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          datasetCode: DATASET,
          entries: [
            {
              context,
              contextHash: hash(JSON.stringify(context)),
              field: 'name',
              firstSeenRelease: RELEASE_1,
              lastSeenRelease: RELEASE_1,
              provenance: 'human-translated',
              recordIds: ['division-1'],
              sourceLocale: 'zh-hant',
              sourceText: '中環',
              sourceTextHash: hash('中環'),
              targetLocale: 'zh-hans',
              text: '中环',
            },
          ],
          version: 1,
        }),
      )
      const result = await resolveDatasetNameTranslationsBatch({
        datasetCode: DATASET,
        fixturePath,
        records: [
          {
            context,
            localisations: [
              { locale: 'en', name: 'Central' },
              { locale: 'zh-hant', name: '中環' },
            ],
            recordId: 'division-1',
          },
        ],
        sourceRelease: RELEASE_2,
      })
      expect(result.get('division-1')?.applications).toEqual([
        expect.objectContaining({
          locale: 'zh-hans',
          name: '中环',
          provenance: 'human-translated',
        }),
      ])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  test('rejects conflicting translations with the same dataset identity key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'saanseoi-dataset-i18n-'))
    const fixturePath = join(root, 'fixture.json')
    const context = { parentDivisionId: 'parent-1', parentName: 'Hong Kong Island' }
    const shared = {
      context,
      contextHash: hash(JSON.stringify(context)),
      field: 'name',
      firstSeenRelease: RELEASE_1,
      lastSeenRelease: RELEASE_1,
      provenance: 'human-translated',
      recordIds: ['division-1'],
      sourceLocale: 'zh-hant',
      sourceText: '中環',
      sourceTextHash: hash('中環'),
      targetLocale: 'en',
    }
    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          datasetCode: DATASET,
          entries: [
            { ...shared, text: 'Central' },
            { ...shared, text: 'Central District' },
          ],
          version: 1,
        }),
      )
      await expect(
        resolveDatasetNameTranslationsBatch({
          datasetCode: DATASET,
          fixturePath,
          records: [record('division-1')],
          sourceRelease: RELEASE_1,
        }),
      ).rejects.toThrow('Conflicting dataset i18n fixture entries')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
