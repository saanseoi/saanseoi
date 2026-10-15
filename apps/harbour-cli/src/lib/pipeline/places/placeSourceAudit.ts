import type { ProvenanceStore } from '@repo/core/provenance'
import { overtureSourceRetentionRule } from '@repo/core/pipeline/services/sources/sourcePayload'
import { retainProducerAudit } from '../../api/producerAudit'

/** SOURCE retention belongs to the resource release, independently of assembly. */
export function retainPlaceSourceAudit(
  store: ProvenanceStore,
  input: {
    resourceReleaseId: string
    datasetCode: string
    retainedCount: number
  },
) {
  const declaration = overtureSourceRetentionRule.declaration
  return retainProducerAudit(store, {
    scope: { stage: 'ingestion', ownerId: input.resourceReleaseId },
    resourceReleaseId: input.resourceReleaseId,
    datasetCode: input.datasetCode,
    rules: [
      {
        declaration,
        inputs: { [declaration.inputs[0]!]: input.retainedCount },
        outputs: { [declaration.outputs[0]!]: input.retainedCount },
        recordsAffected: input.retainedCount,
        decisions: { retained: input.retainedCount },
      },
    ],
    guards: [
      {
        id: 'overture-source-payload-contract',
        summary:
          'Require valid publisher attribution and collision-free retained property names.',
        consequence: 'block-ingestion',
        status: input.retainedCount ? 'passed' : 'not-applicable',
        checked: input.retainedCount,
        failed: 0,
        reason:
          'Retained source payloads passed attribution validation and property-key collision checks.',
      },
    ],
  })
}
