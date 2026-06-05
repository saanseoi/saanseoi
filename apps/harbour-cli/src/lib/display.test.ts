import { describe, expect, test } from 'bun:test'

import type { PreparedUploadResult } from '@repo/core'

import { formatPlan } from './display.ts'

const previewResult: PreparedUploadResult = {
  plan: {
    datasetId: 'overture-hk-2025-09-24.0-division',
    regionCode: 'hk',
    snapshotMonth: '2025-09',
    theme: 'divisions',
    type: 'division',
    source: 'overture',
    sourceVersion: '2025-09-24.0',
    filePath: '/tmp/division.parquet',
    fileName: 'division.parquet',
    originalFileName: 'division.parquet',
    rowCount: 1810,
    schemaFingerprint: 'test-schema',
    inferredFrom: {
      theme: 'path',
      type: 'path',
      regionCode: 'path',
      snapshotMonth: 'path',
      sourceVersion: 'flag',
    },
    supersedesDatasetId: null,
  },
  inspection: {
    rowCount: 1810,
    schema: [],
    distinctThemeValues: ['divisions'],
    distinctTypeValues: ['division'],
    distinctCountryValues: ['HK'],
    distinctRegionValues: ['HK'],
  },
}

describe('formatPlan', () => {
  test('includes source before sourceVersion and renders sourceVersion provenance', () => {
    const lines = formatPlan(previewResult)

    expect(lines[1]).toContain('source')
    expect(lines[1]).toContain('overture')
    expect(lines[2]).toContain('sourceVersion')
    expect(lines[2]).toContain('2025-09-24.0')
    expect(lines[2]).toContain('flag --source-version')
  })
})
