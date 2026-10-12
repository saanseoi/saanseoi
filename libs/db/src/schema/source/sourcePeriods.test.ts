import { expect, test } from 'bun:test'
import { is } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as source from './index'

test('every source validity ledger distinguishes recurring periods or explicit release membership', () => {
  let checked = 0
  for (const table of Object.values(source)) {
    if (!is(table, SQLiteTable)) continue
    const config = getTableConfig(table)
    if (!config.columns.some(column => column.name === 'validFromRelease')) continue
    const key = config.primaryKeys.flatMap(key =>
      key.columns.map(column => column.name),
    )
    expect(key, config.name).toContain('sourceRecordId')
    expect(key, config.name).toContain('versionHash')
    expect(
      key.includes('validFromRelease') || key.includes('resourceReleaseId'),
      config.name,
    ).toBe(true)
    checked++
  }
  expect(checked).toBeGreaterThan(20)
})
