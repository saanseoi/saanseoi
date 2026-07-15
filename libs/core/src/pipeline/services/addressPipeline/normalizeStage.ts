import type { DatasetProcessingMessage } from '../../../types'
import type { CurrentDatabase, MetaDatabase } from '@repo/db'
import { parquetMetadataAsync, parquetSchema, type AsyncBuffer } from 'hyparquet'

import { createAsyncBufferFromR2, readParquetObjectsInBatches } from '../../parquetR2'
import { asNonEmptyString, createHash, stableJsonStringify } from '../../utils'
import { logStructuredInfo } from '../../logging'
import type { HarbourWorkerBucket } from '../division'
import {
  buildPipelineArtifactKey,
  type PipelineArtifactBucket,
  writeJsonArtifact,
} from '../pipelineArtifacts'
import {
  deserializeDivisionLookupMaps,
  dedupeAddressI18nRows,
  loadDivisionLookupMaps,
  normalizeAddressRowForPipeline,
  serializeDivisionLookupMaps,
} from './normalization'
import type { AddressPipelineMessage, NormalizedAddressChunkArtifact } from './types'

const ADDRESS_BATCH_SIZE = 128
const ADDRESS_CHUNK_ROW_COUNT = 1024
const ADDRESS_PARQUET_READ_ROW_WINDOW_SIZE = 2048
const OVERTURE_HK_ADDRESS_PREFLIGHT_COLUMNS = [
  'id',
  'theme',
  'type',
  'country',
  'postcode',
  'postal_city',
  'unit',
]

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

  if (
    message.source === 'overture' &&
    message.type === 'address' &&
    message.regionCode === 'hk' &&
    rowStart === 0
  ) {
    await assertOvertureHongKongAddressSourceAssumptions(file)
  }

  const requestedRowEnd = Math.max(
    rowStart,
    Math.floor(message.rowEnd ?? rowStart + chunkSize),
  )
  const pipelineMessage = message as AddressPipelineMessage
  const divisionLookup = pipelineMessage.addressDivisionLookup
    ? deserializeDivisionLookupMaps(pipelineMessage.addressDivisionLookup)
    : await loadDivisionLookupMaps(
        metaDb,
        currentDb,
        message.regionCode,
        message.cohortKey,
      )
  const addressDivisionLookup =
    pipelineMessage.addressDivisionLookup ?? serializeDivisionLookupMaps(divisionLookup)
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
      logStructuredInfo({
        datasetId: message.datasetId,
        metadata,
        phase: 'normalizeAddressChunk',
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
      const normalized = normalizeAddressRowForPipeline(row, message, divisionLookup)
      const i18n = dedupeAddressI18nRows(normalized.i18n, normalized.sourceId)
      const sourcePayloadHash = await createHash(row)

      rows.push({
        ...normalized,
        i18n,
        raw: row,
        sourcePayloadHash,
      })
      processedRows += 1
      localizedRows += i18n.length
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
    addressDivisionLookup,
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

/**
 * Guards the low-value Overture source fields that the HK address pipeline drops.
 */
export async function assertOvertureHongKongAddressSourceAssumptions(
  file: AsyncBuffer,
) {
  const rows: Record<string, unknown>[] = []
  const availableColumns = await getAvailableParquetColumns(file)
  const columns = OVERTURE_HK_ADDRESS_PREFLIGHT_COLUMNS.filter(column =>
    availableColumns.has(column),
  )

  for await (const batch of readParquetObjectsInBatches(file, ADDRESS_BATCH_SIZE, {
    columns,
  })) {
    rows.push(...batch)
  }

  const violations = collectOvertureHongKongAddressSourceAssumptionViolations(rows)

  if (violations.length > 0) {
    throw new Error(
      [
        'Overture Hong Kong address parquet no longer matches dropped-field assumptions.',
        ...violations.map(violation => `- ${violation}`),
      ].join('\n'),
    )
  }
}

export function collectOvertureHongKongAddressSourceAssumptionViolations(
  rows: Array<Record<string, unknown>>,
) {
  const violations: string[] = []

  const addViolation = (message: string) => {
    if (violations.length < 20) {
      violations.push(message)
    }
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1
    const rowId = asNonEmptyString(row.id)
    const rowLabel = `row ${rowNumber}${rowId ? ` (${rowId})` : ''}`

    if (row.theme !== 'addresses') {
      addViolation(
        `${rowLabel}: expected theme=addresses, got ${formatSourceValue(row.theme)}`,
      )
    }

    if (row.type !== 'address') {
      addViolation(
        `${rowLabel}: expected type=address, got ${formatSourceValue(row.type)}`,
      )
    }

    if (row.country !== 'HK') {
      addViolation(
        `${rowLabel}: expected country=HK, got ${formatSourceValue(row.country)}`,
      )
    }

    for (const field of ['postcode', 'postal_city', 'unit'] as const) {
      if (!isEmptySourceValue(row[field])) {
        addViolation(
          `${rowLabel}: expected empty ${field}, got ${formatSourceValue(row[field])}`,
        )
      }
    }
  })

  return violations
}

function isEmptySourceValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'string') {
    return value.trim().length === 0
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isEmptySourceValue)
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isEmptySourceValue)
  }

  return false
}

function formatSourceValue(value: unknown) {
  return stableJsonStringify(value) ?? String(value)
}

async function getAvailableParquetColumns(file: AsyncBuffer) {
  const metadata = await parquetMetadataAsync(file)
  const schema = parquetSchema(metadata)

  return new Set(schema.children.map(child => String(child.element.name)))
}
