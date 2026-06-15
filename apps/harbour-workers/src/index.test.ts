import { describe, expect, mock, test } from 'bun:test'

import type { DatasetProcessingMessage } from '@repo/core'
import { createQueueHandler } from './index'

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
              snapshotMonth: '2025-05',
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
})
