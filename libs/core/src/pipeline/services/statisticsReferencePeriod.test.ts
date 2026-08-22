import { describe, expect, test } from 'bun:test'

import {
  parseStatisticsReferencePeriod,
  type StatisticsReferencePeriod,
} from './statisticsReferencePeriod'

describe('parseStatisticsReferencePeriod', () => {
  test.each([
    ['2023', 'year', '2023-01-01', '2023-12-31', '2023'],
    ['2023-Q3', 'quarter', '2023-07-01', '2023-09-30', '2023'],
    ['2024-H1', 'half-year', '2024-01-01', '2024-06-30', '2024'],
    ['2024-02', 'month', '2024-02-01', '2024-02-29', '2024'],
  ] as const)(
    'derives exact bounds for %s',
    (code, granularity, start, end, endYear) => {
      expect(parseStatisticsReferencePeriod(code)).toEqual({
        code,
        end,
        endYear,
        granularity: granularity as StatisticsReferencePeriod['granularity'],
        start,
      })
    },
  )

  test.each([
    ['2024/25', '2025'],
    ['2016-2021', '2021'],
    ['2016\u20132021', '2021'],
  ])('routes spanning period %s by its end year', (code, endYear) => {
    expect(parseStatisticsReferencePeriod(code)).toEqual({
      code,
      end: null,
      endYear,
      granularity: 'multi-year',
      start: null,
    })
  })

  test('preserves an unknown publisher code and extracts its final year', () => {
    expect(parseStatisticsReferencePeriod('survey 2021 to 2023')).toEqual({
      code: 'survey 2021 to 2023',
      end: null,
      endYear: '2023',
      granularity: 'unknown',
      start: null,
    })
  })
})
