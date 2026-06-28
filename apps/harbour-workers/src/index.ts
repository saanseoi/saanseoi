import {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  createSourceDb,
  type MultiDbBindings,
} from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'

import { createHarbourClient } from './lib/harbourClient'
import { withPrimarySession } from './lib/d1'
import { processDatasetMessage } from './lib/worker'

type Env = Partial<MultiDbBindings> & {
  HARBOUR_API_KEY: string
  HARBOUR_BASE_URL: string
  R2_RAW: R2Bucket
}

type ProcessDatasetMessageHandler = typeof processDatasetMessage

type MessageErrorContext = {
  attempts: number
  datasetId?: string
  historyBindingName?: string
  releaseCode?: string
  releaseId?: string
  shardYear?: string
  sourceBindingName?: string
}

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
  const normalizedShardYear = shardYear?.trim()
  const resolvedYear =
    normalizedShardYear && normalizedShardYear.length > 0
      ? normalizedShardYear
      : toBindingYear(snapshotMonth)
  const bindingName =
    `DB_${kind}_${toBindingRegion(regionCode)}_${resolvedYear}` as keyof MultiDbBindings
  return {
    bindingName,
    binding: env[bindingName],
    resolvedYear,
  }
}

function readStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const property = (value as Record<string, unknown>)[key]

  return typeof property === 'string' ? property : undefined
}

function createMessageErrorContext(
  message: Message<DatasetProcessingMessage>,
): MessageErrorContext {
  return {
    attempts: message.attempts,
    datasetId: readStringProperty(message.body, 'datasetId'),
    releaseCode: readStringProperty(message.body, 'releaseCode'),
    releaseId: readStringProperty(message.body, 'releaseId'),
  }
}

export function createQueueHandler(
  processDataset: ProcessDatasetMessageHandler = processDatasetMessage,
) {
  return async (batch: MessageBatch<DatasetProcessingMessage>, env: Env) => {
    const currentBinding = env.DB_CURRENT
    const metaBinding = env.DB_META

    if (!currentBinding) {
      throw new Error('Missing DB_CURRENT binding for harbour-workers.')
    }
    if (!metaBinding) {
      throw new Error('Missing DB_META binding for harbour-workers.')
    }

    const metaDb = createMetaDb(withPrimarySession(metaBinding))
    const currentDb = createCurrentDb(withPrimarySession(currentBinding))
    const harbourClient = createHarbourClient({
      apiKey: env.HARBOUR_API_KEY,
      baseUrl: env.HARBOUR_BASE_URL,
    })

    for (const message of batch.messages) {
      const errorContext = createMessageErrorContext(message)

      try {
        const body = message.body
        const historyShard = resolveShardBinding(
          env,
          'HISTORY',
          body.regionCode,
          body.shardYear,
          body.snapshotMonth,
        )
        const sourceShard = resolveShardBinding(
          env,
          'SOURCE',
          body.regionCode,
          body.shardYear,
          body.snapshotMonth,
        )
        const { bindingName: historyBindingName, binding: historyBinding } =
          historyShard

        errorContext.historyBindingName = String(historyBindingName)
        errorContext.shardYear = historyShard.resolvedYear
        errorContext.sourceBindingName = String(sourceShard.bindingName)

        if (!historyBinding) {
          throw new Error(
            `Missing ${String(historyBindingName)} binding for harbour-workers.`,
          )
        }

        const { binding: sourceBinding } = sourceShard

        await processDataset(
          harbourClient,
          metaDb,
          currentDb,
          createHistoryDb(withPrimarySession(historyBinding)),
          env.R2_RAW,
          body,
          sourceBinding ? createSourceDb(withPrimarySession(sourceBinding)) : undefined,
        )
        message.ack()
      } catch (error) {
        console.error('harbour-workers dataset processing failed', {
          ...errorContext,
          cause:
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
          error: error instanceof Error ? error.message : String(error),
        })
        message.retry()
      }
    }
  }
}

export default {
  queue: createQueueHandler(),
}
