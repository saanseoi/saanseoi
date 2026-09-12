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
    // Delivery failure must not prevent the caller from recording stageFailed.
    // The original guard remains the error that terminates processing.
    console.warn(
      `${input.error.message} Audit delivery failed: ${error instanceof Error ? error.message : String(error)}. The audit is retained locally; retry delivery before resetting this attempt.`,
    )
  }
}
