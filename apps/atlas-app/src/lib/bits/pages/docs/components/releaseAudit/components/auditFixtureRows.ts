import { m } from '@repo/i18n/messages'
export const auditBulkTitle = (id: string) =>
  ({
    'curate-statistic-fields': m.source_audit_statistic_field_mappings(),
    'resolve-geography-identities': m.source_audit_identity_bridge(),
    'normalise-censtatd-statistics': m.source_audit_observation_normalisation(),
    normalise_censtatd_population_thousands_to_persons:
      m.source_audit_population_unit_conversion(),
  })[id] ?? id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
export * from '@repo/core/provenance/auditFixtureRows'
