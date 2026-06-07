import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type { DatasetProcessingMessage } from '@repo/core'

import {
  processAddressDataset as defaultProcessAddressDataset,
  type ProcessAddressDatasetResult,
} from './services/address'
import {
  processDivisionDataset as defaultProcessDivisionDataset,
  type HarbourWorkerBucket,
  type ProcessDatasetResult,
} from './services/division'

/**
 * Control-plane callbacks used to report worker progress and publish datasets.
 */
export type HarbourClient = {
  publishDataset(datasetId: string): Promise<void>
  stageCompleted(
    datasetId: string,
    phase: string,
    stats?: Record<string, unknown>,
  ): Promise<void>
  stageFailed(
    datasetId: string,
    phase: string,
    error: string,
    stats?: Record<string, unknown>,
  ): Promise<void>
  stageStarted(
    datasetId: string,
    phase: string,
    stats?: Record<string, unknown>,
  ): Promise<void>
}

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
    db: HarbourReadableDb & HarbourWritableDb,
    bucket: HarbourWorkerBucket,
    message: DatasetProcessingMessage,
  ): Promise<ProcessDatasetResult | ProcessAddressDatasetResult> {
    const activePhases = new Set<string>()
    await harbourClient.stageStarted(message.datasetId, 'processDataset')
    activePhases.add('processDataset')

    try {
      let result: ProcessDatasetResult | ProcessAddressDatasetResult

      if (message.type === 'division') {
        await harbourClient.stageStarted(message.datasetId, 'extractDivisions')
        activePhases.add('extractDivisions')
        await harbourClient.stageStarted(message.datasetId, 'extractDivisionsI18n')
        activePhases.add('extractDivisionsI18n')

        result = await processDivisionDataset(db, bucket, message)

        await harbourClient.stageCompleted(message.datasetId, 'extractDivisions', {
          deletedRows: result.deletedRows,
          insertedVersions: result.insertedVersions,
          processedRows: result.processedRows,
          unchangedRows: result.unchangedRows,
        })
        activePhases.delete('extractDivisions')
        await harbourClient.stageCompleted(message.datasetId, 'extractDivisionsI18n', {
          localizedRows: result.localizedRows,
        })
        activePhases.delete('extractDivisionsI18n')
      } else if (message.type === 'address') {
        await harbourClient.stageStarted(message.datasetId, 'extractAddresses')
        activePhases.add('extractAddresses')
        await harbourClient.stageStarted(message.datasetId, 'extractAddressesI18n')
        activePhases.add('extractAddressesI18n')

        result = await processAddressDataset(db, bucket, message)

        await harbourClient.stageCompleted(message.datasetId, 'extractAddresses', {
          deletedRows: result.deletedRows,
          insertedVersions: result.insertedVersions,
          processedRows: result.processedRows,
          unchangedRows: result.unchangedRows,
        })
        activePhases.delete('extractAddresses')
        await harbourClient.stageCompleted(message.datasetId, 'extractAddressesI18n', {
          localizedRows: result.localizedRows,
        })
        activePhases.delete('extractAddressesI18n')
      } else {
        throw new Error(`Unsupported processing type: ${message.type}`)
      }

      await harbourClient.stageStarted(message.datasetId, 'publishDataset')
      activePhases.add('publishDataset')
      await harbourClient.publishDataset(message.datasetId)
      await harbourClient.stageCompleted(message.datasetId, 'publishDataset')
      activePhases.delete('publishDataset')

      await harbourClient.stageCompleted(message.datasetId, 'processDataset')
      activePhases.delete('processDataset')
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      for (const phase of [...activePhases].filter(
        phase => phase !== 'processDataset',
      )) {
        await harbourClient.stageFailed(message.datasetId, phase, errorMessage)
      }

      if (activePhases.has('processDataset')) {
        await harbourClient.stageFailed(
          message.datasetId,
          'processDataset',
          errorMessage,
        )
      }

      throw error
    }
  }
}

export const processDatasetMessage = createProcessDatasetMessage()
