import { requireDefined } from '../../requireDefined'
import { createHash, sortJsonValue } from '../utils'

export const AUDIT_MAX_DECISIONS = 256
export const AUDIT_MAX_JSON_BYTES = 256 * 1024
export const AUDIT_MAX_BLOB_BYTES = 32 * 1024
const FRAGMENT_BYTES = 24 * 1024

export type ReleaseProcessingAction = {
  action: string
  affectedRecordCount: number
  evidence: unknown
  mode: 'automatic' | 'manual'
  summary: string
}
export type AuditRecord = ReleaseProcessingAction & {
  original?: { id: string; createdAt: string; updatedAt: string }
}

export type AuditChunk = {
  id: string
  releaseId: string
  actionId: string
  generation: string
  firstOrdinal: number
  decisionCount: number
  part: number
  parts: number
  encoding: 'gzip-json-v1'
  checksum: string
  payload: Uint8Array
}

export type AuditSummary = {
  id: string
  releaseId: string
  action: string
  mode: 'automatic' | 'manual'
  generation: string
  decisionCount: number
  affectedRecordCount: number
  createdAt: string
  updatedAt: string
}

type Envelope = {
  version: 1
  summaries: string[]
  records: Array<[number, number, unknown]>
  original?: Array<AuditRecord['original']>
}

const encoder = new TextEncoder()

export async function auditChecksum(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function gzip(bytes: Uint8Array) {
  const stream = new Blob([Uint8Array.from(bytes).buffer])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function encode(actions: AuditRecord[]) {
  const summaries = [...new Set(actions.map(action => action.summary))]
  const indices = new Map(summaries.map((summary, index) => [summary, index]))
  const envelope: Envelope = {
    version: 1,
    summaries,
    records: actions.map(action => [
      requireDefined(indices.get(action.summary)),
      action.affectedRecordCount,
      action.evidence,
    ]),
    ...(actions.some(action => action.original)
      ? { original: actions.map(action => action.original) }
      : {}),
  }
  return encoder.encode(JSON.stringify(envelope))
}

export function normaliseAuditActions(actions: ReleaseProcessingAction[]) {
  return actions.map(action => {
    if (
      !Number.isFinite(action.affectedRecordCount) ||
      !Number.isSafeInteger(Math.floor(action.affectedRecordCount))
    )
      throw new Error('Invalid audit affected-record count.')
    return {
      ...action,
      affectedRecordCount: Math.max(0, Math.floor(action.affectedRecordCount)),
      evidence: sortJsonValue(action.evidence ?? null),
    }
  })
}

export async function encodeAuditGroup(
  summary: AuditSummary,
  actions: AuditRecord[],
): Promise<AuditChunk[]> {
  const chunks: AuditChunk[] = []
  async function append(records: AuditRecord[], firstOrdinal: number): Promise<void> {
    const bytes = encode(records)
    const payload = bytes.length <= AUDIT_MAX_JSON_BYTES ? await gzip(bytes) : null
    if ((!payload || payload.length > AUDIT_MAX_BLOB_BYTES) && records.length > 1) {
      const middle = Math.floor(records.length / 2)
      await append(records.slice(0, middle), firstOrdinal)
      await append(records.slice(middle), firstOrdinal + middle)
      return
    }
    // Fragment a single oversized envelope at byte boundaries. Decode UTF-8 only
    // after all fragments have been verified and joined.
    const parts =
      payload && payload.length <= AUDIT_MAX_BLOB_BYTES
        ? 1
        : Math.ceil(bytes.length / FRAGMENT_BYTES)
    for (let part = 0; part < parts; part++) {
      const raw =
        parts === 1
          ? bytes
          : bytes.slice(part * FRAGMENT_BYTES, (part + 1) * FRAGMENT_BYTES)
      const compressed = parts === 1 ? requireDefined(payload) : await gzip(raw)
      if (compressed.length > AUDIT_MAX_BLOB_BYTES)
        throw new Error('Audit fragment exceeds BLOB limit.')
      chunks.push({
        id: await createHash([summary.id, summary.generation, firstOrdinal, part]),
        releaseId: summary.releaseId,
        actionId: summary.id,
        generation: summary.generation,
        firstOrdinal,
        decisionCount: records.length,
        part,
        parts,
        encoding: 'gzip-json-v1',
        checksum: await auditChecksum(raw),
        payload: compressed,
      })
    }
  }
  for (let ordinal = 0; ordinal < actions.length; ordinal += AUDIT_MAX_DECISIONS) {
    await append(actions.slice(ordinal, ordinal + AUDIT_MAX_DECISIONS), ordinal)
  }
  return chunks
}

async function inflate(chunk: AuditChunk) {
  if (chunk.encoding !== 'gzip-json-v1' || chunk.payload.length > AUDIT_MAX_BLOB_BYTES)
    throw new Error('Invalid audit chunk encoding or size.')
  const reader = new Blob([Uint8Array.from(chunk.payload).buffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader()
  const pieces: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > AUDIT_MAX_JSON_BYTES)
        throw new Error('Audit chunk exceeds decoded byte limit.')
      pieces.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const piece of pieces) {
    bytes.set(piece, offset)
    offset += piece.length
  }
  if ((await auditChecksum(bytes)) !== chunk.checksum)
    throw new Error('Audit chunk checksum mismatch.')
  return bytes
}

export async function decodeAuditChunkParts(chunks: AuditChunk[]) {
  const first = chunks[0]
  if (!first || chunks.length !== first.parts)
    throw new Error('Incomplete audit chunk.')
  const pieces: Uint8Array[] = []
  for (const [index, chunk] of chunks.entries()) {
    if (
      chunk.part !== index ||
      chunk.parts !== first.parts ||
      chunk.firstOrdinal !== first.firstOrdinal ||
      chunk.actionId !== first.actionId ||
      chunk.generation !== first.generation ||
      chunk.decisionCount !== first.decisionCount
    )
      throw new Error('Inconsistent audit chunk fragments.')
    pieces.push(await inflate(chunk))
  }
  const bytes = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0))
  let offset = 0
  for (const piece of pieces) {
    bytes.set(piece, offset)
    offset += piece.length
  }
  const envelope = JSON.parse(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
  ) as Envelope
  if (
    envelope.version !== 1 ||
    !Array.isArray(envelope.summaries) ||
    !Array.isArray(envelope.records) ||
    envelope.records.length !== first.decisionCount
  )
    throw new Error('Invalid audit envelope.')
  return envelope.records.map(
    ([summaryIndex, affectedRecordCount, evidence], index) => {
      const summary = envelope.summaries[summaryIndex]
      if (
        typeof summary !== 'string' ||
        !Number.isSafeInteger(affectedRecordCount) ||
        affectedRecordCount < 0
      )
        throw new Error('Invalid audit decision.')
      return { ...envelope.original?.[index], summary, affectedRecordCount, evidence }
    },
  )
}
