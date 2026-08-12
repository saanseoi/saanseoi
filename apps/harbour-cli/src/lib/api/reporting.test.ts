import { afterEach, describe, expect, test } from 'bun:test'

import {
  filterIngestionRows,
  formatIngestionReportTable,
  formatReleaseReportTable,
  formatStatsReportTable,
} from '../cli/display.ts'
import type {
  IngestRunReportRow,
  ReleaseReportRow,
  StatReportRow,
} from './reporting.ts'
import { fetchReleaseReport } from './reporting.ts'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.HARBOUR_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalApiKey == null) {
    delete process.env.HARBOUR_API_KEY
  } else {
    process.env.HARBOUR_API_KEY = originalApiKey
  }
})

describe('reporting client', () => {
  test('retries transient local D1 release-report failures', async () => {
    let calls = 0
    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return calls === 1
        ? Response.json(
            { message: 'internal error; reference = local-d1-lock' },
            { status: 400 },
          )
        : Response.json({ rows: [] })
    }) as unknown as typeof fetch

    await expect(
      fetchReleaseReport(
        { environment: 'dev', remote: false },
        { datasetCode: 'ds-hk-overture-division' },
      ),
    ).resolves.toEqual({ rows: [] })
    expect(calls).toBe(2)
  })

  test('does not retry non-transient release-report failures', async () => {
    let calls = 0
    process.env.HARBOUR_API_KEY = 'test-api-key'
    globalThis.fetch = (async () => {
      calls += 1
      return Response.json({ message: 'Invalid report query.' }, { status: 400 })
    }) as unknown as typeof fetch

    await expect(
      fetchReleaseReport(
        { environment: 'dev', remote: false },
        { datasetCode: 'ds-hk-overture-division' },
      ),
    ).rejects.toThrow('Invalid report query.')
    expect(calls).toBe(1)
  })
})

describe('filterIngestionRows', () => {
  test('keeps all ongoing releases plus the latest finished release', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: null,
        phase: 'extractAddresses',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        runId: 'run-1',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T10:00:00.000Z',
        stats: null,
        status: 'running',
        type: 'address',
      },
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: '2026-06-23T11:00:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-23.0',
        releaseId: 'release-2',
        runId: 'run-2',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-23T10:00:00.000Z',
        stats: null,
        status: 'completed',
        type: 'address',
      },
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: '2026-06-22T11:00:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-22.0',
        releaseId: 'release-3',
        runId: 'run-3',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-22T10:00:00.000Z',
        stats: null,
        status: 'completed',
        type: 'address',
      },
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: null,
        phase: 'loadCanonical',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-4',
        runId: 'run-4',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T09:00:00.000Z',
        stats: null,
        status: 'queued',
        type: 'address',
      },
    ]

    expect(filterIngestionRows(rows).map(row => row.releaseCode)).toEqual([
      'dr-hk-hkgov-dpo-address-2026-06-24.0',
      'dr-hk-hkgov-dpo-address-2026-06-24.0',
      'dr-hk-hkgov-dpo-address-2026-06-23.0',
    ])
  })
})

describe('formatReleaseReportTable', () => {
  test('renders source and history counts separately', () => {
    const rows: ReleaseReportRow[] = [
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'ds-hk-hkgov-dpo-address',
        datasetId: 'dataset-1',
        ingestedAt: '2026-06-24T12:00:00.000Z',
        notes: null,
        originalFileName: 'address.parquet',
        publicationDate: null,
        rawObjectKey: 'hk/hkgov-dpo/2026-06-24.0/address.parquet',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        revocationReason: null,
        revokedAt: null,
        rowCounts: [
          {
            kind: 'source',
            label: 'source',
            rowCount: 2,
            tableName: 'hkgovAlsAddresses2d',
          },
          {
            kind: 'history',
            label: 'resourceType',
            rowCount: 4,
            tableName: 'address2d',
          },
        ],
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        sourceVersion: '2026-06-24.0',
        status: 'published',
        supersededByReleaseId: null,
        type: 'address',
        updatedAt: '2026-06-24T12:00:00.000Z',
      },
    ]

    const table = formatReleaseReportTable(rows)

    expect(table).toContain('sourceCount')
    expect(table).toContain('resourceTypeCount')
    expect(table).toContain('  2            4')
  })
})

describe('formatIngestionReportTable', () => {
  test('omits non-display ingestion stats from expanded stats rows', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: '2026-06-24T10:05:00.000Z',
        phase: 'extractAddresses',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        runId: 'run-1',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T10:00:00.000Z',
        stats: {
          addressStage: 'sql-current',
          durationMs: 300000,
          inserted: 12,
          rowEnd: 2048,
          rowStart: 1024,
          sqlArtefactCount: 4,
        },
        status: 'completed',
        type: 'address',
      },
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: '2026-06-24T10:00:00.000Z',
        phase: 'stageDataset',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        runId: 'run-2',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T09:59:00.000Z',
        stats: {
          rawObjectKey: 'hk/hkgov-dpo/2026-06-24.0/address.parquet',
          rowCount: 182155,
          schemaFieldCount: 14,
        },
        status: 'completed',
        type: 'address',
      },
    ]

    const table = formatIngestionReportTable(rows)

    expect(table).toContain('inserted')
    expect(table).toContain('rowCount')
    expect(table).not.toContain('durationMs')
    expect(table).not.toContain('addressStage')
    expect(table).not.toContain('rowEnd')
    expect(table).not.toContain('rowStart')
    expect(table).not.toContain('sqlArtefactCount')
    expect(table).not.toContain('rawObjectKey')
    expect(table).not.toContain('schemaFieldCount')
  })

  test('renders SQL import stats compactly and hides SQL umbrella phases', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: null,
        phase: 'importAddressSqlSource',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        runId: 'run-import',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T10:05:00.000Z',
        stats: {
          bytes: 220123419,
          fileCount: 178,
          importedFiles: ['processed/release/source-1.sql'],
          processedFiles: 140,
          processedStatements: 4250,
          statementCount: 5389,
          target: 'source',
          totalFiles: 178,
        },
        status: 'running',
        type: 'address',
      },
      {
        datasetCode: 'ds-hk-hkgov-dpo-address',
        error: null,
        finishedAt: null,
        phase: 'extractAddresses',
        releaseCode: 'dr-hk-hkgov-dpo-address-2026-06-24.0',
        releaseId: 'release-1',
        runId: 'run-extract',
        cohortKey: '2026-06',
        source: 'hkgov-dpo',
        startedAt: '2026-06-24T10:00:00.000Z',
        stats: null,
        status: 'running',
        type: 'address',
      },
    ]

    const table = formatIngestionReportTable(rows)

    expect(table).toContain('importAddressSqlSource')
    expect(table).toContain('209.9 MB')
    expect(table).toContain('statementCount')
    expect(table).not.toContain('extractAddresses')
    expect(table).not.toContain('fileCount')
    expect(table).not.toContain('importedFiles')
    expect(table).not.toContain('processedFiles')
    expect(table).not.toContain('processedStatements')
    expect(table).not.toContain('target')
    expect(table).not.toContain('totalFiles')
  })
})

describe('formatStatsReportTable', () => {
  test('splits metrics into separate tables, groups by release, and orders count columns before percentage columns', () => {
    const rows: StatReportRow[] = [
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'ds-hk-overture-division',
        dimension: 'locale_count',
        groupBy: null,
        groupValue: null,
        id: '1',
        metric: 'completeness',
        metricUnit: 'count',
        releaseCode: 'dr-hk-overture-division-2026-06-24.0',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 2,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'ds-hk-overture-division',
        dimension: 'locale_coverage',
        groupBy: null,
        groupValue: null,
        id: '2',
        metric: 'completeness',
        metricUnit: 'percentage',
        releaseCode: 'dr-hk-overture-division-2026-06-24.0',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 66.6,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'ds-hk-overture-division',
        dimension: 'count',
        groupBy: 'type',
        groupValue: 'district',
        id: '3',
        metric: 'churn',
        metricUnit: 'count',
        releaseCode: 'dr-hk-overture-division-2026-06-24.0',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 4,
      },
      {
        createdAt: '2026-06-24T12:00:00.000Z',
        datasetCode: 'ds-hk-overture-division',
        dimension: 'name_regression_count',
        groupBy: null,
        groupValue: null,
        id: '4',
        metric: 'quality',
        metricUnit: 'count',
        releaseCode: 'dr-hk-overture-division-2026-06-24.0',
        releaseId: 'release-1',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-24T12:00:00.000Z',
        value: 1,
      },
      {
        createdAt: '2026-06-23T12:00:00.000Z',
        datasetCode: 'ds-hk-overture-division',
        dimension: 'count',
        groupBy: 'type',
        groupValue: 'district',
        id: '5',
        metric: 'churn',
        metricUnit: 'count',
        releaseCode: 'dr-hk-overture-division-2026-06-23.0',
        releaseId: 'release-2',
        source: 'overture',
        type: 'division',
        updatedAt: '2026-06-23T12:00:00.000Z',
        value: 7,
      },
    ]

    const table = formatStatsReportTable(rows)

    expect(table).toContain('release: dr-hk-overture-division-2026-06-24.0')
    expect(table).toContain('release: dr-hk-overture-division-2026-06-23.0')
    expect(table).toContain('\n\ncompleteness\n')
    expect(table).toContain('\n\nchurn\n')
    expect(table).toContain('\n\nquality\n')
    expect(table).toContain('group  locale_count')
    expect(table).toContain('locale_coverage')
  })
})
