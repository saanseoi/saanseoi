import {
  ProcessingGuardError,
  retainAuditResult,
  type ProvenanceStore,
} from '@repo/core/provenance'
import type { UploadTarget } from '../cli/options'
import { deliverProcessingResult } from './provenance'

/** Retain before stageFailed changes the release status. Never replace a guard error with an upload error. */
export async function retainProcessingFailure(input: {
  error: unknown
  store: ProvenanceStore
  target: UploadTarget
  releaseId: string
  datasetCode: string
}) {
  if (!(input.error instanceof ProcessingGuardError)) return
  const result = await retainAuditResult(input.store, {
    releaseId: input.releaseId,
    datasetCode: input.datasetCode,
    attempt: { id: crypto.randomUUID(), status: 'failed' },
    bulk: [],
    individuals: [],
    guards: input.error.guards,
  })
  try {
    await deliverProcessingResult(input.target, input.store, result.ref)
  } catch (error) {
    throw new AggregateError(
      [input.error, error],
      'Processing guard failed; the audit is retained locally but could not be registered. Retry delivery before resetting this attempt.',
    )
  }
}
