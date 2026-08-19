import { expect, test } from 'bun:test'

import { resolveShardBindingName } from './localDbCache.ts'

test('uses the annual D1 shard for a dated release version', () => {
  expect(resolveShardBindingName('history', 'HK', '2026-08-14.0')).toBe(
    'DB_HISTORY_HK_2026',
  )
  expect(resolveShardBindingName('source', 'HK', '2024-12-31.0')).toBe(
    'DB_SOURCE_HK_BEFORE',
  )
})
