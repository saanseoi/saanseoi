import type { JsonRecord, ObjectRef } from './types'
import type { BranchCounts, RuleBranch } from './branches'
import classificationPatches from '../../../../fixtures/meta/patches/overture-division-classification.json'
import kowloonPatch from '../../../../fixtures/meta/patches/overture-kowloon-restoration.json'

const registeredPatchOperations = new Set([
  ...classificationPatches.entries.map(entry => entry.id),
  kowloonPatch.id,
])

export type ReviewOrigin =
  | { kind: 'patch' }
  | { kind: 'curation'; guard: Pick<AuditGuard, 'id' | 'summary' | 'consequence'> }

export type RuleDeclaration = {
  kind: 'processing-rule'
  schemaVersion: 1
  id: string
  scope: 'bulk' | 'individual'
  basis: 'code' | 'fixture'
  review?: ReviewOrigin
  summary: string
  inputs: string[]
  outputs: string[]
  parameters: JsonRecord
  dependencyIds?: string[]
  dependencies?: RuleDeclaration[]
  branches?: RuleBranch[]
  implementation: { path: string; symbol: string }
}

/** The declaration and executor share the same immutable parameters. */
export function registerRule<P extends JsonRecord, I, O>(
  declaration: Omit<RuleDeclaration, 'parameters'> & { parameters: P },
  execute: (input: I, parameters: Readonly<P>) => O,
) {
  const frozen = structuredClone(declaration)
  function freeze(value: object) {
    for (const item of Object.values(value))
      if (item && typeof item === 'object') freeze(item)
    Object.freeze(value)
  }
  freeze(frozen)
  return Object.freeze({
    declaration: frozen,
    execute: (input: I) => execute(input, frozen.parameters),
  })
}

export type AuditCounts = {
  inputs: Record<string, number>
  outputs: Record<string, number>
  recordsAffected: number
  decisions: Record<string, number>
  branches?: BranchCounts
}
export type BulkAudit = {
  id: string
  definition: ObjectRef
  basis: 'code' | 'fixture'
  summary: string
  outcome: 'applied' | 'not-applicable' | 'not-run'
  counts: AuditCounts
  fixtures: Array<{ type: string; object: ObjectRef }>
  search?: ObjectRef
}
export type AuditGuard = {
  id: string
  summary: string
  consequence: 'block-ingestion' | 'report'
  status: 'passed' | 'failed' | 'not-applicable' | 'not-run'
  checked: number
  failed: number
  reason: string
}
export type IndividualAudit = {
  review?: ReviewOrigin
  id: string
  operation: string
  basis: 'code' | 'fixture'
  outcome: 'applied' | 'no-change' | 'unmatched' | 'skipped' | 'guard-mismatch'
  summary: string
  reason: string
  definition: ObjectRef
  fixture: { object: ObjectRef; pointer: string } | null
  record: {
    id: string
    names: string[]
    parents: Array<{ id: string; names: string[] }>
  }
  context: JsonRecord
}

/** Presentation categories are independent of whether an instruction uses a fixture. */
export function auditActionCategory(action: IndividualAudit) {
  if (
    action.review?.kind === 'patch' ||
    (!action.review && registeredPatchOperations.has(action.operation))
  )
    return 'patches' as const
  if (/translat/.test(action.operation)) return 'translations' as const
  return action.basis === 'fixture' ? ('curations' as const) : ('rules' as const)
}
export type AuditManifest = {
  kind: 'processing-audit'
  schemaVersion: 1
  releaseId: string
  datasetCode: string
  attempt: { id: string; status: 'completed' | 'failed' }
  bulk: BulkAudit[]
  guards: AuditGuard[]
  individualFixtures?: Array<{ type: string; object: ObjectRef }>
  apiFields?: ObjectRef
  chunks: Array<ObjectRef & { firstOrdinal: number; count: number; index: ObjectRef }>
  applicationCount: number
}
