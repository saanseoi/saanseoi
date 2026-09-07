import { expect, test } from 'bun:test'
import { shouldIncludePreviousShardYears } from './processLocalAddressSqlUploadImport'

test('includes previous history shards for every date-based address cohort', () => {
  expect(shouldIncludePreviousShardYears('2025-01-23.0')).toBe(true)
  expect(shouldIncludePreviousShardYears('2025-02-25.0')).toBe(true)
  expect(shouldIncludePreviousShardYears('2026-08-19.0')).toBe(true)
})
