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
C&SD Permanent Living Quarters geometry then references those Overture identities rather
than creating parallel divisions. The separate `hkgov-censtatd-hma` domain publishes
C&SD's 173 polygonal Housing Market Areas. Building Groups are not divisions: their
source centroids remain source history for a future buildings projection.

The 2023-H2 C&SD Permanent Living Quarters statistics output maps its source codes to
those stable Overture area identities. Its Area/type polygons join the same
cohort-qualified `hkgov-censtatd` companion as C&SD's annual district polygons; it does
not add a second Geographic division collection. The 2021 HMA statistics output instead
supplies the separate HMA domain's primary canonical division snapshot
(`hkgov-censtatd:2021`), paired with its native `hkgov-censtatd-hma` geometry. Although
the HMA source dataset also publishes statistics, its statistics and its division
geography have distinct snapshot lineages.

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

Historical C&SD district areas are cohort-qualified statistical-geometry companions,
never defaults. The census land-clipped district releases use
`hkgov-censtatd-landclipped`; annual district polygons and C&SD Area/type polygons use
`hkgov-censtatd`. Both keep an explicit snapshot for each source-authorised cohort, even
when its geometry bytes match an earlier cohort. `simplified` is a named 10-metre
display transform of the selected companion snapshot, not an independent composition
member.

The 2016 and 2021 C&SD variants are separate required inputs, not successive revisions
of one source release. Each keeps its own snapshot lineage and remains available when
the other cohort is published. Geometry churn is calculated only against a snapshot's
declared parent; an initial C&SD cohort therefore reports all 18 district areas as
additions and never as removals from another cohort.

For Overture, release audit entries record investigable source-policy exceptions:
division locale inference or API-locale fallback rows, every AI or human name
translation applied to that release, and `CN-GD` spillover geometry excluded from area
or boundary releases. Translation evidence retains the source text, resulting text,
target locale, and parent-division context. It is written into the immutable release
action, so an updated translation fixture never changes the historical audit of an
earlier release. The dataset fixture selects the deterministic bulk operations that
apply to every matching row from a versioned merge ruleset, such as taxonomy-derived
division type/level and hierarchy normalisation. The Sources Audit tab keeps those bulk
rules hidden until requested, so they remain discoverable without obscuring record-level
decisions.

For Hong Kong Overture divisions, locale-less Chinese names—including alternate name
rules—are inferred as `zh-hant`; an explicit source `zh` tag is also normalised to
`zh-hant`.

## Reviewable API name translations

Division imports complete the API's `en`, `zh-hant`, and `zh-hans` name locales only
when a publisher has supplied at least one name. A missing Simplified Chinese value is
translated from Traditional Chinese where available, and vice versa. When no Chinese
name is available, English supplies a missing Chinese value. If both Chinese values are
present but English is absent, Simplified Chinese supplies the English translation.

Overture geographic divisions use one version-controlled translation memory per dataset:
`fixtures/i18n/datasets/<datasetCode>.json`. An entry is identified by its field,
context hash, source locale, source-text hash, and target locale. For divisions, the
context is the parent division ID and English parent name. This avoids re-translating
the same name every month without incorrectly sharing a name whose meaning changes under
a different parent.

Each entry also retains literal `sourceText` and the sorted canonical `recordIds` that
have used it, so a web editor can show the source and link directly to affected
divisions. Those IDs are references, not part of the identity key: the importer resolves
each record through the context-and-source key at import time. Each entry records its
context, provenance (`ai-translated` or `human-translated`), and the first and last
source releases that used it. Fixture review may replace an AI result with a human
translation while retaining the same identity key. Translations are timeless values: a
fixture entry has no validity interval. Releases instead preserve the exact application
that was made in their immutable audit actions.

The older source-release fixture format remains available for Planning Department
division datasets. During the Overture transition, a matching legacy entry seeds the
dataset fixture without calling the translation service again. A later local import
reads the dataset fixture rather than calling the translation service; it may add
missing entries in locale-pair batches, which keeps the generated changes reviewable
before release SQL is used in production.

Only a local import may create a missing fixture entry. A non-local import can use an
existing fixture but fails clearly when an entry is absent. A source that provides codes
without a name is not translated. Locale statistics distinguish publisher-provided,
inferred, AI-translated, and human-translated names as four exclusive categories.
