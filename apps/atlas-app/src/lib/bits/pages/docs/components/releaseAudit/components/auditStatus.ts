import { m } from '@repo/i18n/messages'

export function auditStatus(status: string): string {
  switch (status) {
    case 'not-recorded':
      return m.source_audit_not_recorded()
    case 'no-matches':
      return m.source_audit_rule_no_matches()
    case 'applied':
      return m.source_audit_applied()
    case 'no-change':
      return m.source_audit_no_change()
    case 'skipped':
    case 'not-applicable':
    case 'not-run':
      return m.source_audit_skipped()
    case 'unmatched':
      return m.source_audit_unmatched()
    case 'guard-mismatch':
      return m.source_audit_guard_mismatch()
    case 'passed':
      return m.source_audit_passed()
    case 'failed':
      return m.source_audit_failed()
    default:
      return status
  }
}
