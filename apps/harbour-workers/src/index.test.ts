import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { DatasetProcessingMessage } from '@repo/core'
import { createQueueHandler } from './index'

const originalConsoleError = console.error

beforeEach(() => {
  console.error = mock(() => undefined) as typeof console.error
})

afterEach(() => {
  console.error = originalConsoleError
})

describe('harbour-workers', () => {
  test('acks successful dataset messages', async () => {
    const processDatasetMessageMock = mock(async () => ({
      deletedRows: 0,
      insertedVersions: 1,
      localizedRows: 1,
      processedRows: 1,
      unchangedRows: 0,
    }))
    const ack = mock(() => undefined)
    const retry = mock(() => undefined)
    const queue = createQueueHandler(processDatasetMessageMock as never)

    await queue(
      {
        messages: [
          {
            ack,
            attempts: 1,
            body: {
              datasetId: 'overture-hk-2025-05-24.0-division',
              rawObjectKey: 'hk/overture/2025-05-24.0/division.parquet',
              regionCode: 'hk',
              shardYear: '2025',
              cohortKey: '2025-05',
              source: 'overture',
              sourceVersion: '2025-05-24.0',
              theme: 'divisions',
              type: 'division',
            },
            id: 'message-1',
            retry,
            timestamp: new Date(),
          },
        ],
        metadata: {
          queueBroker: 'test',
        },
        queue: 'ss-harbour-jobs-preview',
        ackAll() {},
        retryAll() {},
      } as unknown as MessageBatch<DatasetProcessingMessage>,
      {
        DB_CURRENT: {} as D1Database,
        DB_HISTORY_HK_2025: {} as D1Database,
        DB_META: {} as D1Database,
        DB_SOURCE_HK_2025: {} as D1Database,
        HARBOUR_API_KEY: 'test-key',
        HARBOUR_BASE_URL: 'http://localhost:8788',
        R2_RAW: {} as R2Bucket,
      },
    )

    expect(processDatasetMessageMock).toHaveBeenCalledTimes(1)
    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledTimes(0)
  })

  test('retries shard-resolution failures and continues processing later messages', async () => {
    const processDatasetMessageMock = mock(async () => ({
      deletedRows: 0,
      insertedVersions: 1,
      localizedRows: 1,
      processedRows: 1,
      unchangedRows: 0,
    }))
    const firstAck = mock(() => undefined)
    const firstRetry = mock(() => undefined)
    const secondAck = mock(() => undefined)
    const secondRetry = mock(() => undefined)
    const queue = createQueueHandler(processDatasetMessageMock as never)

    await queue(
      {
        messages: [
          {
            ack: firstAck,
            attempts: 1,
            body: {
              datasetId: 'broken-dataset',
              rawObjectKey: 'hk/overture/invalid/division.parquet',
              regionCode: 'hk',
              cohortKey: '',
              source: 'overture',
              sourceVersion: '2025-05-24.0',
              theme: 'divisions',
              type: 'division',
            },
            id: 'message-1',
            retry: firstRetry,
            timestamp: new Date(),
          },
          {
            ack: secondAck,
            attempts: 1,
            body: {
              datasetId: 'overture-hk-2025-05-24.0-division',
              rawObjectKey: 'hk/overture/2025-05-24.0/division.parquet',
              regionCode: 'hk',
              shardYear: '2025',
              cohortKey: '2025-05',
              source: 'overture',
              sourceVersion: '2025-05-24.0',
              theme: 'divisions',
              type: 'division',
            },
            id: 'message-2',
            retry: secondRetry,
            timestamp: new Date(),
          },
        ],
        metadata: {
          queueBroker: 'test',
        },
        queue: 'ss-harbour-jobs-preview',
        ackAll() {},
        retryAll() {},
      } as unknown as MessageBatch<DatasetProcessingMessage>,
      {
        DB_CURRENT: {} as D1Database,
        DB_HISTORY_HK_2025: {} as D1Database,
        DB_META: {} as D1Database,
        DB_SOURCE_HK_2025: {} as D1Database,
        HARBOUR_API_KEY: 'test-key',
        HARBOUR_BASE_URL: 'http://localhost:8788',
        R2_RAW: {} as R2Bucket,
      },
    )

    expect(processDatasetMessageMock).toHaveBeenCalledTimes(1)
    expect(firstAck).toHaveBeenCalledTimes(0)
    expect(firstRetry).toHaveBeenCalledTimes(1)
    expect(secondAck).toHaveBeenCalledTimes(1)
    expect(secondRetry).toHaveBeenCalledTimes(0)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  test('enqueues the next chunk before acking chunked dataset messages', async () => {
    const nextMessage: DatasetProcessingMessage = {
      datasetId: 'overture-hk-2025-10-22.0-address',
      rawObjectKey: 'hk/overture/2025-10-22.0/address.parquet',
      regionCode: 'hk',
      shardYear: '2025',
      cohortKey: '2025-10',
      source: 'overture',
      sourceVersion: '2025-10-22.0',
      theme: 'addresses',
      type: 'address',
      rowStart: 1024,
      rowEnd: 2048,
      totalRows: 4096,
      processingRunStartedAt: '2026-06-30T18:00:00.000Z',
    }
    const processDatasetMessageMock = mock(async () => ({
      deletedRows: 0,
      insertedVersions: 1,
      localizedRows: 1,
      nextMessage,
      processedRows: 1024,
      unchangedRows: 0,
    }))
    const calls: string[] = []
    const ack = mock(() => {
      calls.push('ack')
    })
    const retry = mock(() => undefined)
    const send = mock(async () => {
      calls.push('send')
    })
    const queue = createQueueHandler(processDatasetMessageMock as never)

    await queue(
      {
        messages: [
          {
            ack,
            attempts: 1,
            body: {
              datasetId: 'overture-hk-2025-10-22.0-address',
              rawObjectKey: 'hk/overture/2025-10-22.0/address.parquet',
              regionCode: 'hk',
              shardYear: '2025',
              cohortKey: '2025-10',
              source: 'overture',
              sourceVersion: '2025-10-22.0',
              theme: 'addresses',
              type: 'address',
            },
            id: 'message-1',
            retry,
            timestamp: new Date(),
          },
        ],
        metadata: {
          queueBroker: 'test',
        },
        queue: 'ss-harbour-jobs-preview',
        ackAll() {},
        retryAll() {},
      } as unknown as MessageBatch<DatasetProcessingMessage>,
      {
        DB_CURRENT: {} as D1Database,
        DB_HISTORY_HK_2025: {} as D1Database,
        DB_META: {} as D1Database,
        DB_SOURCE_HK_2025: {} as D1Database,
        HARBOUR_API_KEY: 'test-key',
        HARBOUR_BASE_URL: 'http://localhost:8788',
        JOB_QUEUE: { send } as unknown as Queue,
        R2_RAW: {} as R2Bucket,
      },
    )

    expect(send).toHaveBeenCalledWith(nextMessage)
    expect(calls).toEqual(['send', 'ack'])
    expect(retry).toHaveBeenCalledTimes(0)
  })
})
