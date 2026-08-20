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

The default `geographic` domain retains Overture as its primary provider variant, rather
than using the provider name as the domain identity. If Overture omits Hong Kong Island,
Kowloon, or the New Territories, ingestion synthesises their level-1 `area` identities
from the configured district members. Every one of those recognised areas receives a
derived Overture `divisionArea` union when Overture omits its own area geometry, even if
Overture does provide the division identity itself. Those reviewed identities retain
their Wikidata identifiers: Hong Kong Island (`Q3248921`), Kowloon (`Q239143`) and the
New Territories (`Q596660`). Kowloon reuses Overture's historic division ID
`17009785-57fd-4e5b-af86-2d27352e4718`; it is never assigned a SaanSeoi replacement.
C&SD Area/type geometry then references those Overture identities rather than creating
parallel divisions. The separate `hkgov-censtatd-hma` domain publishes C&SD's 173
polygonal Housing Market Areas. Building Groups are not divisions: their source
centroids remain source history for a future buildings projection.

The 2023-H2 C&SD Area/type statistics output maps its source codes to those stable
Overture area identities. It is a required member of each publishable Geographic release
set, while remaining an explicitly selected `divisionArea` response variant through
`include=areas:hkgov-censtatd-area`; it never adds a second Geographic division
collection. The 2021 HMA statistics output instead supplies the separate HMA domain's
primary canonical division snapshot (`hkgov-censtatd:2021`), paired with its native
`hkgov-censtatd-hma` geometry.

Planning Department Planning Units and New Towns are independent API domains, not
optional members of the Geographic release. Each Planning Department source dataset
exposes both `division` and `divisionArea` from the same upstream layer and cohort. Each
domain release contains only snapshots that can be returned together. Planning-domain
canonical rows therefore never need an Overture cohort in order to be published, and a
2006 planning cohort can be backfilled even when no 2006 Overture divisions exist. New
Town identities are cohort-scoped; Planning Unit and Overture lineages use persistent
identity. Updater-driven Planning Department intake verifies the mirrored archive's
managed key and SHA-256 before parsing it.

Published domain releases are immutable. Adding another eligible secondary snapshot to
an already published cohort creates the next trailing composition revision (`...-0` to
`...-1`). The publication then creates a family-and-region API catalogue revision that
points at the richer release. An older catalogue continues pointing at the earlier
domain release, which preserves knowledge-time replay without duplicating canonical
rows.

The uploader reports readiness as an `API DOMAIN RELEASE` and reports the catalogue
revision created when the domain release becomes publishable. Geographic readiness
checks its Overture, HAD, and C&SD composition members; each Planning Department domain
is checked independently.

## Composition-owned ingestion dependencies

The API composition also defines the prerequisites required to materialise its members.
This is intentionally not source-dataset metadata. For the Geographic domain, canonical
`division` must be materialised before Overture `divisionArea` or `divisionBoundary` for
the same cohort; the Planning Unit and New Town areas similarly require their domain's
canonical division. `saanseoi update` expands the requested family with these providers
and performs them in dependency order. The resulting geometry snapshot records the exact
selected division source release as a lookup input, preserving replayable provenance
without duplicating the dependency declaration in each source fixture.

## Bootstrap recovery

`saanseoi update --target <environment> --api-family divisions --download --yes` reads
the selected environment's release report before choosing source work. A successful
report is authoritative: saved local check state never represents a source release that
the environment has not reported. An empty Geographic report rebuilds the current
Overture STAC release and the retained Overturist archive catalogue in release order.
C&SD district areas are independently keyed by their 2016 and 2021 cohorts, so an
interrupted bootstrap rebuilds only an absent cohort; a cohort already reported by the
target is not selected again. This lets the command resume safely after interruption
without re-publishing completed source releases.

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

Source-specific aggregate geometry canonicalisation is permitted only when its provider
profile documents the triggering topology condition and the source assertions remain
unchanged. The Planning Department 2021 TPU aggregate uses this policy for coincident
geometry fragments and boundaries that a pairwise overlay cannot node.

Canonical division source releases persist locale completeness and churn stats as well
as a district distribution. A district row contributes to itself; every other row is
counted against the `district` entry in its normalised hierarchy. Atlas joins those
canonical identifiers to the HAD district-area geometry for a comparable map across
division datasets.

Geometry releases additionally persist release-owned district geometry facts from the
exact canonical EPSG:4326 snapshot: features, Polygon/MultiPolygon parts, area, boundary
segments, and boundary length. A boundary segment is a non-zero coordinate-to-coordinate
edge across every exterior or interior polygon ring, or every boundary line. It
indicates geometric complexity rather than positional accuracy; an exact C&SD release
and its `simplified` display derivative therefore never share or replace these
measurements.

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

For Overture, release audit entries record investigable source-policy exceptions:
division locale inference or API-locale fallback rows, and `CN-GD` spillover geometry
excluded from area or boundary releases. The dataset fixture selects the deterministic
bulk operations that apply to every matching row from a versioned merge ruleset, such as
taxonomy-derived division type/level and hierarchy normalisation. The Sources Audit tab
keeps those bulk rules hidden until requested, so they remain discoverable without
obscuring record-level decisions.

For Hong Kong Overture divisions, locale-less Chinese names—including alternate name
rules—are inferred as `zh-hant`; an explicit source `zh` tag is also normalised to
`zh-hant`.
