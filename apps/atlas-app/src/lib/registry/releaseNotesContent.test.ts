import { expect, test } from 'bun:test'
import { resolveReleaseNotesContent } from './releaseNotesContent'

test.each([
  null,
  undefined,
  '',
  '  \n',
  '---\nrelease: example\n---\n',
  '# EN\n\n# ZH-HANT\n\n# ZH-HANS\n',
])('empty release notes are unpublished: %j', source => {
  expect(resolveReleaseNotesContent(source, 'en')).toEqual({
    markdown: '',
    hasPublishedNotes: false,
  })
})

test('distinguishes a missing translation from unpublished notes', () => {
  expect(resolveReleaseNotesContent('# EN\n\n# ZH-HANT\n\n已有記錄', 'en')).toEqual({
    markdown: '',
    hasPublishedNotes: true,
  })
  expect(resolveReleaseNotesContent('# ZH-HANT\n\n已有記錄', 'en')).toEqual({
    markdown: '',
    hasPublishedNotes: true,
  })
})

test('keeps English fallback, the selected translation and unsectioned Markdown', () => {
  expect(resolveReleaseNotesContent('# EN\n\nEnglish notes', 'zh-Hans').markdown).toBe(
    'English notes',
  )
  expect(
    resolveReleaseNotesContent('# EN\n\nEnglish\n\n# ZH-HANT\n\n繁體', 'zh-Hant')
      .markdown,
  ).toBe('繁體')
  expect(resolveReleaseNotesContent('## Changelog\n\nNotes', 'en').markdown).toBe(
    '## Changelog\n\nNotes',
  )
})
