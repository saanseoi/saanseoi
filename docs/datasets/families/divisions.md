# Divisions dataset family

The Divisions API family combines canonical divisions with geometry companions. Geometry
variants are source-specific assertions and are not merged. The family currently
requires canonical `division`, Overture `divisionArea`, Overture `divisionBoundary`, and
the latest published HAD and C&SD district-area snapshots at or before the set cohort.
The boundary requirement remains exact-cohort Overture. This keeps the two authoritative
district-area sources in every Overture release without selecting future data.

Registry codes use lowercase kebab-case even though programmatic resource-type enums use
camelCase. For example, `divisionArea` is encoded as `division-area` and
`divisionBoundary` as `division-boundary`. A dataset describes one publisher product and
declares one or more available resource types; each release records the specific
resource type it materialises. Dataset metadata supplies publisher, product, and source
variant directly; publication code must not infer them by parsing an identifier.

The reusable resource contract and variant rules are documented in
[`divisionGeometry`](../resourceType/divisionGeometry.md) and
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). The Overture and
Home Affairs Department profiles are kept in the provider source folders:

- [`Overture geometry`](../sources/overture/divisionGeometry.md)
- [`Home Affairs Department area`](../sources/hkgov-had/divisionArea.md)
- [`Overture historical reconstructions`](../sources/overture/historicalReconstruction.md)
- [`Planning Department TPU and subunit areas`](../sources/hkgov-pland/divisionArea.md)
- [`LandsD place names`](../sources/hkgov-landsd/placeName.md)

Planning Department Planning Units and New Towns are independent API domains, not
optional members of an Overture release. Each Planning Department source dataset exposes
both `division` and `divisionArea` from the same upstream layer and cohort. Each domain
release contains only snapshots that can be returned together. Planning-domain canonical
rows therefore never need an Overture cohort in order to be published, and a 2006
planning cohort can be backfilled even when no 2006 Overture divisions exist. New Town
identities are cohort-scoped; Planning Unit and Overture lineages use persistent
identity.

Published domain releases are immutable. Adding another eligible secondary snapshot to
an already published cohort creates the next trailing composition revision (`...-0` to
`...-1`). The publication then creates a family-and-region API catalogue revision that
points at the richer release. An older catalogue continues pointing at the earlier
domain release, which preserves knowledge-time replay without duplicating canonical
rows.

The uploader reports readiness as an `API DOMAIN RELEASE` and reports the catalogue
revision created when the domain release becomes publishable. Overture readiness checks
its Overture, HAD, and C&SD composition members; each Planning Department domain is
checked independently.

## Composition-owned ingestion dependencies

The API composition also defines the prerequisites required to materialise its members.
This is intentionally not source-dataset metadata. For the Overture domain, canonical
`division` must be materialised before Overture `divisionArea` or `divisionBoundary` for
the same cohort; the Planning Unit and New Town areas similarly require their domain's
canonical division. `saanseoi update` expands the requested family with these providers
and performs them in dependency order. The resulting geometry snapshot records the exact
selected division source release as a lookup input, preserving replayable provenance
without duplicating the dependency declaration in each source fixture.

The canonical `schemaVersion` may remain unchanged when a new source merely supplies
more values in the same response shape. Merge rulesets are domain-scoped for new
planning releases; the existing Overture ruleset keeps its legacy code. Adding a new
closed-enum domain or include variant is instead an API contract-minor change.

Functional domains are explicit (`administrative`, `planning`, `electoral`, and
`geographic`). A division may have secondary domain memberships, while hierarchy edges
carry domain context so planning or electoral relationships cannot enter the default
administrative traversal accidentally. Cohort keys identify the period selected for a
release; source publication and validity metadata remain provenance.

The LandsD Place Name database is registered as the separate `hkgov-landsd` geographic
domain because its settlement points are an alternative primary division collection, not
an Overture geometry companion. Only `PLACE_CLASS=Settlement` records belong in that
division domain. Its Hydrographic and Topographic records remain source data for a
future government place-name projection; they should not be forced into the divisions
taxonomy.

All division geometry uploads calculate their canonical WGS84 bbox directly from the
normalised geometry. Canonical geometry and bbox are persisted only in history and
current; source assertions retain publisher evidence, while named source derivatives
retain their explicit transform output. Upstream bbox fields are not trusted as
persisted geometry extents.

Canonical division source releases persist locale completeness and churn stats as well
as a district distribution. A district row contributes to itself; every other row is
counted against the `district` entry in its normalised hierarchy. Atlas joins those
canonical identifiers to the HAD district-area geometry for a comparable map across
division datasets.

Historical C&SD district areas are required, cohort-qualified statistical-geometry
variants, never defaults. Each census cohort has an exact source variant
(`hkgov-censtatd:2016` or `hkgov-censtatd:2021`). The `simplified` geometry is a named
display transform on that source variant, requested as
`areas:hkgov-censtatd:<cohort>&transform=simplified`; it is not an independent
composition member. Both source cohorts are required inputs to each Overture release, so
their source-schema versions are always present in API-field provenance and only one
mapping is needed for each Overture schema range.

The 2016 and 2021 C&SD variants are separate required inputs, not successive revisions
of one source release. Each keeps its own snapshot lineage and remains available when
the other cohort is published. Geometry churn is calculated only against a snapshot's
declared parent; an initial C&SD cohort therefore reports all 18 district areas as
additions and never as removals from another cohort.

For Overture, release audit entries are limited to investigable source-policy
exceptions: division locale inference or API-locale fallback rows, and `CN-GD` spillover
geometry excluded from area or boundary releases. The Sources page hides its Audit tab
when a release has no entries.

For Hong Kong Overture divisions, locale-less Chinese names—including alternate name
rules—are inferred as `zh-hant`; an explicit source `zh` tag is also normalised to
`zh-hant`.
