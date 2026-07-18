import type { DatasetProcessingMessage } from '../../../types'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  SourceDatabase,
} from '@repo/db'

import {
  deleteMissingCurrentAddressesByCurrentMarker,
  prepareAddressVersionInsertContext,
} from '../../db/address'
import {
  buildSourceReleaseId,
  deleteMissingCurrentSourceHkgovAlsAddresses2dByReleaseId,
} from '../../db/source'
import { resolveDataShardEnvironment } from '../shared'
import type { AddressPipelineMessage } from './types'

type ProcessAddressDatasetResult = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  statsRows: number
  unchangedRows: number
}

export async function finalizeAddressDatasetStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  historyDb: HistoryDatabase,
  sourceDb: SourceDatabase | undefined,
  message: DatasetProcessingMessage,
): Promise<ProcessAddressDatasetResult> {
  const pipelineMessage = message as AddressPipelineMessage
  const processingRunStartedAt = message.processingRunStartedAt

  if (!processingRunStartedAt) {
    throw new Error('Missing processingRunStartedAt for address finalization.')
  }

  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const versionInsertContext = await prepareAddressVersionInsertContext(
    metaRepoDb,
    message,
    resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
  )
  const { count: deletedRows } = await deleteMissingCurrentAddressesByCurrentMarker(
    historyRepoDb,
    currentRepoDb,
    versionInsertContext.snapshotId,
    message.cohortKey,
    processingRunStartedAt,
  )

  if (sourceDb) {
    const releaseId = buildSourceReleaseId(message)
    await deleteMissingCurrentSourceHkgovAlsAddresses2dByReleaseId(
      sourceDb,
      message.sourceVersion,
      releaseId,
    )
  }

  return {
    deletedRows,
    insertedVersions: pipelineMessage.addressStats?.insertedVersions ?? 0,
    localizedRows: pipelineMessage.addressStats?.localizedRows ?? 0,
    processedRows:
      pipelineMessage.addressStats?.processedRows ??
      Math.max(0, Math.floor(message.totalRows ?? 0)),
    statsRows: 0,
    unchangedRows: pipelineMessage.addressStats?.unchangedRows ?? 0,
  }
}
