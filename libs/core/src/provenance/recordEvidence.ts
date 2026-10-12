import { hashValue, serialise, readObject } from './objects'
import type { ObjectRef, ProvenanceStore } from './types'

/** The database retains only this immutable locator; the assertion itself lives in R2. */
export async function prepareRecordEvidence<T>(
  collection: string,
  recordId: string,
  evidence: T,
) {
  const document = JSON.parse(
    JSON.stringify({
      kind: 'record-evidence',
      schemaVersion: 1,
      collection,
      recordId,
      evidence,
    }),
  )
  const typedDocument = document as {
    kind: 'record-evidence'
    schemaVersion: 1
    collection: string
    recordId: string
    evidence: T
  }
  const reference: ObjectRef = {
    hash: await hashValue(document),
    byteLength: new TextEncoder().encode(serialise(document)).length,
  }
  return { document: typedDocument, reference }
}

export async function readRecordEvidence(
  store: ProvenanceStore,
  reference: ObjectRef,
  collection: string,
  recordId: string,
) {
  const document = await readObject(store, reference)
  if (
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    document.kind !== 'record-evidence' ||
    document.schemaVersion !== 1 ||
    document.collection !== collection ||
    document.recordId !== recordId
  )
    throw new Error(`Record evidence identity mismatch: ${collection}/${recordId}`)
  return document.evidence
}
