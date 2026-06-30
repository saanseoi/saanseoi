import type { DatasetProcessingMessage } from '@repo/core'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../../parquetR2'
import { createHash } from '../../utils'
import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtifactKey,
  type PipelineArtifactBucket,
  writeJsonArtifact,
} from '../pipelineArtifacts'
import { loadDivisionLookupMaps, normalizeAddressRowForPipeline } from './normalization'
import type { AddressPipelineMessage, NormalizedAddressChunkArtifact } from './types'

const ADDRESS_BATCH_SIZE = 128
const ADDRESS_CHUNK_ROW_COUNT = 1024
const ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE = 2048

type ReportProgress = (stats: {
  localizedRows: number
  processedRows: number
}) => Promise<void>

export async function normalizeAddressChunkStage(
  metaDb: MetaDatabase,
  currentDb: CurrentDatabase,
  bucket: HarbourWorkerBucket & PipelineArtifactBucket,
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
  const divisionLookup = await loadDivisionLookupMaps(
    metaDb,
    currentDb,
    message.regionCode,
  )
  const rows: NormalizedAddressChunkArtifact['rows'] = []
  let totalRows = Math.max(0, Math.floor(message.totalRows ?? 0))
  let processedRows = 0
  let localizedRows = 0

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE, {
    rowStart,
    rowEnd: requestedRowEnd,
    readRowWindowSize: ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE,
    onMetadata(metadata) {
      totalRows = metadata.rowCount
      console.info(
        JSON.stringify({
          datasetId: message.datasetId,
          metadata,
          phase: 'normalizeAddressChunk',
          rowEnd: Math.min(requestedRowEnd, metadata.rowCount),
          rowStart,
          releaseId: message.releaseId ?? message.datasetId,
          source: message.source,
          sourceVersion: message.sourceVersion,
          type: message.type,
        }),
      )
    },
  })) {
    for (const row of batch) {
      const normalized = normalizeAddressRowForPipeline(row, message, divisionLookup)
      const sourcePayloadHash = await createHash(row)

      rows.push({
        ...normalized,
        raw: row,
        sourcePayloadHash,
      })
      processedRows += 1
      localizedRows += normalized.i18n.length
    }

    await reportProgress?.({
      localizedRows,
      processedRows: rowStart + processedRows,
    })
  }

  if (totalRows === 0) {
    totalRows = rowStart + processedRows
  }

  const rowEnd = Math.min(requestedRowEnd, totalRows)
  const artifactKey = buildPipelineArtifactKey(message, 'normalized', rowStart, rowEnd)

  await writeJsonArtifact<NormalizedAddressChunkArtifact>(bucket, artifactKey, {
    kind: 'address.normalized.v1',
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
    artifactKey,
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
