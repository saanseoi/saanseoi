import { describe, expect, test } from 'bun:test'

import { formatReleaseNavLabel } from './releaseNavLabel'

describe('formatReleaseNavLabel', () => {
  test.each([
    ['Release scope', 'Release Scope'],
    ['Revision log', 'Revision Log'],
    ['Names by locale', 'Names by Locale'],
    ['Record types', 'Record Types'],
    ['Notes and limitations', 'Notes & Limitations'],
  ])('formats %s', (label, expected) => {
    expect(formatReleaseNavLabel(label)).toBe(expected)
  })

  test('preserves acronyms, existing mixed case, and inline code', () => {
    expect(formatReleaseNavLabel('API fields by `sourceId` and PlanD')).toBe(
      'API Fields by `sourceId` and PlanD',
    )
  })
})
