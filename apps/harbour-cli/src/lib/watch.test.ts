import { describe, expect, test } from 'bun:test'

import type { IngestRunReportRow, ReleaseReportRow } from './reporting.ts'
import {
  findProcessingRelease,
  getReleaseRowCount,
  getStageDatasetRowCount,
  isReleaseStillProcessing,
} from './watch.ts'

const processingRelease: ReleaseReportRow = {
  createdAt: '2026-06-27T07:18:22.000Z',
  datasetCode: 'hk-division',
  datasetId: 'dataset-1',
  ingestedAt: '2026-06-27T07:18:22.000Z',
  originalFileName: 'division.parquet',
  publicationDate: null,
  rawObjectKey: 'hk/overture/2025-12-17.0/division.parquet',
  releaseCode: 'overture-hk-2025-12-17.0-division',
  releaseId: 'release-1',
  revocationReason: null,
  revokedAt: null,
  rowCounts: [
    {
      kind: 'source',
      label: 'source',
      rowCount: 640,
      tableName: 'sourceOvertureDivisions',
    },
    {
      kind: 'history',
      label: 'historyVersions',
      rowCount: 25,
      tableName: 'divisionVersions',
    },
  ],
  snapshotMonth: '2025-12',
  source: 'overture',
  sourceVersion: '2025-12-17.0',
  status: 'processing',
  supersededByReleaseId: null,
  type: 'division',
  updatedAt: '2026-06-27T07:18:22.000Z',
}

describe('watch helpers', () => {
  test('selects the first release currently in processing', () => {
    const publishedRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2025-10-22.0-division',
      releaseId: 'release-2',
      status: 'published',
    }

    expect(findProcessingRelease([publishedRelease, processingRelease])).toEqual(
      processingRelease,
    )
  })

  test('reads sourceCount from release row counts', () => {
    expect(getReleaseRowCount(processingRelease, 'source')).toBe(640)
    expect(getReleaseRowCount(processingRelease, 'sourceI18n')).toBe(0)
  })

  test('keeps watching the current release even when another release is also processing', () => {
    const newerProcessingRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2026-01-21.0-division',
      releaseId: 'release-2',
      sourceVersion: '2026-01-21.0',
      updatedAt: '2026-06-27T08:22:29.000Z',
    }

    expect(
      isReleaseStillProcessing(
        [newerProcessingRelease, processingRelease],
        processingRelease.releaseId,
      ),
    ).toBe(true)
  })

  test('extracts the staged parquet rowCount from ingest stats', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'hk-division',
        error: null,
        finishedAt: '2026-06-27T07:18:25.000Z',
        phase: 'stageDataset',
        releaseCode: processingRelease.releaseCode,
        releaseId: processingRelease.releaseId,
        runId: 'run-1',
        snapshotMonth: '2025-12',
        source: 'overture',
        startedAt: '2026-06-27T07:18:25.000Z',
        stats: {
          rawObjectKey: 'hk/overture/2025-12-17.0/division.parquet',
          rowCount: 1812,
          schemaFieldCount: 22,
        },
        status: 'completed',
        type: 'division',
      },
    ]

    expect(getStageDatasetRowCount(rows, processingRelease.releaseId)).toBe(1812)
  })
})
