import type { Application } from './types'

/** These views describe actual applications, including exclusions with no field output. */
export function auditView(a: Application) {
  return {
    id: a.id,
    action: a.operation,
    summary: a.summary,
    reason: a.reason,
    outcome: a.outcome,
    origin: a.decision.origin,
    review: a.decision.review,
    inputCount: a.inputs.length,
    effectCount: a.effects.length,
    evidence: a.evidence,
    effects: a.effects,
  }
}

export function curationView(a: Application) {
  return {
    ...a.decision,
    applicationId: a.id,
    outcome: a.outcome,
    reason: a.reason,
    evidence: a.evidence,
  }
}

/** Applied field lineage is a partial API projection; record operations remain in audit. */
export function apiFieldView(applications: Iterable<Application>) {
  return [...applications]
    .filter(a => a.outcome === 'applied' || a.outcome === 'no-change')
    .flatMap(a =>
      a.fields.flatMap(f =>
        f.apiFields.map(apiField => ({
          apiField,
          canonical: f.output,
          inputs: f.inputs,
          operation: a.operation,
          operationVersion: a.operationVersion,
          applicationId: a.id,
          decisionId: a.decision.id,
        })),
      ),
    )
}
