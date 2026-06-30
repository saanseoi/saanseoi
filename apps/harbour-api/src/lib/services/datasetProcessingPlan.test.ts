import { describe, expect, mock, test } from 'bun:test'

import type { DatasetProcessingMessage } from '@repo/core'
import {
  enqueueDatasetProcessingPlan,
  type DatasetProcessingQueue,
} from './datasetProcessingPlan'

const addressMessage: DatasetProcessingMessage = {
  datasetId: 'overture-hk-address',
  releaseCode: 'overture-hk-2025-09-24.0-address',
  releaseId: 'release-address',
  rawObjectKey: 'hk/overture/2025-09-24.0/address.parquet',
  regionCode: 'hk',
  shardYear: '2025',
  cohortKey: '2025-09',
  source: 'overture',
  sourceVersion: '2025-09-24.0',
  theme: 'addresses',
  type: 'address',
}

describe('enqueueDatasetProcessingPlan', () => {
  test('can force preplanned address chunks through serial sends even when sendBatch exists', async () => {
    const sentMessages: DatasetProcessingMessage[] = []
    const send = mock(async message => {
      sentMessages.push(message as DatasetProcessingMessage)
    })
    const sendBatch = mock(async () => undefined)
    const queue: DatasetProcessingQueue = {
      send,
      sendBatch,
    }

    await enqueueDatasetProcessingPlan(queue, addressMessage, 2050, {
      forceSerialAddressEnqueue: true,
    })

    expect(sendBatch).toHaveBeenCalledTimes(0)
    expect(send).toHaveBeenCalledTimes(3)
    expect(sentMessages.map(message => [message.rowStart, message.rowEnd])).toEqual([
      [0, 1024],
      [1024, 2048],
      [2048, 2050],
    ])
  })

  test('can use address continuation mode to enqueue only the first chunk', async () => {
    const sentMessages: DatasetProcessingMessage[] = []
    const send = mock(async message => {
      sentMessages.push(message as DatasetProcessingMessage)
    })
    const sendBatch = mock(async () => undefined)
    const queue: DatasetProcessingQueue = {
      send,
      sendBatch,
    }

    await enqueueDatasetProcessingPlan(queue, addressMessage, 2050, {
      useAddressContinuation: true,
    })

    expect(sendBatch).toHaveBeenCalledTimes(0)
    expect(send).toHaveBeenCalledTimes(1)
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]).toEqual(
      expect.objectContaining({
        addressStage: 'normalize',
        rowEnd: 1024,
        rowStart: 0,
        totalRows: 2050,
      }),
    )
    expect(sentMessages[0]?.preplannedAddressChunks).toBeUndefined()
  })
})
