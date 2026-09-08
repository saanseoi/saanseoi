/** Retained effects are the replay contract. Producer software is not required. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonRecord = { [key: string]: Json }
export type Digest = `sha256:${string}`
export type ObjectRef = { hash: Digest; byteLength: number }
export type RecordKey = { collection: string; id: string }
export type RecordRef = RecordKey & { hash: Digest }

export type Collection = {
  id: string
  layer: 'source' | 'canonical'
  datasetCode: string
  releaseId: string
  snapshotId: string | null
  schema: string
}

export type FieldLineage = {
  output: { collection: string; path: string }
  inputs: Array<{ collection: string; path: string }>
  /** Explicit API projection; absent for fields that are not served. */
  apiFields: string[]
}

export type Decision = {
  id: string
  revision: number
  origin: 'human' | 'rule' | 'model'
  review: 'approved' | 'unreviewed'
  /** Complete frozen decision, including parameters and applicability guards. */
  definition: ObjectRef
}

export type Effect = {
  target: RecordKey
  /** null asserts that the target does not exist. */
  before: Digest | null
  /** null excludes/removes an output; otherwise the object contains its full value. */
  after: ObjectRef | null
}

export type Application = {
  schemaVersion: 1
  kind: 'processing-application'
  id: string
  operation: string
  operationVersion: number
  outcome: 'applied' | 'no-change' | 'guard-mismatch' | 'deferred'
  summary: string
  reason: string
  decision: Decision
  inputs: RecordRef[]
  effects: Effect[]
  evidence: Array<{
    object: ObjectRef
    role: string
    /** JSON Pointer into the retained evidence object, or empty for the whole object. */
    pointer: string
  }>
  fields: FieldLineage[]
}

export type ApplicationChunk = {
  schemaVersion: 1
  kind: 'processing-applications'
  applications: Application[]
}

export type ProcessingManifest = {
  schemaVersion: 1
  kind: 'processing-result'
  releaseId: string
  collections: Collection[]
  /** Ordered chunks define execution order. No producer code is invoked on replay. */
  chunks: Array<ObjectRef & { firstOrdinal: number; count: number }>
  applicationCount: number
  /** All dependencies, including record values and evidence, must be retained. */
  objects: ObjectRef[]
  summaries: Array<{
    operation: string
    outcome: Application['outcome']
    applicationCount: number
    effectCount: number
  }>
}

export type ProvenanceStore = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  put(key: string, value: ArrayBuffer): Promise<unknown>
}
