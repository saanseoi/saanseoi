import { describe, expect, mock, test } from 'bun:test'

import type { UploadTarget } from './options.ts'
import type { IngestRunReportRow, ReleaseReportRow } from './reporting.ts'
import {
  createWatchCurrentUpload,
  findProcessingRelease,
  getProcessedDatasetRowCount,
  getReleaseRowCount,
  getStageDatasetRowCount,
  isReleaseStillProcessing,
} from './watch.ts'

const target = {
  environment: 'dev',
  remote: false,
} satisfies UploadTarget

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

function createRelease(
  releaseCode: string,
  releaseId: string,
  status: string,
  rowCount: number,
): ReleaseReportRow {
  return {
    ...processingRelease,
    releaseCode,
    releaseId,
    rowCounts: [
      {
        kind: 'source',
        label: 'source',
        rowCount,
        tableName: 'sourceOvertureDivisions',
      },
    ],
    sourceVersion: releaseCode.split('-').slice(2, -1).join('-'),
    status,
  }
}

describe('watch helpers', () => {
  test('prefers the running processing release over newer staged releases', () => {
    const publishedRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2025-10-22.0-division',
      releaseId: 'release-2',
      status: 'published',
    }
    const stagedRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2025-11-19.0-division',
      releaseId: 'release-3',
      status: 'staged',
    }

    expect(
      findProcessingRelease([publishedRelease, stagedRelease, processingRelease]),
    ).toEqual(processingRelease)
  })

  test('falls back to the oldest staged release when nothing is processing yet', () => {
    const newerStagedRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2026-06-17.0-division',
      releaseId: 'release-4',
      status: 'staged',
    }
    const olderStagedRelease: ReleaseReportRow = {
      ...processingRelease,
      releaseCode: 'overture-hk-2026-05-20.0-division',
      releaseId: 'release-3',
      status: 'staged',
    }

    expect(findProcessingRelease([newerStagedRelease, olderStagedRelease])).toEqual(
      olderStagedRelease,
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

  test('treats staged releases as active while waiting for processing to begin', () => {
    expect(
      isReleaseStillProcessing(
        [{ ...processingRelease, status: 'staged' }],
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

  test('extracts the running processedRows from ingest stats', () => {
    const rows: IngestRunReportRow[] = [
      {
        datasetCode: 'hk-division',
        error: null,
        finishedAt: null,
        phase: 'extractDivisions',
        releaseCode: processingRelease.releaseCode,
        releaseId: processingRelease.releaseId,
        runId: 'run-1',
        snapshotMonth: '2025-12',
        source: 'overture',
        startedAt: '2026-06-27T07:18:25.000Z',
        stats: {
          processedRows: 512,
        },
        status: 'running',
        type: 'division',
      },
      {
        datasetCode: 'hk-division',
        error: null,
        finishedAt: null,
        phase: 'extractDivisionsI18n',
        releaseCode: processingRelease.releaseCode,
        releaseId: processingRelease.releaseId,
        runId: 'run-2',
        snapshotMonth: '2025-12',
        source: 'overture',
        startedAt: '2026-06-27T07:18:25.000Z',
        stats: {
          localizedRows: 1024,
        },
        status: 'running',
        type: 'division',
      },
    ]

    expect(getProcessedDatasetRowCount(rows, processingRelease.releaseId)).toBe(512)
  })
})

describe('watchCurrentUpload', () => {
  test('tracks the processing release and ignores old completed history', async () => {
    const processingBacklogRelease = createRelease(
      'overture-hk-2026-01-21.0-division',
      'release-1',
      'processing',
      0,
    )
    const stagedBacklogRelease = createRelease(
      'overture-hk-2026-02-18.0-division',
      'release-2',
      'staged',
      0,
    )
    const newerStagedRelease = createRelease(
      'overture-hk-2026-06-17.0-division',
      'release-3',
      'staged',
      0,
    )
    const oldCompletedRelease = createRelease(
      'overture-hk-2025-12-17.0-division',
      'release-old',
      'published',
      1812,
    )
    const completedProcessingBacklogRelease = createRelease(
      'overture-hk-2026-01-21.0-division',
      'release-1',
      'published',
      1817,
    )
    const processingStagedBacklogRelease = createRelease(
      'overture-hk-2026-02-18.0-division',
      'release-2',
      'processing',
      1665,
    )
    const completedStagedBacklogRelease = createRelease(
      'overture-hk-2026-02-18.0-division',
      'release-2',
      'published',
      1818,
    )

    let listFetchCount = 0
    const fetchReleaseReport = mock(async (_target: UploadTarget) => {
      listFetchCount += 1

      switch (listFetchCount) {
        case 1:
          return {
            rows: [
              newerStagedRelease,
              stagedBacklogRelease,
              processingBacklogRelease,
              oldCompletedRelease,
            ],
          }
        case 2:
          return {
            rows: [
              newerStagedRelease,
              stagedBacklogRelease,
              completedProcessingBacklogRelease,
              oldCompletedRelease,
            ],
          }
        case 3:
          return {
            rows: [
              newerStagedRelease,
              processingStagedBacklogRelease,
              completedProcessingBacklogRelease,
              oldCompletedRelease,
            ],
          }
        case 4:
          return {
            rows: [
              newerStagedRelease,
              completedStagedBacklogRelease,
              completedProcessingBacklogRelease,
              oldCompletedRelease,
            ],
          }
        case 5:
        case 6:
        case 7:
          return {
            rows: [
              completedStagedBacklogRelease,
              completedProcessingBacklogRelease,
              oldCompletedRelease,
            ],
          }
        default:
          throw new Error(`Unexpected release report fetch #${listFetchCount}.`)
      }
    })

    const fetchIngestRunReport = mock(
      async (_target: UploadTarget, options?: { releaseId?: string }) => {
        if (options?.releaseId === 'release-1') {
          return {
            rows: [
              {
                datasetCode: 'hk-division',
                error: null,
                finishedAt: '2026-06-27T07:18:25.000Z',
                phase: 'stageDataset',
                releaseCode: processingBacklogRelease.releaseCode,
                releaseId: processingBacklogRelease.releaseId,
                runId: 'run-1',
                snapshotMonth: '2026-01',
                source: 'overture',
                startedAt: '2026-06-27T07:18:25.000Z',
                stats: {
                  rowCount: 1817,
                },
                status: 'completed',
                type: 'division',
              },
              {
                datasetCode: 'hk-division',
                error: null,
                finishedAt: null,
                phase: 'extractDivisions',
                releaseCode: processingBacklogRelease.releaseCode,
                releaseId: processingBacklogRelease.releaseId,
                runId: 'run-2',
                snapshotMonth: '2026-01',
                source: 'overture',
                startedAt: '2026-06-27T07:18:25.000Z',
                stats: {
                  processedRows: 1664,
                },
                status: 'running',
                type: 'division',
              },
            ],
          }
        }

        if (options?.releaseId === 'release-2') {
          return {
            rows: [
              {
                datasetCode: 'hk-division',
                error: null,
                finishedAt: '2026-06-27T07:18:25.000Z',
                phase: 'stageDataset',
                releaseCode: stagedBacklogRelease.releaseCode,
                releaseId: stagedBacklogRelease.releaseId,
                runId: 'run-3',
                snapshotMonth: '2026-02',
                source: 'overture',
                startedAt: '2026-06-27T07:18:25.000Z',
                stats: {
                  rowCount: 1818,
                },
                status: 'completed',
                type: 'division',
              },
              {
                datasetCode: 'hk-division',
                error: null,
                finishedAt: null,
                phase: 'extractDivisions',
                releaseCode: stagedBacklogRelease.releaseCode,
                releaseId: stagedBacklogRelease.releaseId,
                runId: 'run-4',
                snapshotMonth: '2026-02',
                source: 'overture',
                startedAt: '2026-06-27T07:18:25.000Z',
                stats: {
                  processedRows: 1665,
                },
                status: 'running',
                type: 'division',
              },
            ],
          }
        }

        throw new Error(`Unexpected ingest report fetch for ${options?.releaseId}.`)
      },
    )

    const progressEvents: Array<{
      max: number
      messages: string[]
      type: 'bar'
    }> = []
    const successMessages: string[] = []
    const failedMessages: string[] = []
    const watchCurrentUpload = createWatchCurrentUpload({
      createProgressBar(max) {
        const eventLog = {
          max,
          messages: [] as string[],
          type: 'bar' as const,
        }
        progressEvents.push(eventLog)

        return {
          advance(_delta: number, message?: string) {
            if (message) {
              eventLog.messages.push(`advance:${message}`)
            }
          },
          cancel(message?: string) {
            if (message) {
              eventLog.messages.push(`cancel:${message}`)
            }
          },
          clear() {},
          error(message?: string) {
            if (message) {
              eventLog.messages.push(`error:${message}`)
            }
          },
          isCancelled: false,
          message(message?: string) {
            if (message) {
              eventLog.messages.push(`message:${message}`)
            }
          },
          start(message?: string) {
            if (message) {
              eventLog.messages.push(`start:${message}`)
            }
          },
          stop(message?: string) {
            if (message) {
              eventLog.messages.push(`stop:${message}`)
            }
          },
        }
      },
      fetchIngestRunReport,
      fetchReleaseReport,
      reportFailed(message) {
        failedMessages.push(message)
      },
      reportSuccess(message) {
        successMessages.push(message)
      },
      sleep: async () => undefined,
    })

    const result = await watchCurrentUpload(target)

    expect(result).toEqual({ hadActivity: true })
    expect(progressEvents).toHaveLength(2)
    expect(progressEvents[0]?.max).toBe(1817)
    expect(progressEvents[0]?.messages).toEqual([
      'start:overture-hk-2026-01-21.0-division 1,664/1,817 source rows',
      'advance:overture-hk-2026-01-21.0-division 1,664/1,817 source rows',
      'stop:✓ overture-hk-2026-01-21.0-division (1,817)',
    ])
    expect(progressEvents[1]?.messages).toEqual([
      'start:overture-hk-2026-02-18.0-division 1,665/1,818 source rows',
      'advance:overture-hk-2026-02-18.0-division 1,665/1,818 source rows',
      'stop:✓ overture-hk-2026-02-18.0-division (1,818)',
    ])
    expect(successMessages).toEqual([])
    expect(failedMessages).toEqual([])
  })
})
