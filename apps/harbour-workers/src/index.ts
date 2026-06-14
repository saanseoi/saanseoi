import {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
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

function toBindingRegion(regionCode: string) {
  return regionCode.toUpperCase()
}

function toBindingYear(snapshotMonth: string) {
  const [year] = snapshotMonth.split('-')

  if (!year) {
    throw new Error(`Invalid snapshotMonth for shard resolution: ${snapshotMonth}`)
  }

  return year
}

function resolveShardBinding(
  env: Partial<MultiDbBindings>,
  kind: 'HISTORY' | 'SOURCE',
  regionCode: string,
  shardYear: string | undefined,
  snapshotMonth: string,
) {
  const bindingName =
    `DB_${kind}_${toBindingRegion(regionCode)}_${shardYear ?? toBindingYear(snapshotMonth)}` as keyof MultiDbBindings

  return {
    bindingName,
    binding: env[bindingName],
  }
}

export function createQueueHandler(
  processDataset: ProcessDatasetMessageHandler = processDatasetMessage,
) {
  return async (batch: MessageBatch<DatasetProcessingMessage>, env: Env) => {
    const currentBinding = env.DB_CURRENT ?? env.DB
    const metaBinding = env.DB_META

    if (!currentBinding) {
      throw new Error('Missing DB_CURRENT binding for harbour-workers.')
    }
    if (!metaBinding) {
      throw new Error('Missing DB_META binding for harbour-workers.')
    }

    const metaDb = createMetaDb(metaBinding)
    const currentDb = createCurrentDb(currentBinding)
    const harbourClient = createHarbourClient({
      apiKey: env.HARBOUR_API_KEY,
      baseUrl: env.HARBOUR_BASE_URL,
    })

    for (const message of batch.messages) {
      try {
        const { bindingName: historyBindingName, binding: historyBinding } =
          resolveShardBinding(
            env,
            'HISTORY',
            message.body.regionCode,
            message.body.shardYear,
            message.body.snapshotMonth,
          )

        if (!historyBinding) {
          throw new Error(
            `Missing ${String(historyBindingName)} binding for harbour-workers.`,
          )
        }

        const { binding: sourceBinding } = resolveShardBinding(
          env,
          'SOURCE',
          message.body.regionCode,
          message.body.shardYear,
          message.body.snapshotMonth,
        )

        await processDataset(
          harbourClient,
          metaDb,
          currentDb,
          createHistoryDb(historyBinding),
          env.R2_RAW,
          message.body,
          sourceBinding ? createSourceDb(sourceBinding) : undefined,
        )
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
