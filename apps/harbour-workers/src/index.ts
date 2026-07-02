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
import { cleanupCurrentSnapshots } from './lib/services/snapshotCleanup'
import {
  isAddressSqlImportOrCleanupStage,
  processAddressSqlImportOrCleanupStage,
} from './lib/services/addressPipeline/sqlImportStages'

type Env = Partial<MultiDbBindings> & {
  HARBOUR_API_KEY: string
  HARBOUR_BASE_URL: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_D1_TOKEN?: string
  D1_IMPORT_POLL_INTERVAL_MS?: string
  DATA_SHARD_ENV?: string
  JOB_QUEUE?: Queue<HarbourJobMessage>
  R2_RAW: R2Bucket
}

type ProcessDatasetMessageHandler = typeof processDatasetMessage

const LOCAL_INLINE_ADDRESS_DRAIN_LIMIT = 10_000

type MessageErrorContext = {
  attempts: number
  addressStage?: string
  artifactKey?: string
  datasetId?: string
  historyBindingName?: string
  releaseCode?: string
  releaseId?: string
  resolvedArtifactKey?: string
  rowEnd?: number
  rowStart?: number
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
    addressStage: readStringProperty(message.body, 'addressStage'),
    artifactKey: readStringProperty(message.body, 'artifactKey'),
    datasetId: readStringProperty(message.body, 'datasetId'),
    releaseCode: readStringProperty(message.body, 'releaseCode'),
    releaseId: readStringProperty(message.body, 'releaseId'),
    resolvedArtifactKey: readStringProperty(message.body, 'resolvedArtifactKey'),
    rowEnd: readNumberProperty(message.body, 'rowEnd'),
    rowStart: readNumberProperty(message.body, 'rowStart'),
  }
}

function readNumberProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const property = (value as Record<string, unknown>)[key]

  return typeof property === 'number' && Number.isFinite(property)
    ? property
    : undefined
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

        console.info(
          JSON.stringify({
            addressStage: readStringProperty(body, 'addressStage'),
            attempts: message.attempts,
            batchSize: batch.messages.length,
            datasetId: body.datasetId,
            messageId: message.id,
            phase: 'datasetQueueMessage',
            preplannedAddressChunks: Boolean(body.preplannedAddressChunks),
            releaseCode: body.releaseCode,
            releaseId: body.releaseId ?? body.datasetId,
            rowEnd: body.rowEnd,
            rowStart: body.rowStart,
            source: body.source,
            sourceVersion: body.sourceVersion,
            status: 'received',
            type: body.type,
          }),
        )

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

        const historyDb = createHistoryDb(withPrimarySession(historyBinding))
        const sourceDb = sourceBinding
          ? createSourceDb(withPrimarySession(sourceBinding))
          : undefined

        if (isAddressSqlImportOrCleanupStage(body)) {
          const nextMessage = await processAddressSqlImportOrCleanupStage(
            harbourClient,
            metaDb,
            env.R2_RAW,
            body,
            {
              accountId: env.CLOUDFLARE_ACCOUNT_ID,
              apiToken: env.CLOUDFLARE_D1_TOKEN,
              currentBinding,
              dataShardEnvironment: env.DATA_SHARD_ENV,
              historyBinding,
              isLocal: isLocalBaseUrl(env.HARBOUR_BASE_URL),
              pollIntervalMs: resolveOptionalPositiveInteger(
                env.D1_IMPORT_POLL_INTERVAL_MS,
              ),
              sourceBinding,
            },
          )

          if (nextMessage) {
            if (!env.JOB_QUEUE) {
              throw new Error('Missing JOB_QUEUE binding for SQL import chaining.')
            }

            await env.JOB_QUEUE.send(nextMessage)
          }

          message.ack()
          continue
        }

        let processingBody = body
        let drainedInlineChunks = 0

        const result = await (async () => {
          while (true) {
            const processResult = await processDataset(
              harbourClient,
              metaDb,
              currentDb,
              historyDb,
              env.R2_RAW,
              processingBody,
              sourceDb,
            )

            if (!('nextMessage' in processResult && processResult.nextMessage)) {
              return processResult
            }

            if (
              shouldDrainAddressContinuationInline(
                env,
                processingBody,
                processResult.nextMessage,
              )
            ) {
              drainedInlineChunks += 1

              if (drainedInlineChunks > LOCAL_INLINE_ADDRESS_DRAIN_LIMIT) {
                throw new Error(
                  `Local inline address drain exceeded ${LOCAL_INLINE_ADDRESS_DRAIN_LIMIT} chunks.`,
                )
              }

              console.info(
                JSON.stringify({
                  addressStage: readStringProperty(
                    processResult.nextMessage,
                    'addressStage',
                  ),
                  datasetId: processResult.nextMessage.datasetId,
                  drainedInlineChunks,
                  phase: 'localInlineAddressDrain',
                  releaseId:
                    processResult.nextMessage.releaseId ??
                    processResult.nextMessage.datasetId,
                  rowEnd: processResult.nextMessage.rowEnd,
                  rowStart: processResult.nextMessage.rowStart,
                  status: 'continuing',
                }),
              )
              processingBody = processResult.nextMessage
              continue
            }

            return processResult
          }
        })()

        if ('nextMessage' in result && result.nextMessage) {
          if (!env.JOB_QUEUE) {
            throw new Error('Missing JOB_QUEUE binding for address chunk chaining.')
          }

          console.info(
            JSON.stringify({
              addressStage: readStringProperty(result.nextMessage, 'addressStage'),
              datasetId: result.nextMessage.datasetId,
              phase: 'enqueueDatasetChunk',
              releaseId: result.nextMessage.releaseId ?? result.nextMessage.datasetId,
              rowEnd: result.nextMessage.rowEnd,
              rowStart: result.nextMessage.rowStart,
              status: 'started',
            }),
          )
          await env.JOB_QUEUE.send(result.nextMessage)
          console.info(
            JSON.stringify({
              addressStage: readStringProperty(result.nextMessage, 'addressStage'),
              datasetId: result.nextMessage.datasetId,
              phase: 'enqueueDatasetChunk',
              releaseId: result.nextMessage.releaseId ?? result.nextMessage.datasetId,
              rowEnd: result.nextMessage.rowEnd,
              rowStart: result.nextMessage.rowStart,
              status: 'completed',
            }),
          )
        }
        message.ack()
        console.info(
          JSON.stringify({
            addressStage: readStringProperty(body, 'addressStage'),
            attempts: message.attempts,
            datasetId: body.datasetId,
            messageId: message.id,
            phase: 'datasetQueueMessage',
            preplannedAddressChunks: Boolean(body.preplannedAddressChunks),
            releaseCode: body.releaseCode,
            releaseId: body.releaseId ?? body.datasetId,
            rowEnd: body.rowEnd,
            rowStart: body.rowStart,
            status: 'acked',
            type: body.type,
            ...(drainedInlineChunks > 0 ? { drainedInlineChunks } : {}),
          }),
        )
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

function shouldDrainAddressContinuationInline(
  env: Env,
  currentMessage: DatasetProcessingMessage,
  nextMessage: DatasetProcessingMessage,
) {
  return (
    isLocalBaseUrl(env.HARBOUR_BASE_URL) &&
    currentMessage.type === 'address' &&
    nextMessage.type === 'address' &&
    !isAddressSqlImportOrCleanupStage(nextMessage) &&
    !currentMessage.preplannedAddressChunks &&
    !nextMessage.preplannedAddressChunks
  )
}

function isLocalBaseUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function resolveOptionalPositiveInteger(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export default {
  queue: createQueueHandler(),
}
