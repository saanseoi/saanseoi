import {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  createSourceDb,
  type MultiDbBindings,
} from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourJobMessage, SnapshotCleanupMessage } from '@repo/core'

import { createHarbourClient } from './lib/harbourClient'
import { withPrimarySession } from './lib/d1'
import { processDatasetMessage } from './lib/worker'
import { cleanupCurrentSnapshots } from './lib/services/snapshot-cleanup'

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

function toBindingYear(cohortKey: string) {
  const [year] = cohortKey.split('-')

  if (!year) {
    throw new Error(`Invalid cohortKey for shard resolution: ${cohortKey}`)
  }

  return year
}

function resolveShardBinding(
  env: Partial<MultiDbBindings>,
  kind: 'HISTORY' | 'SOURCE',
  regionCode: string,
  shardYear: string | undefined,
  cohortKey: string,
) {
  const normalizedShardYear = shardYear?.trim()
  const resolvedYear =
    normalizedShardYear && normalizedShardYear.length > 0
      ? normalizedShardYear
      : toBindingYear(cohortKey)
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
  message: Message<HarbourJobMessage>,
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
  return async (batch: MessageBatch<HarbourJobMessage>, env: Env) => {
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

        if (isSnapshotCleanupMessage(body)) {
          await cleanupCurrentSnapshots(metaDb, currentDb, body)
          message.ack()
          continue
        }

        if (!isDatasetProcessingMessage(body)) {
          throw new Error('Unsupported harbour job message.')
        }

        const historyShard = resolveShardBinding(
          env,
          'HISTORY',
          body.regionCode,
          body.shardYear,
          body.cohortKey,
        )
        const sourceShard = resolveShardBinding(
          env,
          'SOURCE',
          body.regionCode,
          body.shardYear,
          body.cohortKey,
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

function isSnapshotCleanupMessage(
  message: HarbourJobMessage,
): message is SnapshotCleanupMessage {
  return message.jobType === 'cleanupCurrentSnapshots'
}

function isDatasetProcessingMessage(
  message: HarbourJobMessage,
): message is DatasetProcessingMessage {
  return message.jobType === undefined || message.jobType === 'processDataset'
}

export default {
  queue: createQueueHandler(),
}
