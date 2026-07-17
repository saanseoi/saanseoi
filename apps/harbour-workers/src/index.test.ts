import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { HarbourJobMessage } from '@repo/core'
import { createQueueHandler } from './index'

const originalConsoleWarn = console.warn

beforeEach(() => {
  console.warn = mock(() => undefined) as typeof console.warn
})

afterEach(() => {
  console.warn = originalConsoleWarn
})

describe('harbour-workers', () => {
  test('acks unsupported legacy dataset messages without retrying', async () => {
    const ack = mock(() => undefined)
    const retry = mock(() => undefined)
    const queue = createQueueHandler()

    await queue(
      {
        messages: [
          {
            ack,
            attempts: 1,
            body: {
              jobType: 'processDataset',
              datasetId: 'dr-hk-overture-division-2025-05-24.0',
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
      } as unknown as MessageBatch<HarbourJobMessage>,
      {
        DB_CURRENT: {} as D1Database,
        DB_META: {} as D1Database,
      },
    )

    expect(ack).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledTimes(0)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
