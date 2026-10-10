import type { AuditGuard, RuleDeclaration } from '@repo/core/provenance'
import type { PreparationEvidence } from './preparationAudit'
export const divisionUpdateGuard = {
  id: 'division-source-updates',
  summary: 'Upstream division deletions and name changes require manual review.',
  consequence: 'block-ingestion' as const,
}
export function preparationUpdatePolicy(evidence: PreparationEvidence) {
  const events = evidence.updateDecisions as Array<{ status: string; field: string }>
  const policy = evidence.definitions.updatePolicy as {
    coreLocales: string[]
    excludedNewNamePatterns: string[]
  }
  const count = (status: string) =>
    events.filter(event => event.status === status).length
  const pending = count('pending')
  const checked = events.filter(event =>
    ['keep', 'delete', 'accept', 'pending'].includes(event.status),
  ).length
  const guard: AuditGuard = {
    ...divisionUpdateGuard,
    status: pending ? 'failed' : checked ? 'passed' : 'not-applicable',
    checked,
    failed: pending,
    reason: pending
      ? 'Unreviewed source changes remain.'
      : checked
        ? 'Upstream changes of those kinds (which may include vandalism) will not silently be copied over into this release.'
        : 'No source change requires a manual decision.',
  }
  const declaration: RuleDeclaration = {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'prepare-division-update-policy',
    scope: 'bulk',
    basis: 'code',
    summary:
      'Restore missing accepted names, admit new source divisions and exclude new identities matching the coverage policy.',
    inputs: ['accepted-edition', 'proposed-edition'],
    outputs: ['prepared-edition'],
    parameters: {
      coreLocales: policy.coreLocales,
      excludedNewNamePatterns: policy.excludedNewNamePatterns,
    },
    implementation: {
      path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/updateReview.ts',
      symbol: 'reviewDivisionUpdates',
    },
  }
  return {
    guard,
    rule: {
      declaration,
      inputs: { 'source-changes': events.length },
      outputs: { 'prepared-divisions': evidence.records.length },
      recordsAffected: count('restored') + count('added') + count('excluded'),
      decisions: {
        restored: count('restored'),
        added: count('added'),
        excluded: count('excluded'),
      },
    },
  }
}
