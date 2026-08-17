import { createHash } from 'node:crypto'

/** The remote D1 API transports hex as ASCII, never a binary geometry value. */
// Keep each ASCII chunk comfortably below D1's row/result limits. Several
// bounded chunks are requested in one read to avoid one Wrangler process per
// 16 KiB fragment for large historical geometries.
export const REMOTE_GEOMETRY_HEX_CHUNK_BYTES = 32 * 1024
export const REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY = 4
export const REMOTE_GEOMETRY_BATCH_BYTE_LIMIT = 96 * 1024

export type RemoteGeometryRowDescriptor = {
  geometryLength: number | null
  geometryType: 'blob' | 'text' | 'null'
}

export type RemoteGeometryBatch = {
  count: number
  maxChunkCount: number
  start: number
}

/**
 * Groups consecutive rows into bounded geometry reads. A large geometry stays
 * alone, while ordinary rows share one query until the safe payload budget is
 * reached. The chunk count is per row; it lets the caller fetch large rows in
 * several bounded windows without creating a query for every record.
 */
export function partitionRemoteGeometryRows(
  rows: RemoteGeometryRowDescriptor[],
  maxBytes = REMOTE_GEOMETRY_BATCH_BYTE_LIMIT,
) {
  const batches: RemoteGeometryBatch[] = []
  let start = 0
  let byteTotal = 0
  let maxChunkCount = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row) continue

    const geometryLength = Math.max(0, row.geometryLength ?? 0)
    const requestedBytes = Math.max(
      1,
      Math.min(
        geometryLength,
        REMOTE_GEOMETRY_HEX_CHUNK_BYTES * REMOTE_GEOMETRY_HEX_CHUNKS_PER_QUERY,
      ),
    )
    const rowChunkCount =
      row.geometryType === 'blob'
        ? Math.ceil(geometryLength / REMOTE_GEOMETRY_HEX_CHUNK_BYTES)
        : 0

    if (index > start && byteTotal + requestedBytes > maxBytes) {
      batches.push({ count: index - start, maxChunkCount, start })
      start = index
      byteTotal = 0
      maxChunkCount = 0
    }

    byteTotal += requestedBytes
    maxChunkCount = Math.max(maxChunkCount, rowChunkCount)
  }

  if (start < rows.length) {
    batches.push({ count: rows.length - start, maxChunkCount, start })
  }

  return batches
}

export type BinaryGeometryRow = {
  binaryColumn: string
  geometry: Buffer | null
  geometryDigest: string | null
  geometryLength: number | null
  geometryType: 'blob' | 'text' | 'null'
  primaryKeyColumns?: string[]
  recordId: string
  snapshotId: string | null
  values: Record<string, null | number | string>
}

export function reassembleHexChunks(chunks: string[]) {
  if (chunks.length === 0) return Buffer.alloc(0)

  for (const chunk of chunks) {
    if (!/^(?:[\da-fA-F]{2})*$/.test(chunk)) {
      throw new Error('Remote geometry hex chunk contains non-hex data.')
    }
  }

  return Buffer.from(chunks.join(''), 'hex')
}

export function geometrySha256(value: Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * D1's SQL export can decode a BLOB as UTF-8 before producing SQL. A string
 * containing replacement characters is therefore evidence of corruption, not
 * an alternative BLOB representation.
 */
export function rejectReplacementCharacter(value: string) {
  if (value.includes('\uFFFD')) {
    throw new Error(
      'Refusing a geometry value containing U+FFFD: binary geometry must be mirrored as hex, never decoded as UTF-8.',
    )
  }
  return value
}

export function assertBinaryGeometryRow(row: BinaryGeometryRow) {
  if (row.geometryType !== 'blob') return
  if (!row.geometry) {
    throw new Error(`Binary geometry ${row.recordId} has no reconstructed bytes.`)
  }
  if (row.geometryLength !== row.geometry.byteLength) {
    throw new Error(
      `Binary geometry ${row.recordId} length mismatch: expected ${row.geometryLength}, received ${row.geometry.byteLength}.`,
    )
  }
  if (row.geometryDigest !== geometrySha256(row.geometry)) {
    throw new Error(
      `Binary geometry ${row.recordId} digest mismatch after hex reconstruction.`,
    )
  }
}
