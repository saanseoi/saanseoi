import {
  createDb,
  createSourceDb,
  type LegacyDbBindings,
  type MultiDbBindings,
} from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'

import { createHarbourClient } from './lib/harbourClient'
import { processDatasetMessage } from './lib/worker'

type Env = Partial<LegacyDbBindings> &
  Partial<MultiDbBindings> & {
    HARBOUR_API_KEY: string
    HARBOUR_BASE_URL: string
    R2_RAW: R2Bucket
  }

type ProcessDatasetMessageHandler = typeof processDatasetMessage

export function createQueueHandler(
  processDataset: ProcessDatasetMessageHandler = processDatasetMessage,
) {
  return async (batch: MessageBatch<DatasetProcessingMessage>, env: Env) => {
    const currentBinding = env.DB_CURRENT ?? env.DB

    if (!currentBinding) {
      throw new Error('Missing DB_CURRENT binding for harbour-workers.')
    }

    const db = createDb(currentBinding)
    const sourceDb = env.DB_SOURCE_HK_2026
      ? createSourceDb(env.DB_SOURCE_HK_2026)
      : undefined
    const harbourClient = createHarbourClient({
      apiKey: env.HARBOUR_API_KEY,
      baseUrl: env.HARBOUR_BASE_URL,
    })

    for (const message of batch.messages) {
      try {
        await processDataset(harbourClient, db, env.R2_RAW, message.body, sourceDb)
        message.ack()
      } catch (error) {
        console.error('harbour-workers dataset processing failed', {
          datasetId: message.body.datasetId,
          releaseCode: message.body.releaseCode,
          releaseId: message.body.releaseId,
          cause:
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
          error: error instanceof Error ? error.message : String(error),
          attempts: message.attempts,
        })
        message.retry()
      }
    }
  }
}

export default {
  queue: createQueueHandler(),
}
