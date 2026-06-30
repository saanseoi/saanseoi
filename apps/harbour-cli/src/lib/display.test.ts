import { describe, expect, test } from 'bun:test'

import type { PreparedUploadResult } from '@repo/core'

import {
  formatPlan,
  formatSchemaCheck,
  formatSummary,
  formatUploadResult,
} from './display.ts'
import type { UploadTarget } from './options.ts'

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

const localTarget: UploadTarget = {
  remote: false,
  environment: 'dev',
}

describe('formatPlan', () => {
  test('renders the compact upload plan', () => {
    const lines = formatPlan(previewResult)

    expect(lines).toHaveLength(4)
    expect(lines[0]).toContain('dataset')
    expect(lines[0]).toContain('hk-division')
    expect(lines[1]).toContain('release')
    expect(lines[1]).toContain('overture')
    expect(lines[1]).toContain('2025-09-24.0')
    expect(lines[2]).toContain('cohortKey')
    expect(lines[2]).toContain('path')
    expect(lines[3]).toContain('rows')
    expect(lines[3]).toContain('1810')
  })
})

describe('formatSummary', () => {
  test('renders target as environment and Harbour API only', () => {
    const lines = formatSummary(previewResult, localTarget)

    expect(lines[0]).toContain('target')
    expect(lines[0]).toContain('dev')
    expect(lines[0]).toContain('http://localhost:8788')
    expect(lines.join('\n')).not.toContain('sourceVersion')
    expect(lines.join('\n')).not.toContain('harbourApi')
  })
})

describe('formatUploadResult', () => {
  test('uses the requested field order and schemaVersion label', () => {
    const lines = formatUploadResult(previewResult, {
      datasetCode: 'ds-hk-overture-division',
      rawObjectKey: 'hk/overture/2025-09-24.0/division.parquet',
      releaseId: 'release-123',
      datasetId: 'dataset-456',
      schemaVersion: '1.12.0',
      status: 'staged',
    })

    expect(lines[0]).toContain('status')
    expect(lines[1]).toContain('R2')
    expect(lines[2]).toContain('dataset')
    expect(lines[3]).toContain('datasetId')
    expect(lines[4]).toContain('release')
    expect(lines[5]).toContain('releaseId')
    expect(lines[6]).toContain('schemaVersion')
  })
})

describe('formatSchemaCheck', () => {
  test('renders a compact status line', () => {
    expect(formatSchemaCheck('passed')).toContain('Schema Check')
    expect(formatSchemaCheck('failed')).toContain('Schema Check')
    expect(formatSchemaCheck('skipped')).toContain('Schema Check')
  })
})
