import { describe, expect, test } from 'bun:test'

import { buildCanonicalStatsSqlBatches } from './canonicalStatsSql.ts'

describe('buildCanonicalStatsSqlBatches', () => {
  test('keeps unrelated reference periods in the current view', () => {
    const observation = {
      createdAt: '2026-08-18T00:00:00.000Z',
      datasetCode: 'ds-test',
      geographyCohortId: null,
      id: 'stats:2016',
      measureCode: 'population',
      numericValue: '100',
      observationStatus: 'published',
      referencePeriodCode: '2016',
      referencePeriodGranularity: 'year',
      sourceFeatureId: 'layer:feature',
      sourceField: 'population',
      sourceReleaseId: 'compilation-2026-q2',
      sourceValue: '100',
      unitCode: 'person',
      updatedAt: '2026-08-18T00:00:00.000Z',
      valueCode: null,
      valuePrecision: null,
      divisionId: null,
      referencePeriodEnd: null,
      referencePeriodStart: null,
    }
    const batches = buildCanonicalStatsSqlBatches({
      current: [{ rows: [observation], table: 'statsObservations' }],
      history: [],
    })

    expect(batches.current.join('\n')).not.toContain('DELETE FROM "statsObservations"')
    expect(batches.current.join('\n')).toContain('ON CONFLICT ("id") DO UPDATE SET')
  })
})
