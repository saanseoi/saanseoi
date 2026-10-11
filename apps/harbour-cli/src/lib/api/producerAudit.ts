import type { AuditScope } from '@repo/core/provenance'
import {
  retainAuditResult,
  retainObject,
  retainFixturePartitions,
  type AuditGuard,
  type BranchCounts,
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
    scope: AuditScope
    resourceReleaseId: string
    datasetCode: string
    rules: Array<{
      scope?: AuditScope
      declaration: RuleDeclaration
      definition?: ObjectRef
      inputs: Record<string, number>
      outputs: Record<string, number>
      recordsAffected: number
      decisions: Record<string, number>
      branches?: BranchCounts
      outcome?: 'applied' | 'not-applicable' | 'not-run'
      fixtures?: Array<{ type: string; document: unknown; arrayKey: string }>
    }>
    individuals?: Iterable<IndividualAudit> | AsyncIterable<IndividualAudit>
    individualScope?: AuditScope
    guards: Array<AuditGuard & { scope?: AuditScope }>
    apiFields?: unknown
  },
) {
  const key = (scope: AuditScope) => JSON.stringify(scope)
  const groups = new Map<string, typeof input>()
  const group = (scope: AuditScope) => {
    const id = key(scope)
    if (!groups.has(id))
      groups.set(id, {
        ...input,
        scope,
        rules: [],
        guards: [],
        individuals: [],
        apiFields: key(scope) === key(input.scope) ? input.apiFields : undefined,
      })
    return groups.get(id)!
  }
  group(input.scope)
  for (const { scope = input.scope, ...rule } of input.rules)
    group(scope).rules.push(rule)
  for (const { scope = input.scope, ...guard } of input.guards)
    group(scope).guards.push(guard)
  group(input.individualScope ?? input.scope).individuals = input.individuals ?? []
  const retained = []
  for (const value of groups.values())
    retained.push(await retainSingleAudit(store, value))
  return { ...retained[0]!, additional: retained.slice(1) }
}

async function retainSingleAudit(
  store: ProvenanceStore,
  input: Parameters<typeof retainProducerAudit>[1],
) {
  return retainAuditResult(store, {
    scope: input.scope,
    resourceReleaseId: input.resourceReleaseId,
    datasetCode: input.datasetCode,
    attempt: {
      id: input.resourceReleaseId,
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
          ...(rule.branches ? { branches: rule.branches } : {}),
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
