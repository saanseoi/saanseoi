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
  const vite = getMarkdownTransclusion('saanseoi:en:note/vite/v1')
  const render = getMarkdownTransclusion('saanseoi:en:definition/render/v1')
  const mapStyle = getMarkdownTransclusion('saanseoi:en:definition/map-style/v1')
  const request = getMarkdownTransclusion('saanseoi:en:definition/request/v1')
  const authentication = getMarkdownTransclusion(
    'saanseoi:en:definition/authentication/v1',
  )

  expect(api?.markdown).toContain('<i>software</i>')
  expect(basemap?.markdown).toContain('<i>bottom background layer</i>')
  expect(basemap?.type).toBe('note')
  expect(vite?.markdown).toContain('bundles your project files')
  expect(vite?.type).toBe('note')
  expect(render?.markdown).toContain('turn geographic data')
  expect(mapStyle?.markdown).toContain('set of visual rules')
  expect(request?.markdown).toContain('message sent to a server')
  expect(authentication?.markdown).toContain('confirms <i>who</i>')
})

test('resolves division filter notes with Markdown list details', () => {
  const levels = getMarkdownTransclusion(
    'saanseoi:en:note/division-hierarchy-levels/v1',
  )
  const types = getMarkdownTransclusion('saanseoi:en:note/canonical-division-types/v1')

  expect(levels?.markdown).toContain('- Level 1')
  expect(levels?.markdown).toContain('Level 6')
  expect(types?.markdown).toContain('- Root')
  expect(types?.markdown).toMatch(/does not\s+accept an Overture subtype or class/)
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
