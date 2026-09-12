import { expect, test } from 'bun:test'
import type { FixtureEntry } from './datasetNameTranslations'
import { translationEntries, translationMap } from './datasetTranslationFixture'

const entry: FixtureEntry = {
  context: { parentDivisionId: 'parent' },
  contextHash: 'parent',
  field: 'name',
  sourceLocale: 'zh-hant',
  sourceText: '中環',
  sourceTextHash: 'source',
  targetLocale: 'en',
  text: 'Central',
  provenance: 'human-translated',
  firstSeenRelease: 'release-1',
  lastSeenRelease: 'release-2',
  recordIds: ['record-1'],
}

test('maps share values while preserving independent contextual choices and usage', () => {
  const entries = [
    entry,
    { ...entry, contextHash: 'other', context: { parentDivisionId: 'other' } },
    {
      ...entry,
      contextHash: 'third',
      context: { parentDivisionId: 'third' },
      text: 'Different',
    },
  ]
  const fixture = translationMap('dataset', entries)
  expect(Object.keys(fixture.translations)).toHaveLength(2)
  expect(Object.keys(fixture.contexts)).toHaveLength(3)
  expect(Object.keys(fixture.usages)).toHaveLength(3)
  expect(translationEntries(fixture)).toEqual(expect.arrayContaining(entries))
  expect(translationMap('dataset', translationEntries(fixture))).toEqual(fixture)
  expect(JSON.stringify(translationMap('dataset', [...entries].reverse()))).toBe(
    JSON.stringify(fixture),
  )
})

test('rejects dangling context and translation references', () => {
  const fixture = translationMap('dataset', [entry])
  expect(() => translationEntries({ ...fixture, contexts: {} })).toThrow('Dangling')
  expect(() => translationEntries({ ...fixture, translations: {} })).toThrow('Dangling')
})
