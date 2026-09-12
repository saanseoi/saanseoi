import { m } from '@repo/i18n/messages'

/** Plain-language presentation for retained processing-rule identifiers. */
const copy = (): Record<string, { title: string; summary: string }> => ({
  'curate-als-addresses': {
    title: m.source_audit_rule_address_curation_title(),
    summary: m.source_audit_rule_address_curation_summary(),
  },
  map_censtatd_district_code_to_canonical_division: {
    title: m.source_audit_rule_district_match_title(),
    summary: m.source_audit_rule_district_match_summary(),
  },
  normalise_censtatd_population_thousands_to_persons: {
    title: m.source_audit_rule_population_conversion_title(),
    summary: m.source_audit_rule_population_conversion_summary(),
  },
  normalise_censtatd_statistic_source_assertion: {
    title: m.source_audit_rule_statistic_check_title(),
    summary: m.source_audit_rule_statistic_check_summary(),
  },
  'normalise-division-area-geometry': {
    title: m.source_audit_rule_division_area_title(),
    summary: m.source_audit_rule_division_area_summary(),
  },
  'normalise-division-boundary-geometry': {
    title: m.source_audit_rule_division_boundary_title(),
    summary: m.source_audit_rule_division_boundary_summary(),
  },
  'apply-division-classification-patch': {
    title: m.source_audit_rule_division_type_title(),
    summary: m.source_audit_rule_division_type_summary(),
  },
  'exclude-division-geometry': {
    title: m.source_audit_rule_geometry_exclusions_title(),
    summary: m.source_audit_rule_geometry_exclusions_summary(),
  },
  'normalise-divisions': {
    title: m.source_audit_rule_divisions_title(),
    summary: m.source_audit_rule_divisions_summary(),
  },
  'apply-division-name-translation': {
    title: m.source_audit_rule_division_names_title(),
    summary: m.source_audit_rule_division_names_summary(),
  },
  'resolve-geography-identities': {
    title: m.source_audit_rule_geography_match_title(),
    summary: m.source_audit_rule_geography_match_summary(),
  },
  'resolve-place-addresses': {
    title: m.source_audit_rule_place_addresses_title(),
    summary: m.source_audit_rule_place_addresses_summary(),
  },
  'select-place-countries': {
    title: m.source_audit_rule_place_countries_title(),
    summary: m.source_audit_rule_place_countries_summary(),
  },
  'normalise-overture-places': {
    title: m.source_audit_rule_places_title(),
    summary: m.source_audit_rule_places_summary(),
  },
  'normalise-planning-divisions': {
    title: m.source_audit_rule_planning_divisions_title(),
    summary: m.source_audit_rule_planning_divisions_summary(),
  },
  'curate-statistic-fields': {
    title: m.source_audit_rule_statistic_fields_title(),
    summary: m.source_audit_rule_statistic_fields_summary(),
  },
  'apply-statistic-localisation': {
    title: m.source_audit_rule_statistic_wording_title(),
    summary: m.source_audit_rule_statistic_wording_summary(),
  },
  'normalise-censtatd-statistics': {
    title: m.source_audit_rule_statistics_title(),
    summary: m.source_audit_rule_statistics_summary(),
  },
  overture_hong_kong_area_synthesised: {
    title: m.source_audit_rule_hong_kong_area_title(),
    summary: m.source_audit_rule_hong_kong_area_summary(),
  },
  decode_wkb_geometry_to_geojson: {
    title: m.source_audit_rule_map_shapes_title(),
    summary: m.source_audit_rule_map_shapes_summary(),
  },
})

export const auditRuleCopy = (id: string) => copy()[id]
