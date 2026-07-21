import type { DatasetProcessingMessage } from '../../../types'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../../parquetR2'
import { createHash } from '../../utils'
import { logStructuredInfo } from '../../logging'
import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtefactKey,
  type PipelineArtefactBucket,
  writeJsonArtefact,
} from '../pipelineArtefacts'
import { dedupeAddressI18nRows, normaliseAddressRowForPipeline } from './normalisation'
import type { AddressPipelineMessage, NormalisedAddressChunkArtefact } from './types'

const ADDRESS_BATCH_SIZE = 128
const ADDRESS_CHUNK_ROW_COUNT = 1024
const ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE = 2048
type ReportProgress = (stats: {
  localisedRows: number
  processedRows: number
}) => Promise<void>

export async function normaliseAddressChunkStage(
  _metaDb: unknown,
  _currentDb: unknown,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  reportProgress?: ReportProgress,
): Promise<AddressPipelineMessage> {
  const file = await createAsyncBufferFromR2(bucket, message.rawObjectKey)
  const processingRunStartedAt =
    message.processingRunStartedAt ?? new Date().toISOString()
  const chunkSize = resolveAddressChunkSize(message.chunkSize)
  const rowStart = Math.max(0, Math.floor(message.rowStart ?? 0))

  const requestedRowEnd = Math.max(
    rowStart,
    Math.floor(message.rowEnd ?? rowStart + chunkSize),
  )
  const rows: NormalisedAddressChunkArtefact['rows'] = []
  let totalRows = Math.max(0, Math.floor(message.totalRows ?? 0))
  let processedRows = 0
  let localisedRows = 0

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE, {
    rowStart,
    rowEnd: requestedRowEnd,
    readRowWindowSize: ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE,
    onMetadata(metadata) {
      totalRows = metadata.rowCount
      logStructuredInfo({
        datasetId: message.datasetId,
        metadata,
        phase: 'normaliseAddressChunk',
        rowEnd: Math.min(requestedRowEnd, metadata.rowCount),
        rowStart,
        releaseId: message.releaseId ?? message.datasetId,
        source: message.source,
        sourceVersion: message.sourceVersion,
        type: message.type,
      })
    },
  })) {
    for (const row of batch) {
      const normalised = normaliseAddressRowForPipeline(row)
      const i18n = dedupeAddressI18nRows(normalised.i18n, normalised.sourceId)
      const sourcePayloadHash = await createHash(row)

      rows.push({
        ...normalised,
        i18n,
        raw: row,
        sourcePayloadHash,
      })
      processedRows += 1
      localisedRows += i18n.length
    }

    await reportProgress?.({
      localisedRows,
      processedRows: rowStart + processedRows,
    })
  }

  if (totalRows === 0) {
    totalRows = rowStart + processedRows
  }

  const rowEnd = Math.min(requestedRowEnd, totalRows)
  const artefactKey = buildPipelineArtefactKey(message, 'normalised', rowStart, rowEnd)

  await writeJsonArtefact<NormalisedAddressChunkArtefact>(bucket, artefactKey, {
    kind: 'address.normalised.v1',
    processingRunStartedAt,
    releaseId: message.releaseId ?? message.datasetId,
    rowStart,
    rowEnd,
    rows,
    totalRows,
  })

  return {
    ...message,
    addressStage: 'source',
    artefactKey,
    chunkSize,
    processingRunStartedAt,
    rowStart,
    rowEnd,
    totalRows,
  } satisfies AddressPipelineMessage
}

export function resolveAddressChunkSize(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : ADDRESS_CHUNK_ROW_COUNT
}
