import { describe, expect, test } from 'bun:test'

import {
  getMarkdownHeadings,
  diffMarkdown,
  selectMarkdownHeadingPath,
  selectMarkdownSection,
  stylizeSaanseoiInMarkdown,
} from './markdown'

describe('selectMarkdownSection', () => {
  test('keeps the active heading in each changed Markdown hunk', () => {
    expect(
      diffMarkdown(
        '## Changelog\n\n- Old upstream change\n\n## Compatibility\n\nStable text',
        '## Changelog\n\n- New upstream change\n\n## Compatibility\n\nStable text',
      ),
    ).toEqual({
      addedLines: 1,
      changes: [
        {
          addedMarkdown: '## Changelog\n- New upstream change',
          removedMarkdown: '## Changelog\n- Old upstream change',
        },
      ],
      removedLines: 1,
    })
  })

  test('includes changed headings and only changed lines', () => {
    expect(
      diffMarkdown(
        '## Old heading\n\nUnchanged body',
        '## New heading\n\nUnchanged body',
      ),
    ).toEqual({
      addedLines: 1,
      changes: [
        {
          addedMarkdown: '## New heading',
          removedMarkdown: '## Old heading',
        },
      ],
      removedLines: 1,
    })
  })

  test('returns stable, unique IDs for Markdown headings', () => {
    expect(getMarkdownHeadings('## Overview\n\n### Detail\n\n## Overview')).toEqual([
      { id: 'source-heading-overview', level: 2, text: 'Overview' },
      { id: 'source-heading-detail', level: 3, text: 'Detail' },
      { id: 'source-heading-overview-1', level: 2, text: 'Overview' },
    ])
  })

  test('returns the requested level-two section and its nested content', () => {
    expect(
      selectMarkdownSection(
        '# Document\n\n## First\n\nFirst text\n\n### Detail\n\nNested text\n\n## Second\n\nSecond text',
        'First',
      ),
    ).toBe('## First\n\nFirst text\n\n### Detail\n\nNested text')
  })

  test('fails when the requested section does not exist', () => {
    expect(() => selectMarkdownSection('## First', 'Missing')).toThrow(
      'Markdown section not found: Missing',
    )
  })

  test('returns the body at a nested, versioned heading path', () => {
    const source =
      '# locale\n\n## v1\n\n### EN\n\nVersion one\n\n### ZH-HANT\n\n繁體中文\n\n## v2\n\n### EN\n\nVersion two'

    expect(
      selectMarkdownHeadingPath(source, [
        { heading: 'locale', level: 1 },
        { heading: 'v1', level: 2 },
        { heading: 'en', level: 3 },
      ]),
    ).toBe('Version one')

    expect(
      selectMarkdownHeadingPath(source, [
        { heading: 'locale', level: 1 },
        { heading: 'v1', level: 2 },
        { heading: 'zh-hant', level: 3 },
      ]),
    ).toBe('繁體中文')
  })

  test('replaces each SaanSeoi brand mention with its Markdown renderer tag', () => {
    expect(stylizeSaanseoiInMarkdown('山水 | SaanSeoi and 山水 | SaanSeoi')).toBe(
      '<saanseoi>山水 | SaanSeoi</saanseoi> and <saanseoi>山水 | SaanSeoi</saanseoi>',
    )
  })
})
