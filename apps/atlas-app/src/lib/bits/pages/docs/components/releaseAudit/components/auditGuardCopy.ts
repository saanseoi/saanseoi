import { m } from '@repo/i18n/messages'
import type { AuditGuard } from '@repo/core/provenance'

export function guardCopy(guard: AuditGuard) {
  const copy: Record<string, { summary: string; reason: string }> = {
    'prepared-division-identities': {
      summary: 'Every prepared division has a unique identity.',
      reason: 'There are no duplicated records.',
    },
    'prepared-ancestor-references': {
      summary: 'Every prepared ancestor refers to an output division.',
      reason: 'The hierarchy ancestry can be fully resolved in this release.',
    },
    'division-source-updates': {
      summary: 'Upstream division deletions and name changes require manual review.',
      reason:
        'Upstream changes of those kinds (which may include vandalism) will not silently be copied over into this release.',
    },
    'historical-country-reference-evidence': {
      summary: m.source_audit_guard_historical_country_summary(),
      reason: m.source_audit_guard_historical_country_reason(),
    },
    'source-api-field-compatibility': {
      summary: m.source_audit_guard_source_schema_summary(),
      reason: guard.reason?.includes('revalidatedAt')
        ? m.source_audit_guard_source_schema_historical_reason()
        : m.source_audit_guard_source_schema_reason(),
    },
    'native-source-records-retained': {
      summary: m.source_audit_guard_native_retained_summary(),
      reason: m.source_audit_guard_native_retained_reason({ count: guard.checked }),
    },
    'native-source-row-count': {
      summary: m.source_audit_guard_native_import_summary(),
      reason: m.source_audit_guard_native_import_reason(),
    },
    'overture-source-payload-contract': {
      summary: m.source_audit_guard_source_payload_summary(),
      reason: m.source_audit_guard_source_payload_reason(),
    },
    'source-geometry-division-references': {
      summary: m.source_audit_guard_source_references_summary(),
      reason: m.source_audit_guard_source_references_reason(),
    },
    'overture-country-reference': {
      summary: m.source_audit_guard_country_reference_summary(),
      reason: m.source_audit_guard_country_reference_reason(),
    },
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
  const plain = (text: string | undefined) =>
    text
      ?.replace(/^Checked during backfill against frozen preparation evidence\.\s*/, '')
      .replaceAll('retained active boundary', 'active boundary')
      .replaceAll('retained boundary', 'boundary')
      .replaceAll('retained records', 'records')
      .replaceAll('retained evidence', 'source change')
      .replaceAll('recognised Area', 'Area')
      .replaceAll('recognised Hong Kong area', 'Hong Kong area')
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
    summary: plain(selected?.summary ?? guard.summary)!,
    reason: plain(
      guard.status === 'passed' ? (selected?.reason ?? guard.reason) : guard.reason,
    ),
  }
}
