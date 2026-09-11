import { readAlsPublisherSource } from '../sources/alsSourcePayload'
import type { DatasetProcessingMessage } from '../../../types'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../../parquetR2'
import { createHash } from '../../utils'
import { logStructuredInfo } from '../../logging'
import type { HarbourWorkerBucket } from '../divisions/division'
import {
  buildPipelineArtefactKey,
  type PipelineArtefactBucket,
  writeJsonArtefact,
} from '../storage/artefacts'
import {
  buildHkgovAlsSourceHashInput,
  dedupeAddressI18nRows,
  normaliseAddressRowForPipeline,
} from './normalisation'
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
      if (!Object.hasOwn(row, 'publisherSource')) {
        throw new Error(
          'ALS preparation is missing the publisher source envelope; prepare the release again.',
        )
      }
      const normalised = normaliseAddressRowForPipeline(row, message.sourceVersion)
      const i18n = dedupeAddressI18nRows(normalised.i18n, normalised.sourceId)
      const sourcePayloadHash = readAlsPublisherSource(row)
        ? await createHash(buildHkgovAlsSourceHashInput(row))
        : ''
      if (
        readAlsPublisherSource(row)?.versionHash &&
        readAlsPublisherSource(row)!.versionHash !== sourcePayloadHash
      ) {
        throw new Error(
          'ALS publisher source hash mismatch; prepare the release again.',
        )
      }

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
  const granularityCounts: Record<string, number> = {}
  for (const row of rows) {
    const { granularity } = row.base
    granularityCounts[granularity] = (granularityCounts[granularity] ?? 0) + 1
  }
  logStructuredInfo({
    phase: 'addressGranularity',
    releaseId: message.releaseId ?? message.datasetId,
    rowStart,
    rowEnd,
    granularityCounts,
  })
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
