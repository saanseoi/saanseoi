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

test('resolves map-guide glossary definitions and notes', () => {
  const api = getMarkdownTransclusion('saanseoi:en:definition/api/v1')
  const basemap = getMarkdownTransclusion('saanseoi:en:note/basemap/v1')
  const render = getMarkdownTransclusion('saanseoi:en:definition/render/v1')
  const mapStyle = getMarkdownTransclusion('saanseoi:en:definition/map-style/v1')

  expect(api?.markdown).toContain('<i>software</i>')
  expect(basemap?.markdown).toContain('<i>bottom background layer</i>')
  expect(basemap?.type).toBe('note')
  expect(render?.markdown).toContain('turn geographic data')
  expect(mapStyle?.markdown).toContain('visual instructions')
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
