import { expect, test } from 'bun:test'
import { releasePublicationDate } from './metaRegistry'

test('only valid date-coded versions supply a publication date', () => {
  expect(releasePublicationDate('2024-02-29.0')).toBe('2024-02-29')
  for (const value of ['2023-02-29.0', '2021', '2023-H2', '2026-Q1', '2026-09', '']) {
    expect(releasePublicationDate(value)).toBeNull()
  }
})

test('explicit publisher dates are independent of reference periods', () => {
  expect(releasePublicationDate('2021', '2022-06-24')).toBe('2022-06-24')
  expect(releasePublicationDate('2023-H2', '2023-12-27')).toBe('2023-12-27')
  expect(releasePublicationDate('2026-10-01.0', '2026-10-02')).toBe('2026-10-02')
  for (const date of ['2023-02-29', '2026-Q2', '2024', '', '2024-01-01.0']) {
    expect(() => releasePublicationDate('2021', date)).toThrow(
      'Invalid publicationDate',
    )
  }
})
