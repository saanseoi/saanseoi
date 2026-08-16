import { createHash } from 'node:crypto'

/** The remote D1 API transports hex as ASCII, never a binary geometry value. */
export const REMOTE_GEOMETRY_HEX_CHUNK_BYTES = 16 * 1024

export type BinaryGeometryRow = {
  binaryColumn: string
  geometry: Buffer | null
  geometryDigest: string | null
  geometryLength: number | null
  geometryType: 'blob' | 'text' | 'null'
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
