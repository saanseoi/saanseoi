import { expect, test } from 'bun:test'
import { releasePublicationDate } from './metaRegistry'

test('only valid date-coded versions supply a publication date', () => {
  expect(releasePublicationDate('2024-02-29.0')).toBe('2024-02-29')
  for (const value of ['2023-02-29.0', '2021', '2023-H2', '2026-Q1', '2026-09', '']) {
    expect(releasePublicationDate(value)).toBeNull()
  }
})
