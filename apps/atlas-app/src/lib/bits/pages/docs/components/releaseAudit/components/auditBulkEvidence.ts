import type { BulkAudit } from '@repo/core/provenance'

/** Reuse the release's retained bridge for rules that consume identity mappings. */
export function auditBulkEvidence(bulk: BulkAudit, rules: BulkAudit[]): BulkAudit {
  if (bulk.fixtures.length || !('identity-mappings' in bulk.counts.inputs)) return bulk
  return (
    rules.find(
      rule =>
        rule.id === 'resolve-geography-identities' &&
        rule.fixtures.length > 0 &&
        rule.fixtures.every(fixture => fixture.type === 'identity-mappings'),
    ) ?? bulk
  )
}
