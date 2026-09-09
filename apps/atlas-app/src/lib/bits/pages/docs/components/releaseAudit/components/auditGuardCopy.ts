import { m } from '@repo/i18n/messages'
import type { AuditGuard } from '@repo/core/provenance'

export function guardCopy(guard: AuditGuard) {
  const copy: Record<string, { summary: string; reason: string }> = {
    'als-unique-identities': {
      summary: m.source_audit_als_guard_unique_identities(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-inventory-source': {
      summary: m.source_audit_als_guard_inventory_source(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-inventory-parent': {
      summary: m.source_audit_als_guard_inventory_parent(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-section-ownership': {
      summary: m.source_audit_als_guard_section_ownership(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-shared-inventory-owner': {
      summary: m.source_audit_als_guard_shared_inventory_owner(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-inventory-agreement': {
      summary: m.source_audit_als_guard_inventory_agreement(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-inventory-size': {
      summary: m.source_audit_als_guard_inventory_size(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-coordinate-source': {
      summary: m.source_audit_als_guard_coordinate_source(),
      reason: m.source_audit_als_guard_passed(),
    },
    'als-component-gap': {
      summary: m.source_audit_als_guard_component_gap(),
      reason: m.source_audit_als_guard_passed(),
    },
    'hong-kong-sar-area-district-hierarchy': {
      summary: m.source_audit_guard_hk_hierarchy_summary(),
      reason: m.source_audit_guard_hk_hierarchy_reason(),
    },
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
