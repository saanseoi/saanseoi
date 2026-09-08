import { m } from '@repo/i18n/messages'
import type { AuditGuard } from '@repo/core/provenance'

export function guardCopy(guard: AuditGuard) {
  const copy: Record<string, { summary: string; reason: string }> = {
    'statistic-reference-period': {
      summary: m.source_audit_guard_period_summary(),
      reason: m.source_audit_guard_period_reason(),
    },
    'statistic-area-companion': {
      summary: m.source_audit_guard_area_summary(),
      reason: m.source_audit_guard_area_reason(),
    },
    'statistic-measure-registration': {
      summary: m.source_audit_guard_measure_summary(),
      reason: m.source_audit_guard_measure_reason(),
    },
    'statistic-measure-localisations': {
      summary: m.source_audit_guard_localisations_summary(),
      reason: m.source_audit_guard_localisations_reason(),
    },
    'statistic-dimension-field-uniqueness': {
      summary: m.source_audit_guard_dimension_summary(),
      reason: m.source_audit_guard_dimension_reason(),
    },
    'unique-statistic-source-identities': {
      summary: m.source_audit_guard_unique_summary(),
      reason: m.source_audit_guard_unique_reason(),
    },
    'statistic-output-source-link': {
      summary: m.source_audit_guard_link_summary(),
      reason: m.source_audit_guard_link_reason(),
    },
    'division-source-identities': {
      summary: m.source_audit_guard_division_id_summary(),
      reason: m.source_audit_guard_division_id_reason(),
    },
    'overture-division-source-assumptions': {
      summary: m.source_audit_guard_assumptions_summary(),
      reason: m.source_audit_guard_assumptions_reason(),
    },
    'division-source-normalisation': {
      summary: m.source_audit_guard_normalisation_summary(),
      reason: m.source_audit_guard_normalisation_reason(),
    },
  }
  const selected = copy[guard.id]
  return {
    checks:
      guard.id === 'overture-division-source-assumptions'
        ? [
            m.source_audit_guard_fixed(),
            m.source_audit_guard_empty(),
            m.source_audit_guard_norms(),
            m.source_audit_guard_hierarchies(),
          ]
        : [],
    summary: selected?.summary ?? guard.summary,
    reason:
      guard.status === 'passed' ? (selected?.reason ?? guard.reason) : guard.reason,
  }
}
