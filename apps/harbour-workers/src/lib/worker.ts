import type { DatasetProcessingMessage } from '@repo/core'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  SourceDatabase,
} from '@repo/db'
import {
  processAddressDataset as defaultProcessAddressDataset,
  type ProcessAddressDatasetResult,
} from './services/address'
import { getAddressPipelineStage } from './services/addressPipeline/types'
import {
  processDivisionDataset as defaultProcessDivisionDataset,
  type HarbourWorkerBucket,
  type ProcessDatasetResult,
} from './services/division'

/**
 * Control-plane callbacks used to report worker progress and publish datasets.
 */
export type HarbourClient = {
  publishDataset(
    releaseId: string,
    releaseCode?: string,
    options?: {
      skipSnapshotCleanup?: boolean
    },
  ): Promise<void>
  stageCompleted(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageFailed(
    releaseId: string,
    phase: string,
    error: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageRunning(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
}

export type DatasetProcessingResult = ProcessDatasetResult | ProcessAddressDatasetResult

/**
 * Processes a dataset message end to end, including extraction, publishing,
 * and phase status reporting.
 * @note Currently only supports division datasets.
 */
export function createProcessDatasetMessage(
  processAddressDataset = defaultProcessAddressDataset,
  processDivisionDataset = defaultProcessDivisionDataset,
) {
  return async function processDatasetMessage(
    harbourClient: HarbourClient,
    metaDb: MetaDatabase,
    currentDb: CurrentDatabase,
    historyDb: HistoryDatabase,
    bucket: HarbourWorkerBucket,
    message: DatasetProcessingMessage,
    sourceDb?: SourceDatabase,
  ): Promise<DatasetProcessingResult> {
    const releaseId = message.releaseId ?? message.datasetId
    const releaseCode = message.releaseCode
    if (!releaseId) {
      throw new Error('Missing releaseId in dataset processing message.')
    }
    const processStartedAt = Date.now()
    const activePhases = new Set<string>()

    try {
      activePhases.add('processDataset')
      await harbourClient.stageRunning(
        releaseId,
        'processDataset',
        undefined,
        releaseCode,
      )
      let result: DatasetProcessingResult

      if (message.type === 'division') {
        const extractStartedAt = Date.now()
        await harbourClient.stageRunning(
          releaseId,
          'extractDivisions',
          undefined,
          releaseCode,
        )
        activePhases.add('extractDivisions')
        await harbourClient.stageRunning(
          releaseId,
          'extractDivisionsI18n',
          undefined,
          releaseCode,
        )
        activePhases.add('extractDivisionsI18n')

        result = await processDivisionDataset(
          metaDb,
          currentDb,
          historyDb,
          bucket,
          message,
          sourceDb,
          async stats => {
            await harbourClient.stageRunning(
              releaseId,
              'extractDivisions',
              {
                processedRows: stats.processedRows,
              },
              releaseCode,
            )
          },
        )

        await harbourClient.stageCompleted(
          releaseId,
          'extractDivisions',
          {
            durationMs: Date.now() - extractStartedAt,
            deletedRows: result.deletedRows,
            insertedVersions: result.insertedVersions,
            processedRows: result.processedRows,
            unchangedRows: result.unchangedRows,
          },
          releaseCode,
        )
        activePhases.delete('extractDivisions')
        await harbourClient.stageCompleted(
          releaseId,
          'extractDivisionsI18n',
          {
            durationMs: Date.now() - extractStartedAt,
            localizedRows: result.localizedRows,
          },
          releaseCode,
        )
        activePhases.delete('extractDivisionsI18n')
      } else if (message.type === 'address') {
        const extractStartedAt = Date.now()
        await harbourClient.stageRunning(
          releaseId,
          'extractAddresses',
          undefined,
          releaseCode,
        )
        activePhases.add('extractAddresses')
        await harbourClient.stageRunning(
          releaseId,
          'extractAddressesI18n',
          undefined,
          releaseCode,
        )
        activePhases.add('extractAddressesI18n')

        result = await processAddressDataset(
          metaDb,
          currentDb,
          historyDb,
          bucket,
          message,
          sourceDb,
          async stats => {
            await harbourClient.stageRunning(
              releaseId,
              'extractAddresses',
              {
                processedRows: stats.processedRows,
              },
              releaseCode,
            )
          },
        )

        if ('nextMessage' in result && result.nextMessage) {
          const durationMs = Date.now() - processStartedAt
          const addressStage =
            message.type === 'address' ? getAddressPipelineStage(message) : undefined
          const nextAddressStage =
            result.nextMessage.type === 'address'
              ? getAddressPipelineStage(result.nextMessage)
              : undefined
          console.info(
            JSON.stringify({
              addressStage,
              datasetId: message.datasetId,
              messageType: message.type,
              nextAddressStage,
              nextRowEnd: result.nextMessage.rowEnd,
              nextRowStart: result.nextMessage.rowStart,
              phase: 'processDataset',
              processedRows:
                result.nextMessage.addressStats?.processedRows ??
                result.nextMessage.rowStart ??
                result.processedRows,
              releaseId,
              source: message.source,
              sourceVersion: message.sourceVersion,
              status: 'chunkCompleted',
              durationMs,
            }),
          )
          return result
        }

        await harbourClient.stageCompleted(
          releaseId,
          'extractAddresses',
          {
            durationMs: Date.now() - extractStartedAt,
            deletedRows: result.deletedRows,
            insertedVersions: result.insertedVersions,
            processedRows: result.processedRows,
            unchangedRows: result.unchangedRows,
          },
          releaseCode,
        )
        activePhases.delete('extractAddresses')
        await harbourClient.stageCompleted(
          releaseId,
          'extractAddressesI18n',
          {
            durationMs: Date.now() - extractStartedAt,
            localizedRows: result.localizedRows,
          },
          releaseCode,
        )
        activePhases.delete('extractAddressesI18n')
      } else {
        throw new Error(`Unsupported processing type: ${message.type}`)
      }

      const publishStartedAt = Date.now()
      await harbourClient.stageRunning(
        releaseId,
        'publishDataset',
        undefined,
        releaseCode,
      )
      activePhases.add('publishDataset')
      if (message.skipSnapshotCleanup) {
        await harbourClient.publishDataset(releaseId, releaseCode, {
          skipSnapshotCleanup: true,
        })
      } else {
        await harbourClient.publishDataset(releaseId, releaseCode)
      }
      await harbourClient.stageCompleted(
        releaseId,
        'publishDataset',
        {
          durationMs: Date.now() - publishStartedAt,
        },
        releaseCode,
      )
      activePhases.delete('publishDataset')

      const durationMs = Date.now() - processStartedAt
      console.info(
        JSON.stringify({
          datasetId: message.datasetId,
          messageType: message.type,
          phase: 'processDataset',
          processedRows: result.processedRows,
          releaseId,
          source: message.source,
          sourceVersion: message.sourceVersion,
          status: 'completed',
          durationMs,
        }),
      )
      await harbourClient.stageCompleted(
        releaseId,
        'processDataset',
        {
          durationMs,
        },
        releaseCode,
      )
      activePhases.delete('processDataset')
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const durationMs = Date.now() - processStartedAt

      console.error(
        JSON.stringify({
          datasetId: message.datasetId,
          messageType: message.type,
          phase: 'processDataset',
          releaseId,
          source: message.source,
          sourceVersion: message.sourceVersion,
          status: 'failed',
          error: errorMessage,
          durationMs,
        }),
      )

      const cleanupErrors: unknown[] = []

      for (const phase of [...activePhases].filter(
        phase => phase !== 'processDataset',
      )) {
        try {
          await harbourClient.stageFailed(
            releaseId,
            phase,
            errorMessage,
            undefined,
            releaseCode,
          )
        } catch (cleanupError) {
          cleanupErrors.push(
            new Error(
              `Failed to mark ${phase} as failed for ${releaseId}: ${
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError)
              }`,
            ),
          )
        }
      }

      if (activePhases.has('processDataset')) {
        try {
          await harbourClient.stageFailed(
            releaseId,
            'processDataset',
            errorMessage,
            undefined,
            releaseCode,
          )
        } catch (cleanupError) {
          cleanupErrors.push(
            new Error(
              `Failed to mark processDataset as failed for ${releaseId}: ${
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError)
              }`,
            ),
          )
        }
      }

      for (const cleanupError of cleanupErrors) {
        console.error(cleanupError)
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `Dataset processing failed and cleanup was incomplete for ${releaseId}.`,
        )
      }

      throw error
    }
  }
}

export const processDatasetMessage = createProcessDatasetMessage()
