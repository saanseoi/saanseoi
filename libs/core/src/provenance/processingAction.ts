/** In-memory processing effects used to build retained provenance manifests. */
export type ReleaseProcessingAction = {
  action: string
  affectedRecordCount: number
  evidence: unknown
  mode: 'automatic' | 'manual'
  summary: string
}
