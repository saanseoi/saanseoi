import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/repository'
import type { DatasetProcessingMessage } from '@repo/core'

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
  processDivisionDataset = defaultProcessDivisionDataset,
) {
  return async function processDatasetMessage(
    harbourClient: HarbourClient,
    db: HarbourReadableDb & HarbourWritableDb,
    bucket: HarbourWorkerBucket,
    message: DatasetProcessingMessage,
  ): Promise<ProcessDatasetResult> {
    if (message.type !== 'division') {
      throw new Error(`Unsupported processing type: ${message.type}`)
    }

    const activePhases = new Set<string>()
    await harbourClient.stageStarted(message.datasetId, 'processDataset')
    activePhases.add('processDataset')

    try {
      await harbourClient.stageStarted(message.datasetId, 'extractDivisions')
      activePhases.add('extractDivisions')
      await harbourClient.stageStarted(message.datasetId, 'extractDivisionsI18n')
      activePhases.add('extractDivisionsI18n')

      const result = await processDivisionDataset(db, bucket, message)

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

      for (const phase of [...activePhases].filter(phase => phase !== 'processDataset')) {
        await harbourClient.stageFailed(message.datasetId, phase, errorMessage)
      }

      if (activePhases.has('processDataset')) {
        await harbourClient.stageFailed(message.datasetId, 'processDataset', errorMessage)
      }

      throw error
    }
  }
}

export const processDatasetMessage = createProcessDatasetMessage()
