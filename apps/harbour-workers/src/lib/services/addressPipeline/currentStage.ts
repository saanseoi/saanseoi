import type { DatasetProcessingMessage } from '@repo/core'
import { resolveLatestSnapshotForResourceTypeExcludingId } from '@repo/core/db/metaRepository'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

import {
  alignAddressCurrentDivisionSnapshot,
  cloneAddressCurrentSnapshot,
  prepareAddressVersionInsertContext,
  replaceAddressCurrentI18n,
  touchAddressCurrentRows,
  upsertAddressCurrentStates,
} from '../../db/address'
import { resolveDataShardEnvironment } from '../shared'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtifactBucket, readJsonArtifact } from '../pipelineArtifacts'
import { loadDivisionLookupMaps } from './normalization'
import { resolveAddressChunkSize } from './normalizeStage'
import type { AddressPipelineMessage, ResolvedAddressChunkArtifact } from './types'
import { addAddressPipelineStats } from './types'

export async function writeAddressCurrentChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.resolvedArtifactKey) {
    throw new Error('Missing resolved address artifact key for current stage.')
  }

  const artifact = await readJsonArtifact<ResolvedAddressChunkArtifact>(
    bucket,
    pipelineMessage.resolvedArtifactKey,
  )
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const versionInsertContext = await prepareAddressVersionInsertContext(
    metaRepoDb,
    message,
    resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
  )

  if (artifact.rowStart === 0) {
    const previousSnapshot = await resolveLatestSnapshotForResourceTypeExcludingId(
      metaRepoDb,
      'address',
      versionInsertContext.snapshotId,
    )

    if (previousSnapshot) {
      await cloneAddressCurrentSnapshot(
        currentRepoDb,
        previousSnapshot.id,
        versionInsertContext.snapshotId,
        artifact.processingRunStartedAt,
      )
    }

    const divisionLookup = await loadDivisionLookupMaps(
      metaDb,
      currentDb,
      message.regionCode,
    )
    await alignAddressCurrentDivisionSnapshot(
      currentRepoDb,
      versionInsertContext.snapshotId,
      divisionLookup.snapshotId,
    )
  }

  const changedRows = artifact.rows.filter(row => row.changed)
  await upsertAddressCurrentStates(
    currentRepoDb,
    changedRows.map(row => row.base),
  )
  await replaceAddressCurrentI18n(
    currentRepoDb,
    versionInsertContext.snapshotId,
    changedRows.map(row => row.addressId),
    changedRows.flatMap(row => row.i18n),
  )
  await touchAddressCurrentRows(
    currentRepoDb,
    versionInsertContext.snapshotId,
    artifact.rows.map(row => row.addressId),
    artifact.processingRunStartedAt,
  )

  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const stats = addAddressPipelineStats(pipelineMessage.addressStats, {
    insertedVersions: artifact.insertedVersions,
    localizedRows: artifact.localizedRows,
    processedRows: artifact.rowEnd - artifact.rowStart,
    unchangedRows: artifact.unchangedRows,
  })

  if (artifact.rowEnd < artifact.totalRows) {
    return {
      ...pipelineMessage,
      addressStage: 'normalize',
      addressStats: stats,
      artifactKey: undefined,
      resolvedArtifactKey: undefined,
      chunkSize,
      processingRunStartedAt: artifact.processingRunStartedAt,
      rowStart: artifact.rowEnd,
      rowEnd: Math.min(artifact.rowEnd + chunkSize, artifact.totalRows),
      totalRows: artifact.totalRows,
    } satisfies AddressPipelineMessage
  }

  return {
    ...pipelineMessage,
    addressStage: 'finalize',
    addressStats: stats,
    artifactKey: undefined,
    resolvedArtifactKey: undefined,
    processingRunStartedAt: artifact.processingRunStartedAt,
    rowStart: artifact.rowEnd,
    rowEnd: artifact.rowEnd,
    totalRows: artifact.totalRows,
  } satisfies AddressPipelineMessage
}
