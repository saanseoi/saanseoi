import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type { DatasetProcessingMessage } from '@repo/core'
import type { SourceDatabase } from '@repo/db'

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
  publishDataset(releaseId: string): Promise<void>
  stageCompleted(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
  ): Promise<void>
  stageFailed(
    releaseId: string,
    phase: string,
    error: string,
    stats?: Record<string, unknown>,
  ): Promise<void>
  stageStarted(
    releaseId: string,
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
    sourceDb?: SourceDatabase,
  ): Promise<ProcessDatasetResult | ProcessAddressDatasetResult> {
    const releaseId = message.releaseId ?? message.datasetId
    const activePhases = new Set<string>()
    await harbourClient.stageStarted(releaseId, 'processDataset')
    activePhases.add('processDataset')

    try {
      let result: ProcessDatasetResult | ProcessAddressDatasetResult

      if (message.type === 'division') {
        await harbourClient.stageStarted(releaseId, 'extractDivisions')
        activePhases.add('extractDivisions')
        await harbourClient.stageStarted(releaseId, 'extractDivisionsI18n')
        activePhases.add('extractDivisionsI18n')

        result = await processDivisionDataset(db, bucket, message, sourceDb)

        await harbourClient.stageCompleted(releaseId, 'extractDivisions', {
          deletedRows: result.deletedRows,
          insertedVersions: result.insertedVersions,
          processedRows: result.processedRows,
          unchangedRows: result.unchangedRows,
        })
        activePhases.delete('extractDivisions')
        await harbourClient.stageCompleted(releaseId, 'extractDivisionsI18n', {
          localizedRows: result.localizedRows,
        })
        activePhases.delete('extractDivisionsI18n')
      } else if (message.type === 'address') {
        await harbourClient.stageStarted(releaseId, 'extractAddresses')
        activePhases.add('extractAddresses')
        await harbourClient.stageStarted(releaseId, 'extractAddressesI18n')
        activePhases.add('extractAddressesI18n')

        result = await processAddressDataset(db, bucket, message, sourceDb)

        await harbourClient.stageCompleted(releaseId, 'extractAddresses', {
          deletedRows: result.deletedRows,
          insertedVersions: result.insertedVersions,
          processedRows: result.processedRows,
          unchangedRows: result.unchangedRows,
        })
        activePhases.delete('extractAddresses')
        await harbourClient.stageCompleted(releaseId, 'extractAddressesI18n', {
          localizedRows: result.localizedRows,
        })
        activePhases.delete('extractAddressesI18n')
      } else {
        throw new Error(`Unsupported processing type: ${message.type}`)
      }

      await harbourClient.stageStarted(releaseId, 'publishDataset')
      activePhases.add('publishDataset')
      await harbourClient.publishDataset(releaseId)
      await harbourClient.stageCompleted(releaseId, 'publishDataset')
      activePhases.delete('publishDataset')

      await harbourClient.stageCompleted(releaseId, 'processDataset')
      activePhases.delete('processDataset')
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      for (const phase of [...activePhases].filter(
        phase => phase !== 'processDataset',
      )) {
        await harbourClient.stageFailed(releaseId, phase, errorMessage)
      }

      if (activePhases.has('processDataset')) {
        await harbourClient.stageFailed(releaseId, 'processDataset', errorMessage)
      }

      throw error
    }
  }
}

export const processDatasetMessage = createProcessDatasetMessage()
