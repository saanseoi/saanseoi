# Division geometry and provider variants

This is the source-neutral contract for adding geometry to the Divisions API family.
Provider observations belong in `docs/datasets/sources/<provider>/`; this document
defines the behaviour that every adapter must implement.

## Logical resources and variants

`divisionArea` and `divisionBoundary` are logical resource types. A provider variant is
identified by `(resourceType, providerCode, sourceRelease, cohortKey)` and is retained
as an independent assertion. Geometry is not merged across providers: differing legal
definitions, identifiers, vintages, scale, CRS, or generalisation must remain auditable.

Each API release set has a configured default variant for each relationship. A bare
`areas` or `boundaries` include resolves that default; a qualified include selects a
registered provider (`areas:<provider>` or `boundaries:<provider>`). Unknown,
unavailable, or incompatible variants are client errors and must not silently fall back.

## Source contract

Every source adapter documents and validates:

- the catalogue/service URL, download format, publisher, licence, source release and
  schema version;
- the source identifier and any identifier components needed for a bridge;
- source CRS, transformation to the canonical API CRS, dimensionality and geometry union
  accepted by that provider;
- null, empty, invalid-ring, self-intersecting, and out-of-extent policies;
- source attributes retained verbatim in `rawProperties`, including source validity
  periods and provenance timestamps;
- deterministic geographic filters and explicit allowlists for exceptional records;
- feature counts and geometry-type distributions measured from the downloaded artifact.

The adapter must preserve source geometry and source attributes in the source layer,
even when canonical geometry is transformed or fields are normalized. Invalid geometry
is rejected; repair is an explicit, separately reviewed policy.

## Canonical tables

Source tables follow the family’s source schema conventions (`sourceRecordId`, source
versioning, raw properties, provenance and source version). Canonical history/current
tables use the same ordering and version-management fragments as `division`.

An area row contains an `id`, `divisionId`, `bbox`, canonical geometry, `sourceKeys`,
source provenance, normalized `type`, and land/territorial flags. A boundary row
contains an `id`, ordered `leftDivisionId` and `rightDivisionId`, `bbox`, canonical
geometry, `sourceKeys`, source provenance, normalized `type`, and the same flags.
Providers may add source-specific keys, but canonical columns must not be silently
overloaded.

`sourceKeys` is the compatibility bridge to source versions, classifications and
external identifiers. Canonical divisions should expose reverse identifiers in their
`identifiers` object when a provider bridge exists.

## Domains, identity and hierarchy

Use a controlled functional domain such as `administrative`, `planning`, `electoral`, or
`geographic`; retain each provider’s raw classification separately. A division has one
primary domain per dataset and may have explicit secondary memberships. Domain and
relationship context are properties of hierarchy edges, so default administrative
traversal cannot accidentally include planning or electoral edges.

`cohortKey` identifies the source period used for selection and identity. It is separate
from publication timestamps and release ingestion metadata. If a source later exposes a
validity interval that cannot be represented by a cohort, add an explicit period object
without changing the source release identity.

## Cohorts, shards and bridges

Geometry uploads must reference the exact cohort of the anchored division snapshot. The
release set is publishable only when all family-required snapshots are present; optional
provider variants may be added without replacing required members.

Provider identifiers must be resolved through a versioned bridge table/fixture keyed by
authority, domain, cohort and external identifier. Ambiguous or missing mappings block
publication. Sparse pre-2025 periods may use explicit `SOURCE_BEFORE` and
`HISTORY_BEFORE` shard assignments; `CURRENT` contains only the selected latest
snapshot.

## CSDI catalogue planning registry

The following catalogue periods are planned source releases, not part of the current
Home Affairs Department District Boundary release. They are deliberately recorded here
as a cross-provider registry: the publisher is significant and must determine the
dataset code, bridge authority, release identity and source documentation. All observed
layers use Polygon/MultiPolygon geometry in EPSG:2326.

| Publisher     | Domain    | Period    | Catalogue code                  | Layer           | Features |
| ------------- | --------- | --------- | ------------------------------- | --------------- | -------: |
| `hkgov-pland` | planning  | 2001      | `pland_rcd_1636535158118_80594` | `TPUSBVC_2001`  |    4,636 |
| `hkgov-pland` | planning  | 2006      | `pland_rcd_1636535383021_30595` | `TPUSBVC_2006`  |    4,800 |
| `hkgov-pland` | planning  | 2011      | `pland_rcd_1634025118087_40967` | `TPUSBVC_2011`  |    4,815 |
| `hkgov-pland` | planning  | 2016      | `pland_rcd_1634281887222_15002` | `TPUSBVC_2016`  |    4,863 |
| `hkgov-pland` | planning  | 2021      | `pland_rcd_1637289585582_55577` | `TPU`           |      292 |
| `hkgov-eac`   | electoral | 2007      | `reo_rcd_1634529766624_18578`   | `DCCA2007`      |      405 |
| `hkgov-eac`   | electoral | 2011      | `reo_rcd_1632903014420_3162`    | `DCCA2011`      |      412 |
| `hkgov-eac`   | electoral | 2015      | `reo_rcd_1632902778771_91842`   | `DCCA2015`      |      431 |
| `hkgov-eac`   | electoral | 2023      | `reo_rcd_1634528082461_24797`   | `DCGC_2023`     |       44 |
| `hkgov-had`   | electoral | 2019–2022 | `had_rcd_1699500451584_93029`   | `RRE2019_Final` |      697 |
| `hkgov-had`   | electoral | 2023–2026 | `had_rcd_1634522917609_57950`   | `Village_2023`  |      697 |
| `hkgov-had`   | electoral | 2027–2030 | `had_rcd_1698201058480_40217`   | `Village_2027`  |      697 |

Use source release identifiers `hkgov-had-{year}-divisionArea-rre`,
`hkgov-pland-{year}-divisionArea-pu`, and `hkgov-eac-{year}-divisionArea-dcgc` for these
future periods. The year token is the data period, not the catalogue metadata revision
date. Each provider must have its own source profile and bridge authority; these
catalogue rows must not be attributed to `hkgov-had` merely because they are hosted by
the same CSDI portal.

For sparse periods before 2025, route source and history records to explicit
`SOURCE_BEFORE` and `HISTORY_BEFORE` shards while `CURRENT` retains only the selected
latest snapshot. Bridge fixtures remain keyed by authority, domain, cohort and external
identifier; ambiguous mappings block publication. Canonical divisions may expose reverse
keys such as `{ "HAD:AREA_ID": "A", "HAD:AREA_CODE": "CW" }`.

## Ingestion and observability

An upload performs schema inspection, source-specific preflight, deterministic
filtering, geometry validation/transformation, bridge resolution, normalization,
hashing, source and history advancement, current snapshot cloning, and release-set
compatibility checks. Shared SQL/versioning logic should be reused; area/boundary
relationship normalization stays in separate adapters.

Each ingest emits stats for accepted records, geometry types, normalized type/flag
combinations, bridge coverage, and changed/unchanged/deleted rows. Rejections and
source-quality diagnostics remain visible in processing output and must identify the
source, cohort, geometry type, and reason, even when they are not persisted as release
stats.

## Fixtures, API fields and migrations

Adding a provider requires the dataset, publisher, release-note, API composition and
API-field fixtures, plus bridge fixtures where external identifiers are used. Fixture
hashes must be regenerated by the repository tooling.

The API exposes sparse geometry through opt-in plural relationships (`areas` and
`boundaries`) and supports qualified provider variants. Update response schemas,
relationship paths, serializers, query planning, deduplication and unknown-variant
errors together.

Add source/history/current schema and indexes using the repository migration generator;
never hand-edit migration snapshots. Verify generated migrations, fixture hashes,
preflight/normalizer/stats tests, exact-cohort assembly, rollback and API include tests.
