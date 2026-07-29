import { expect, test } from 'vitest'

import {
  getMarkdownGlossaryEntries,
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from './referenceDocs'

test('resolves glossary definitions in the requested locale', () => {
  const transclusion = getMarkdownTransclusion('saanseoi:zh-hant:definition/release/v1')

  expect(transclusion?.markdown).toContain('不可變已發布版本')
  expect(transclusion?.type).toBe('definition')
})

test('lists glossary definitions alphabetically without contextual notes', () => {
  const entries = getMarkdownGlossaryEntries('en')

  expect(entries.map(entry => entry.id)).toContain('release')
  expect(entries.map(entry => entry.id)).toContain('hkgov-censtatd')
  expect(entries.map(entry => entry.id)).not.toContain('hong-kong-extract')
  expect(entries.map(entry => entry.id)).toEqual(
    [...entries]
      .sort((left, right) =>
        new Intl.Collator('en', { sensitivity: 'base' }).compare(
          getMarkdownTransclusionDisplayTitle(left, 'en'),
          getMarkdownTransclusionDisplayTitle(right, 'en'),
        ),
      )
      .map(entry => entry.id),
  )
})
