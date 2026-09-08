import {
  retainAuditResult,
  retainObject,
  retainFixturePartitions,
  type AuditGuard,
  type IndividualAudit,
  type ProvenanceStore,
  type RuleDeclaration,
  type ObjectRef,
} from '@repo/core/provenance'
import { retainRegisteredRule } from './retainedRule'

/** Retain executed declarations and reviewed inputs without copying bulk record payloads. */
export async function retainProducerAudit(
  store: ProvenanceStore,
  input: {
    releaseId: string
    datasetCode: string
    rules: Array<{
      declaration: RuleDeclaration
      definition?: ObjectRef
      inputs: Record<string, number>
      outputs: Record<string, number>
      recordsAffected: number
      decisions: Record<string, number>
      outcome?: 'applied' | 'not-applicable' | 'not-run'
      fixtures?: Array<{ type: string; document: unknown; arrayKey: string }>
    }>
    individuals?: Iterable<IndividualAudit> | AsyncIterable<IndividualAudit>
    guards: AuditGuard[]
    apiFields?: unknown
  },
) {
  return retainAuditResult(store, {
    releaseId: input.releaseId,
    datasetCode: input.datasetCode,
    attempt: {
      id: input.releaseId,
      status: input.guards.some(
        g => g.status === 'failed' && g.consequence === 'block-ingestion',
      )
        ? 'failed'
        : 'completed',
    },
    ...(input.apiFields
      ? { apiFields: await retainObject(store, input.apiFields) }
      : {}),
    bulk: await Promise.all(
      input.rules.map(async rule => ({
        id: rule.declaration.id,
        summary: rule.declaration.summary,
        basis: rule.declaration.basis,
        definition:
          rule.definition ?? (await retainRegisteredRule(store, rule.declaration)),
        outcome:
          rule.outcome ??
          (rule.recordsAffected ? ('applied' as const) : ('not-applicable' as const)),
        counts: {
          inputs: rule.inputs,
          outputs: rule.outputs,
          recordsAffected: rule.recordsAffected,
          decisions: rule.decisions,
        },
        fixtures: (
          await Promise.all(
            (rule.fixtures ?? []).map(async fixture =>
              (
                await retainFixturePartitions(store, fixture.document, fixture.arrayKey)
              ).map(part => ({ type: fixture.type, object: part.object })),
            ),
          )
        ).flat(),
      })),
    ),
    individuals: input.individuals ?? [],
    guards: input.guards,
  })
}
