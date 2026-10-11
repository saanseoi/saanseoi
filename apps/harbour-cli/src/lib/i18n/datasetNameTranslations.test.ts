import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import {
  resolveDatasetNameTranslationsBatch,
  type FixtureEntry,
} from './datasetNameTranslations'
import { translationMap, translationEntries } from './datasetTranslationFixture'

const datasetCode = 'ds-hk-overture-division'
const sourceRelease = 'dr-hk-overture-division-2026-08-19.0'
const hash = (s: string) =>
  createHash('sha256').update(s.normalize('NFKC')).digest('hex')
const context = { parentDivisionId: 'parent-1', parentName: 'Hong Kong Island' }
const record = {
  context,
  localisations: [{ locale: 'zh-hant', name: '中環' }],
  recordId: 'division-1',
}
const entry: FixtureEntry = {
  context,
  contextHash: hash(JSON.stringify(context)),
  field: 'name',
  firstSeenRelease: sourceRelease,
  lastSeenRelease: sourceRelease,
  sourceLocale: 'zh-hant',
  sourceText: '中環',
  sourceTextHash: hash('中環'),
  targetLocale: 'en',
  text: 'Central',
  provenance: 'ai-translated',
  references: ['https://example.org/central'],
}

async function fixtureTest(run: (fixturePath: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'division-i18n-'))
  try {
    await run(join(root, 'fixture.json'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('reuses researched English names across records and releases, retaining evidence', () =>
  fixtureTest(async fixturePath => {
    await writeFile(fixturePath, JSON.stringify(translationMap(datasetCode, [entry])))
    const result = await resolveDatasetNameTranslationsBatch({
      datasetCode,
      sourceRelease,
      fixturePath,
      records: [record, { ...record, recordId: 'division-2' }],
      translate: async () => {
        throw new Error('must not call Azure')
      },
    })
    expect(result.get('division-1')?.localisations).toEqual([
      { locale: 'en', name: 'Central' },
    ])
    const stored = translationEntries(JSON.parse(await readFile(fixturePath, 'utf8')))
    expect(stored[0]?.references).toEqual(entry.references)
    expect(stored[0]?.recordIds).toEqual(['division-1', 'division-2'])
  }))

test('does not generate or reuse Simplified Chinese names from dataset or legacy fixtures', () =>
  fixtureTest(async fixturePath => {
    await writeFile(
      fixturePath,
      JSON.stringify(
        translationMap(datasetCode, [
          { ...entry, targetLocale: 'zh-hans', text: '中环' },
        ]),
      ),
    )
    const legacyFixturePath = `${fixturePath}.legacy`
    await writeFile(
      legacyFixturePath,
      JSON.stringify({
        entries: [
          {
            ...entry,
            recordId: record.recordId,
            targetLocale: 'zh-hans',
            text: '中环',
          },
        ],
      }),
    )
    const result = await resolveDatasetNameTranslationsBatch({
      datasetCode,
      sourceRelease,
      fixturePath,
      legacyFixturePath,
      records: [
        {
          ...record,
          localisations: [...record.localisations, { locale: 'en', name: 'Central' }],
        },
      ],
      allowGeneration: true,
      translate: async () => {
        throw new Error('must not call Azure')
      },
    })
    expect(result.get(record.recordId)?.applications).toEqual([])
  }))

test('queues every missing English name with context instead of using unresearched Azure results', () =>
  fixtureTest(async fixturePath => {
    await writeFile(
      fixturePath,
      JSON.stringify(
        translationMap(datasetCode, [{ ...entry, references: undefined }]),
      ),
    )
    await expect(
      resolveDatasetNameTranslationsBatch({
        datasetCode,
        sourceRelease,
        fixturePath,
        allowGeneration: true,
        records: [
          record,
          {
            ...record,
            recordId: 'division-2',
            context: { ...context, parentDivisionId: 'other' },
          },
        ],
        translate: async () => {
          throw new Error('must not call Azure')
        },
      }),
    ).rejects.toThrow('Missing researched English division names for 2 records')
    const review = JSON.parse(
      await readFile(`${fixturePath}.english-review.json`, 'utf8'),
    )
    expect(review.records).toHaveLength(2)
    expect(review.records[0].sourceText).toBe('中環')
    expect(review.records[0].searchUrl).toContain('https://www.google.com/search?q=')
  }))

test('removes the research queue after local curation resolves it', () =>
  fixtureTest(async fixturePath => {
    const input = {
      datasetCode,
      sourceRelease,
      fixturePath,
      records: [record],
      allowGeneration: true,
    }
    const reviewPath = `${fixturePath}.english-review.json`
    await expect(resolveDatasetNameTranslationsBatch(input)).rejects.toThrow(
      'Missing researched English division names',
    )
    expect(JSON.parse(await readFile(reviewPath, 'utf8')).records).toHaveLength(1)
    await writeFile(fixturePath, JSON.stringify(translationMap(datasetCode, [entry])))
    const result = await resolveDatasetNameTranslationsBatch(input)
    expect(result.get(record.recordId)?.localisations).toEqual([
      { locale: 'en', name: 'Central' },
    ])
    await expect(readFile(reviewPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(resolveDatasetNameTranslationsBatch(input)).resolves.toBeInstanceOf(
      Map,
    )
  }))

test('preserves research queues for remote runs and skipped automated entries', () =>
  fixtureTest(async fixturePath => {
    await writeFile(fixturePath, JSON.stringify(translationMap(datasetCode, [entry])))
    const reviewPath = `${fixturePath}.english-review.json`
    const review = JSON.stringify({ datasetCode, records: [record] })
    await writeFile(reviewPath, review)
    for (const options of [
      { allowGeneration: false },
      { allowGeneration: true, ignoreAutomated: true },
    ]) {
      await resolveDatasetNameTranslationsBatch({
        datasetCode,
        sourceRelease,
        fixturePath,
        records: [record],
        ...options,
      })
      expect(await readFile(reviewPath, 'utf8')).toBe(review)
    }
  }))

test('preserves research queues when another locale fails to resolve', () =>
  fixtureTest(async fixturePath => {
    const reviewPath = `${fixturePath}.english-review.json`
    await writeFile(reviewPath, 'pending research')
    await expect(
      resolveDatasetNameTranslationsBatch({
        datasetCode,
        sourceRelease,
        fixturePath,
        allowGeneration: true,
        records: [{ ...record, localisations: [{ locale: 'en', name: 'Central' }] }],
        translate: async () => {
          throw new Error('translation failed')
        },
      }),
    ).rejects.toThrow('translation failed')
    expect(await readFile(reviewPath, 'utf8')).toBe('pending research')
  }))

test('accepts human curation and preserves publisher English names', () =>
  fixtureTest(async fixturePath => {
    await writeFile(
      fixturePath,
      JSON.stringify(
        translationMap(datasetCode, [
          { ...entry, references: undefined, provenance: 'human-translated' },
        ]),
      ),
    )
    const result = await resolveDatasetNameTranslationsBatch({
      datasetCode,
      sourceRelease,
      fixturePath,
      records: [
        record,
        {
          ...record,
          recordId: 'division-2',
          localisations: [
            ...record.localisations,
            { locale: 'en', name: 'Publisher spelling' },
          ],
        },
      ],
    })
    expect(result.get(record.recordId)?.applications[0]?.provenance).toBe(
      'human-translated',
    )
    expect(result.get('division-2')?.applications).toEqual([])
  }))

test('remote imports report missing curation without writing a research queue', () =>
  fixtureTest(async fixturePath => {
    await expect(
      resolveDatasetNameTranslationsBatch({
        datasetCode,
        sourceRelease,
        fixturePath,
        records: [record],
      }),
    ).rejects.toThrow('Run a local import')
    await expect(readFile(`${fixturePath}.english-review.json`)).rejects.toThrow()
  }))

test('curated Hong Kong English names resolve every queued context without Azure', () =>
  fixtureTest(async fixturePath => {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          '../../../../../fixtures/i18n/datasets/ds-hk-overture-division.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    await writeFile(fixturePath, JSON.stringify(fixture))
    const entries = translationEntries(fixture).filter(
      entry => entry.targetLocale === 'en',
    )
    const byName = new Map(entries.map(entry => [entry.sourceText, entry]))
    expect(byName.size).toBe(31)
    expect(byName.get('蠔田')?.text).toBe('Ho Tin')
    expect(byName.get('伍村')?.text).toBe('Ng Tsuen')
    expect(byName.get('貝澳圍')?.text).toBe('Pui O Wai')
    expect(byName.get('楊家村')?.text).toBe('Yeung Ka Tsuen')
    expect(byName.get('阳家村')?.text).toBe('Yeung Ka Tsuen')
    let applications = 0
    for (const entry of entries) {
      expect(entry.machine).toBeUndefined()
      expect(entry.derivation).toBeTruthy()
      if (entry.provenance === 'ai-translated') {
        expect(entry.references?.length).toBeGreaterThan(0)
      }
      const result = await resolveDatasetNameTranslationsBatch({
        datasetCode,
        fixturePath,
        sourceRelease: entry.lastSeenRelease,
        records: (entry.recordIds ?? []).map(recordId => ({
          recordId,
          context: entry.context,
          localisations: [
            { locale: entry.sourceLocale, name: entry.sourceText! },
            ...(entry.sourceText === '阳家村'
              ? [{ locale: 'zh-hant', name: '楊家村' }]
              : []),
          ],
        })),
        translate: async () => {
          throw new Error('curated names must not call Azure')
        },
      })
      for (const resolved of result.values()) {
        expect(resolved.localisations).toEqual([{ locale: 'en', name: entry.text }])
        expect(resolved.applications[0]?.derivation).toBe(entry.derivation)
        applications++
      }
    }
    expect(applications).toBe(44)
  }))

test('Division policy ignores cached automated names and does not generate missing locales', () =>
  fixtureTest(async fixturePath => {
    await writeFile(fixturePath, JSON.stringify(translationMap(datasetCode, [entry])))
    const result = await resolveDatasetNameTranslationsBatch({
      datasetCode,
      sourceRelease,
      fixturePath,
      records: [record],
      ignoreAutomated: true,
      allowGeneration: true,
      translate: async () => {
        throw new Error('automated generation is disabled')
      },
    })
    expect(result.get(record.recordId)?.applications).toEqual([])
    expect(result.get(record.recordId)?.localisations).toEqual([])
  }))
