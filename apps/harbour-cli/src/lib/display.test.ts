import { describe, expect, test } from 'bun:test'

import type { PreparedUploadResult } from '@repo/core'

import { formatPlan } from './display.ts'

const previewResult: PreparedUploadResult = {
  plan: {
    datasetId: 'overture-hk-division-2025-09-24.0',
    datasetCode: 'hk-division',
    releaseCode: 'overture-hk-division-2025-09-24.0',
    regionCode: 'hk',
    cohortKey: '2025-09',
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
      cohortKey: 'path',
      source: 'path',
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
  test('includes source before sourceVersion and renders provenance for both', () => {
    const lines = formatPlan(previewResult)

    expect(lines[2]).toContain('source')
    expect(lines[2]).toContain('overture')
    expect(lines[2]).toContain('path')
    expect(lines[3]).toContain('sourceVersion')
    expect(lines[3]).toContain('2025-09-24.0')
    expect(lines[3]).toContain('flag --source-version')
  })
})
