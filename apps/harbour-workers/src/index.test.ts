import { expect, test } from 'bun:test'
import type { SnapshotCleanupMessage } from '@repo/core'

import { createQueueHandler } from './index'

test('requires both D1 bindings for the snapshot-cleanup consumer', async () => {
  const queue = createQueueHandler()

  await expect(
    queue(
      {
        messages: [],
        metadata: { queueBroker: 'test' },
        queue: 'ss-harbour-jobs-preview',
        ackAll() {},
        retryAll() {},
      } as unknown as MessageBatch<SnapshotCleanupMessage>,
      { DB_CURRENT: {} as D1Database },
    ),
  ).rejects.toThrow('Missing DB_META binding')
})
