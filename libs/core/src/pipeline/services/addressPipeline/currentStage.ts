import type { DatasetProcessingMessage } from '../../../types'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import { recordSnapshotLookupDependency } from '../../../lib/db/metaRegistry'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

import {
  alignAddressCurrentDivisionSnapshot,
  cloneAddressCurrentSnapshot,
  prepareAddressVersionInsertContext,
  replaceAddressCurrentBuildingNumberLookups,
  replaceAddressCurrentI18n,
  touchAddressCurrentRows,
  upsertAddressCurrentStates,
} from '../../db/address'
import { resolveDataShardEnvironment } from '../shared'
import type { HarbourWorkerBucket } from '../division'
import { type PipelineArtefactBucket, readJsonArtefact } from '../pipelineArtefacts'
import { dedupeAddressI18nRows } from './normalisation'
import { resolveAddressChunkSize } from './normaliseStage'
import type {
  AddressPipelineMessage,
  ResolvedAddressChunkArtefact,
  ResolvedAddressRecord,
} from './types'
import { addAddressPipelineStats, collectAddressCoverageCounts } from './types'

export async function writeAddressCurrentChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.resolvedArtefactKey) {
    throw new Error('Missing resolved address artefact key for current stage.')
  }

  console.info(
    JSON.stringify({
      datasetId: message.datasetId,
      phase: 'addressCurrentStage',
      releaseId: message.releaseId ?? message.datasetId,
      resolvedArtefactKey: pipelineMessage.resolvedArtefactKey,
      rowEnd: message.rowEnd,
      rowStart: message.rowStart,
      status: 'readArtefactStarted',
    }),
  )
  const artefact = await readJsonArtefact<ResolvedAddressChunkArtefact>(
    bucket,
    pipelineMessage.resolvedArtefactKey,
  )
  const artefactRows = dedupeResolvedAddressRows(artefact.rows)
  console.info(
    JSON.stringify({
      changedRows: artefactRows.filter(row => row.changed).length,
      datasetId: message.datasetId,
      phase: 'addressCurrentStage',
      releaseId: message.releaseId ?? message.datasetId,
      rowEnd: artefact.rowEnd,
      rowStart: artefact.rowStart,
      status: 'started',
      totalRows: artefact.totalRows,
    }),
  )
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const currentRepoDb = currentDb as unknown as HarbourReadableDb & HarbourWritableDb
  const versionInsertContext = await prepareAddressVersionInsertContext(
    metaRepoDb,
    message,
    resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
  )

  if (artefact.rowStart === 0) {
    if (versionInsertContext.parentSnapshotId) {
      await cloneAddressCurrentSnapshot(
        currentRepoDb,
        versionInsertContext.parentSnapshotId,
        versionInsertContext.snapshotId,
        artefact.processingRunStartedAt,
      )
    }

    const divisionSnapshotId = artefactRows[0]?.base.divisionSnapshotId
    if (divisionSnapshotId) {
      await recordSnapshotLookupDependency(metaRepoDb, {
        anchorReleaseId: versionInsertContext.releaseId,
        lookupSnapshotId: divisionSnapshotId,
        selectedByRule:
          'api-composition:addresses/default:address/default->division/overture',
        selectionMode: 'latest_at_or_before_or_earliest_after_cohort',
        snapshotId: versionInsertContext.snapshotId,
      })
      await alignAddressCurrentDivisionSnapshot(
        currentRepoDb,
        versionInsertContext.snapshotId,
        divisionSnapshotId,
      )
    }
  }

  const changedRows = artefactRows.filter(row => row.changed)
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
  await replaceAddressCurrentBuildingNumberLookups(
    currentRepoDb,
    versionInsertContext.snapshotId,
    changedRows.map(row => row.addressId),
    changedRows.flatMap(row => row.i18n),
  )
  await touchAddressCurrentRows(
    currentRepoDb,
    versionInsertContext.snapshotId,
    artefactRows.map(row => row.addressId),
    artefact.processingRunStartedAt,
  )

  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const stats = addAddressPipelineStats(pipelineMessage.addressStats, {
    addedRows: artefact.addedRows,
    changedRows: artefact.changedRows,
    insertedVersions: artefact.insertedVersions,
    localisedRows: artefact.localisedRows,
    processedRows: artefact.rowEnd - artefact.rowStart,
    recordedRows: artefactRows.length,
    unchangedRows: artefact.unchangedRows,
    ...collectAddressCoverageCounts(artefactRows),
  })

  if (artefact.rowEnd < artefact.totalRows) {
    console.info(
      JSON.stringify({
        changedRows: changedRows.length,
        datasetId: message.datasetId,
        nextRowEnd: Math.min(artefact.rowEnd + chunkSize, artefact.totalRows),
        nextRowStart: artefact.rowEnd,
        phase: 'addressCurrentStage',
        releaseId: message.releaseId ?? message.datasetId,
        rowEnd: artefact.rowEnd,
        rowStart: artefact.rowStart,
        status: 'completed',
        totalRows: artefact.totalRows,
      }),
    )
    return {
      ...pipelineMessage,
      addressStage: 'normalise',
      addressStats: stats,
      artefactKey: undefined,
      resolvedArtefactKey: undefined,
      chunkSize,
      processingRunStartedAt: artefact.processingRunStartedAt,
      rowStart: artefact.rowEnd,
      rowEnd: Math.min(artefact.rowEnd + chunkSize, artefact.totalRows),
      totalRows: artefact.totalRows,
    } satisfies AddressPipelineMessage
  }

  console.info(
    JSON.stringify({
      changedRows: changedRows.length,
      datasetId: message.datasetId,
      phase: 'addressCurrentStage',
      releaseId: message.releaseId ?? message.datasetId,
      rowEnd: artefact.rowEnd,
      rowStart: artefact.rowStart,
      status: 'completed',
      totalRows: artefact.totalRows,
    }),
  )
  return {
    ...pipelineMessage,
    addressStage: 'finalise',
    addressStats: stats,
    artefactKey: undefined,
    resolvedArtefactKey: undefined,
    processingRunStartedAt: artefact.processingRunStartedAt,
    rowStart: artefact.rowEnd,
    rowEnd: artefact.rowEnd,
    totalRows: artefact.totalRows,
  } satisfies AddressPipelineMessage
}

function dedupeResolvedAddressRows(rows: ResolvedAddressRecord[]) {
  return [
    ...new Map(
      rows.map(row => [
        row.addressId,
        {
          ...row,
          i18n: dedupeAddressI18nRows(row.i18n, row.addressId),
        },
      ]),
    ).values(),
  ]
}
