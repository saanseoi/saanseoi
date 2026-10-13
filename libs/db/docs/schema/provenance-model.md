# Provenance Model

The versioned provenance path is:

1. `apiReleaseSet`
2. `apiReleaseSetSnapshots`
3. `snapshots`
4. `snapshotResourceReleases`
5. `fieldLineageDefinitions`
6. `apiFieldProvenance`

SaanSeoi tracks provenance at two levels.

## Retained Processing Audits

Table: `processingAudits`

Divisions, Statistics, Addresses and Places retain content-addressed `processing-audit`
manifests in R2. D1 stores the manifest hash, byte length, individual action count and
attempt status, keyed by resource release, lifecycle stage and output owner. Bulk
transformations retain declarations and aggregate counts; reviewed decisions retain
fixture references and selected context. Addresses and Places require registered
provenance before publication, including the supplementary Address release produced by
Places. See the
[processing provenance contract](../../../../docs/datasets/processing-provenance.md).

## Snapshot-Level Provenance

Tables:

- `snapshots`
- `snapshotResourceReleases`

This answers:

- which source releases fed this canonical snapshot

## Snapshot Membership Selection Rules

`snapshotResourceReleases.selectedByRule` identifies why an upstream release belongs to
a snapshot. Names use `<purpose>:<scope>:<policy>:v1`, with lowercase kebab-case within
each part. Purposes are `assembly`, `lookup` and `provenance`. Resolution modes such as
`exact_ref` belong in `selectionMode`. The version identifies the rule semantics.

- `assembly:division:source-release:v1`
- `assembly:division-geometry:source-release:v1`
- `assembly:address:source-release:v1`
- `assembly:division:pland-planning-units:v1`
- `assembly:division:pland-new-towns:v1`
- `assembly:division-statistic:reference-period-release:v1`
- `lookup:division-geometry:division-references:v1`
- `lookup:censtatd-living-quarters:overture-division-references:v1`
- `lookup:address:prepared-division-area:v1`
- `lookup:address:prepared-division:v1`
- `provenance:curated-division:build-inputs:v1`
- `provenance:censtatd-geometry:carried-forward-contributors:v1`
- `provenance:censtatd-geometry:verified-identical-geometry:v1`

`provenance:curated-division:build-inputs:v1` retains the published releases pinned by
the curated archive manifest. Ingestion checks archive keys, hashes, versions and
snapshot pins. API release-set publication requires its Overture Division and Division
Area selections to match these retained inputs.

`provenance:censtatd-geometry:carried-forward-contributors:v1` retains non-lookup
release memberships from the parent companion geometry snapshot as enrichment.
`provenance:censtatd-geometry:verified-identical-geometry:v1` links an additional C&SD
release to an existing snapshot after verifying identical canonical geometry.

Membership selection rules are distinct from snapshot recipe identifiers. Retained
recipe policies and hashes describe the assembly recorded at build time.

## API Field-Level Provenance

Tables:

- `fieldLineageDefinitions`
- `apiFieldProvenance`

This answers:

- which source dataset and field path contributed to an API field
- what resolver logic was used
- what precedence order applied

Scope is per API field, never per entity row. `fieldLineageDefinitions` stores
content-addressed lineage metadata shared by releases that use the same rules.
`apiFieldProvenance` pins one definition per API release set, with a release-specific
`binding`; snapshot membership pins the concrete source inputs. Readers resolve the
release's own pin directly, without inheriting fields through a revision chain.

`apiVersionReleaseSets.previousRevisionApiReleaseSetId` identifies the preceding
revision of the same API version, region, domain and cohort. It supports revision
tracking and rollback selection, not field-provenance inheritance.

Bundled mappings in `fixtures/meta/apiFields/` use the public resource field names and
are named `{apiVersion}@{domainCode}-v{mappingVersion}.json`, using registered domain
codes. `mappingVersion` versions our mapping independently of publisher schemas.
Increment it when retained paths, inputs or transformation semantics materially change.
Compatible upstream changes extend the reviewed coverage of the same mapping version.

`publisherSchemaRanges` declares inclusive `min` and `max` versions for each dataset.
Comparison is numeric by version component; unknown future versions are not implicitly
accepted. `lineageAnchors` declares each snapshot once, without publisher schema
versions. `sourceCompositions` declares the required `datasetCodes` and references
applicable anchors through `anchorSnapshotVersions`. Selection requires a composition
associated with the matching anchor and versions within the declared ranges. Exact
selected publisher versions remain pinned on the published release. The nearest matching
lineage anchor wins, with mapping version breaking equal-depth ties. Only selected
datasets contribute to the published provenance. The resolved mapping has its own
content hash. A fixture match does not imply that every mapped source contributes to
every entity.

Upload preflight checks the incoming dataset schema against these ranges before
confirmation or dispatch, including dry runs and deferred publication. The check does
not widen ranges or substitute for publication's complete composition, lineage and
rule-pin validation. Uncovered API domains remain outside the preflight's scope.

Each fixture declares `publisherFields` once per source dataset. Keys are paths in the
public source record, such as `properties.hkgovCsuId`, `sourceRecordId` or `geometry`;
values are original publisher paths. An array lists alternative publisher locations for
a retained key. Selection and merge behaviour belongs exclusively to processing rules;
this mapping does not duplicate their definitions. Arrays and dictionaries are mapped
once at the parent, such as `properties.divisionIds` → `division_ids` and
`properties.names.common` → `names.common`. Input lookup uses the most specific mapping
and preserves descendant keys and numeric indices, so `[1]` and `.zh-hk` remain part of
the resolved publisher path. Explicit descendant mappings are needed when a child name
differs from the publisher spelling; they override the parent. Alternative publisher
paths each receive the same descendant suffix.

Single-resource fixtures declare `resourceType` once at the top level. Mixed fixtures
use `resources`, each containing one `resourceType` and its `fields`. Authored fields do
not repeat the resource type. The loader expands that scope into publication rows for
identity and lookup. Fields use a resource-relative `apiField`, such as
`attributes.identifiers.hkgovCsuId`. Each input consists of `origin` and `fieldPath`;
source inputs must resolve in the contribution dataset's publisher mapping. Curation
paths use camelCase context names defined in `libs/db/src/apiFieldCurationContexts.ts`,
for example `divisionClassification` maps to the existing `division-classification`
context identifier. Collection contexts remain collections; they do not imply one
curation fixture. Dataset codes and publisher field names inside selectors preserve
their spelling. Registry, curation and intermediate origins identify their own field
paths. Constants carry `value`. The previous address snapshot ID is registry context;
records read from that snapshot are a separate intermediate dependency.

Publication stores the shared mapping once on `apiReleaseSets.publisherFields` and
includes the fixture hash in contribution hashes. Resource type participates in
provenance identity and uniqueness.

Statistics period inputs are dataset-specific: `year`, `PERIOD`, `YEAR` and `QUARTER`,
or release context. Value contributions identify individual publisher fields and their
reviewed curation entries. Dimensions, labels and comparability are attributed to
curation; parsed value kinds are intermediate normalisation results.

A resolver is either a generic operation or an existing processing-rule ID. Publication
resolves non-generic resolvers and supporting `processingRuleIds` exclusively against
definitions captured by the selected resource releases. `resolverRules` pins the
release, rule ID, ruleset version/hash and definition hash. A missing definition blocks
publication; current dataset metadata cannot substitute for the captured release policy.

Checks cover shared mappings and resource-relative locations, fixture hashes, selected
source signatures, rule pins, duplicate contribution identities and public contract
paths. Places resource attributes include registry timestamps and snapshot IDs;
document-level pagination is separate.

Stored fields:

- `apiField`
  - resource-relative contract path such as `attributes.level`
- `resourceType`
  - resource discriminator, stored separately from the field path
- `sourceDatasetId`
  - upstream dataset that may contribute to the API field
- `inputs`
  - ordered publisher, registry, curation, intermediate or constant inputs
- `resolverRules`
  - immutable processing-rule references captured for this publication
- `resolverCode`
  - stable code for the transformation rule, direct copy, lookup, or derivation
- `contributionType`
  - how this provenance row participates in the resolver
- `priority`
  - precedence order within the same API field and contribution group
- `confidence`
  - optional human-maintained confidence score for the mapping

Why these fields are stored this way:

- `inputs`
  - source paths refer to the shared publisher mapping; other origins identify their own
    field paths
- `resolverCode`
  - provenance needs to explain whether the contract field is copied, merged, looked up,
    or derived by a named rule
- `contributionType`
  - a resolver name alone is not enough because the same rule can consume inputs with
    different roles such as `primary`, `fallback`, or `resolver-input`
- `priority`
  - precedence is part of the published behaviour, so it must be visible in provenance
    rather than hidden inside implementation code

## Contribution Types

`contributionType` describes the role played by a provenance row.

- `primary`
  - the normal source for the API field
- `fallback`
  - only used when higher-precedence candidates are empty or unavailable
- `enrichment`
  - adds data beyond the primary source rather than replacing it
- `merge-input`
  - one input among several fields that are merged directly into the final API field
    value
- `resolver-input`
  - one input among several fields consumed by a named resolver that derives a canonical
    API field

Use `resolver-input` when the output field is not copied or merged directly from the
listed source field. Instead, the source field feeds a resolver that performs a
rule-based mapping or derivation.

Examples:

- `division.attributes.level`
  - `subtype` and `class` are `resolver-input` rows for `map_division_level`
- `division.attributes.class`
  - `subtype` and `class` are `resolver-input` rows for `map_division_type`

Do not use `merge-input` for those cases because the API field is not produced by "first
non-empty wins" merging. The resolver examines multiple hints together and emits a
canonical output.

## Resolver Codes

`resolverCode` should describe the actual transformation behaviour, not just the fixture
authoring pattern.

Examples:

- `direct_copy`
  - API field is copied straight from one source field
- `merge_first_non_empty`
  - API field is selected from an ordered list of source candidates
- `map_division_level`
  - canonical numeric division level is derived from Overture division hints
- `map_division_type`
  - canonical division type label is derived from Overture division hints

## Generic operations and retained storage

`lookup_registry` assigns a value from the selected registry context; `constant_value`
assigns a declared literal, including null. `wrap_publisher_sources` places attribution
under its publisher key (`overture` for Overture). `merge_first_non_null` preserves
empty arrays and strings, while `merge_first_non_empty` selects a non-empty candidate.
`derive_release_month` extracts the year-month from a dated release version.
`compose_identifier` concatenates the declared literal and identifier inputs in order.

Retained source properties use collision-checked camelCase names. Locale-bearing labels
end in `En`, `ZhHant` or `ZhHans` and appear last in `publisherFields`, ordered by base
name and then locale. `sourceRecordId` and `geometry` appear first; other properties are
alphabetical. Publisher values, nulls, array order and language dictionary keys remain
intact. Publisher mapping values use the publisher spelling; source inputs use retained
public paths. A change to retained naming requires rebuilding retained source assertions
and their dependent materialisations; publishing a fixture alone does not rewrite them.

The provenance schema migrations target an empty provenance table in a rebuilt
pre-release database. They intentionally do not manufacture provenance from the removed
ambiguous path strings. Existing populated databases require a planned rebuild before
applying these migrations; immutable published releases are not rewritten in place.
