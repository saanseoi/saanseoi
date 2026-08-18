import { describe, expect, test } from 'bun:test'

import { buildCanonicalStatsSqlBatches } from './canonicalStatsSql.ts'

describe('buildCanonicalStatsSqlBatches', () => {
  test('keeps unrelated reference periods in the current view', () => {
    const observation = {
      createdAt: '2026-08-18T00:00:00.000Z',
      id: 'stats:2016',
      measureCode: 'population',
      numericValue: '100',
      observationStatus: 'published',
      sourceField: 'population',
      sourceValue: '100',
      seriesId: 'stats-series:2016:feature',
      unitCode: 'person',
      updatedAt: '2026-08-18T00:00:00.000Z',
      valueCode: null,
      valuePrecision: null,
    }
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows: [observation], table: 'statsObservations' }],
      history: [],
    })

    expect(batches.current.join('\n')).not.toContain('DELETE FROM "statsObservations"')
    expect(batches.current.join('\n')).toContain('ON CONFLICT ("id") DO UPDATE SET')
  })

  test('combines compatible canonical rows into D1-sized multi-row statements', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      createdAt: '2026-08-18T00:00:00.000Z',
      id: `stats:${index}`,
      measureCode: 'population',
      numericValue: String(index),
      observationStatus: 'published',
      seriesId: 'stats-series:feature',
      sourceField: 'population',
      sourceValue: String(index),
      unitCode: 'person',
      updatedAt: '2026-08-18T00:00:00.000Z',
      valueCode: null,
      valuePrecision: null,
    }))
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows, table: 'statsObservations' }],
      history: [],
    })

    expect(batches.current).toHaveLength(1)
    expect(batches.current[0]?.match(/INSERT INTO/g)).toHaveLength(1)
    expect(batches.current[0]).toContain("'stats:0'")
    expect(batches.current[0]).toContain("'stats:99'")
  })
})
