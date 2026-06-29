import { describe, expect, test } from 'bun:test'

import {
  filterIngestionRows,
  formatIngestionReportTable,
  formatReleaseReportTable,
  formatStatsReportTable,
} from './display.ts'
import type {
  IngestRunReportRow,
  ReleaseReportRow,
  StatReportRow,
} from './reporting.ts'

describe('filterIngestionRows', () => {
  test('keeps all ongoing releases plus the latest finished release', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'hk-address',
        error: null,
        finishedAt: null,
        phase: 'extractAddresses',
        releaseCode: 'overture-hk-2026-06-24.0-address',
        releaseId: 'release-1',
        runId: 'run-1',
        cohortKey: '2026-06',
        source: 'overture',
        startedAt: '2026-06-24T10:00:00.000Z',
        stats: null,
        status: 'running',
        type: 'address',
      },
      {
        datasetCode: 'hk-address',
        error: null,
        finishedAt: '2026-06-23T11:00:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'overture-hk-2026-06-23.0-address',
        releaseId: 'release-2',
        runId: 'run-2',
        cohortKey: '2026-06',
        source: 'overture',
        startedAt: '2026-06-23T10:00:00.000Z',
        stats: null,
        status: 'completed',
        type: 'address',
      },
      {
        datasetCode: 'hk-address',
        error: null,
        finishedAt: '2026-06-22T11:00:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'overture-hk-2026-06-22.0-address',
        releaseId: 'release-3',
        runId: 'run-3',
        cohortKey: '2026-06',
        source: 'overture',
        startedAt: '2026-06-22T10:00:00.000Z',
        stats: null,
        status: 'completed',
        type: 'address',
      },
      {
        datasetCode: 'hk-address',
        error: null,
        finishedAt: null,
        phase: 'loadCanonical',
        releaseCode: 'hkgov-als-hk-2026-06-24.0-address',
        releaseId: 'release-4',
        runId: 'run-4',
        cohortKey: '2026-06',
        source: 'hkgov-als',
        startedAt: '2026-06-24T09:00:00.000Z',
        stats: null,
        status: 'queued',
        type: 'address',
      },
    ]

    expect(filterIngestionRows(rows).map(row => row.releaseCode)).toEqual([
      'overture-hk-2026-06-24.0-address',
      'overture-hk-2026-06-23.0-address',
      'hkgov-als-hk-2026-06-24.0-address',
    ])
  })
})

describe('formatReleaseReportTable', () => {
  test('renders source and history counts separately', () => {
    const rows: ReleaseReportRow[] = [
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'hk-address',
        datasetId: 'dataset-1',
        ingestedAt: '2026-06-24T12:00:00.000Z',
        originalFileName: 'address.parquet',
        publicationDate: null,
        rawObjectKey: 'hk/overture/2026-06-24.0/address.parquet',
        releaseCode: 'overture-hk-2026-06-24.0-address',
        releaseId: 'release-1',
        revocationReason: null,
        revokedAt: null,
        rowCounts: [
          {
            kind: 'source',
            label: 'source',
            rowCount: 2,
            tableName: 'sourceOvertureAddresses2d',
          },
          {
            kind: 'history',
            label: 'history2dVersions',
            rowCount: 4,
            tableName: 'address2dVersions',
          },
        ],
        cohortKey: '2026-06',
        source: 'overture',
        sourceVersion: '2026-06-24.0',
        status: 'published',
        supersededByReleaseId: null,
        type: 'address',
        updatedAt: '2026-06-24T12:00:00.000Z',
      },
    ]

    const table = formatReleaseReportTable(rows)

    expect(table).toContain('sourceCount')
    expect(table).toContain('history2dVersionsCount')
    expect(table).toContain('  2            4')
  })
})

describe('formatIngestionReportTable', () => {
  test('omits durationMs from expanded stats rows', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'hk-address',
        error: null,
        finishedAt: '2026-06-24T10:05:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'overture-hk-2026-06-24.0-address',
        releaseId: 'release-1',
        runId: 'run-1',
        cohortKey: '2026-06',
        source: 'overture',
        startedAt: '2026-06-24T10:00:00.000Z',
        stats: {
          durationMs: 300000,
          inserted: 12,
        },
        status: 'completed',
        type: 'address',
      },
    ]

    const table = formatIngestionReportTable(rows)

    expect(table).toContain('inserted')
    expect(table).not.toContain('durationMs')
  })
})

describe('formatStatsReportTable', () => {
  test('splits metrics into separate tables, groups by release, and orders count columns before percentage columns', () => {
    const rows: StatReportRow[] = [
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'hk-division',
        dimension: 'locale_count',
        groupBy: null,
        groupValue: null,
        id: '1',
        metric: 'completeness',
        metricUnit: 'count',
        releaseCode: 'overture-hk-2026-06-24.0-division',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 2,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'hk-division',
        dimension: 'locale_coverage',
        groupBy: null,
        groupValue: null,
        id: '2',
        metric: 'completeness',
        metricUnit: 'percentage',
        releaseCode: 'overture-hk-2026-06-24.0-division',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 66.6,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'hk-division',
        dimension: 'count',
        groupBy: 'type',
        groupValue: 'district',
        id: '3',
        metric: 'churn',
        metricUnit: 'count',
        releaseCode: 'overture-hk-2026-06-24.0-division',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 4,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'hk-division',
        dimension: 'name_regression_count',
        groupBy: null,
        groupValue: null,
        id: '4',
        metric: 'quality',
        metricUnit: 'count',
        releaseCode: 'overture-hk-2026-06-24.0-division',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 1,
      },
      {
        createdAt: '2026-06-23T12:00:00.000Z',
        datasetCode: 'hk-division',
        dimension: 'count',
        groupBy: 'type',
        groupValue: 'district',
        id: '5',
        metric: 'churn',
        metricUnit: 'count',
        releaseCode: 'overture-hk-2026-06-23.0-division',
        releaseId: 'release-2',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-23T12:00:00.000Z',
        value: 7,
      },
    ]

    const table = formatStatsReportTable(rows)

    expect(table).toContain('release: overture-hk-2026-06-24.0-division')
    expect(table).toContain('release: overture-hk-2026-06-23.0-division')
    expect(table).toContain('\n\ncompleteness\n')
    expect(table).toContain('\n\nchurn\n')
    expect(table).toContain('\n\nquality\n')
    expect(table).toContain('group  locale_count')
    expect(table).toContain('locale_coverage')
  })
})
