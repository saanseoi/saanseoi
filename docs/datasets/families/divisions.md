# Divisions dataset family

The Divisions API family combines canonical divisions with geometry companions. Geometry
variants are source-specific assertions and are not merged. The family currently
requires a snapshot for each resource type: canonical `division`, `divisionArea`, and
`divisionBoundary`. Required variants of one resource type are alternatives, so at least
one eligible area source is sufficient. An area may be the exact-cohort Overture
snapshot or the latest published HAD snapshot at or before the set cohort; the boundary
requirement currently remains exact-cohort Overture. This lets long-lived authoritative
HAD geometry accompany a newer canonical division release without selecting future data.

Registry codes use lowercase kebab-case even though programmatic resource-type enums use
camelCase. For example, `divisionArea` is encoded as `division-area` and
`divisionBoundary` as `division-boundary`. Dataset and release metadata supply
publisher, resource type, product, and variant directly; publication code must not infer
them by parsing an identifier.

The reusable resource contract and variant rules are documented in
[`divisionGeometry`](../resourceType/divisionGeometry.md) and
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). The Overture and
Home Affairs Department profiles are kept in the provider source folders:

- [`Overture geometry`](../sources/overture/divisionGeometry.md)
- [`Home Affairs Department area`](../sources/hkgov-had/divisionArea.md)
- [`Overture historical reconstructions`](../sources/overture/historicalReconstruction.md)
- [`Planning Department TPU and subunit areas`](../sources/hkgov-pland/divisionArea.md)

Planning Department Planning Units and New Towns are independent API domains, not
optional members of an Overture release. Each domain release contains only snapshots
that can be returned together. Planning-domain canonical rows therefore never need an
Overture cohort in order to be published, and a 2006 planning cohort can be backfilled
even when no 2006 Overture divisions exist. New Town identities are cohort-scoped;
Planning Unit and Overture lineages use persistent identity.

Published domain releases are immutable. Adding another eligible secondary snapshot to
an already published cohort creates the next trailing composition revision (`...-0` to
`...-1`). The publication then creates a family-and-region API catalog revision that
points at the richer release. An older catalog continues pointing at the earlier domain
release, which preserves knowledge-time replay without duplicating canonical rows.

The uploader reports readiness as an `API DOMAIN RELEASE` and reports the catalog
revision created when the domain release becomes publishable. Overture readiness checks
only the Overture composition (including its HAD geometry variant); each Planning
Department domain is checked independently.

The canonical `schemaVersion` may remain unchanged when a new source merely supplies
more values in the same response shape. Merge rulesets are domain-scoped for new
planning releases; the existing Overture ruleset keeps its legacy code. Adding a new
closed-enum domain or include variant is instead an API contract-minor change.

Functional domains are explicit (`administrative`, `planning`, `electoral`, and
`geographic`). A division may have secondary domain memberships, while hierarchy edges
carry domain context so planning or electoral relationships cannot enter the default
administrative traversal accidentally. Cohort keys identify the period selected for a
release; source publication and validity metadata remain provenance.

Canonical division source releases persist locale completeness and churn stats as well
as a district distribution. A district row contributes to itself; every other row is
counted against the `district` entry in its normalized hierarchy. Atlas joins those
canonical identifiers to the HAD district-area geometry for a comparable map across
division datasets.

Historical C&SD district areas are optional, cohort-qualified statistical-geometry
variants (`hkgov-censtatd:2016` and `hkgov-censtatd:2021`), never defaults. Each is
anchored to the earliest published Overture canonical-division snapshot at or after its
census cohort; that immutable anchor provides identity, hierarchy, and names without
representing the C&SD boundary as an evergreen administrative geometry.

For Overture, release audit entries are limited to investigable source-policy
exceptions: division locale inference or API-locale fallback rows, and `CN-GD` spillover
geometry excluded from area or boundary releases. The Sources page hides its Audit tab
when a release has no entries.
