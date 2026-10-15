# Geographic code namespaces and filters

The implementation uses category-wide registry constraints, one shared request resolver
and membership predicates before resource pagination and aggregation. Island assignments
live in `fixtures/meta/divisionCodes/geographic.json`. Serving new assignments requires
registry synchronisation and publication of a Division release.

## Namespaces

Codes are unique within the geographic domain and category, across all classes in that
category. Canonical Division IDs remain relationship keys. Other division domains retain
their own identifiers and code contracts.

| Namespace      | Classes                                                                       | Filters        |
| -------------- | ----------------------------------------------------------------------------- | -------------- |
| Administrative | SAR, area, district                                                           | `adminCode`    |
| Locality       | City, town, village, hamlet                                                   | `localityCode` |
| Hood           | Macrohood, neighbourhood, microhood                                           | `hoodCode`     |
| Landform       | Major island, minor island, islet, island group, and any other landform class | `landformCode` |

`adminCode=HKSAR` selects the entire Hong Kong geographic scope: it does not narrow an
already Hong Kong-only request. `HK`, `KL` and `NT` select the three areas. District
codes share this administrative namespace. `HKSAR` is an explicit SAR assignment in the
geographic fixture.

`localityCode` includes cities, towns, villages and hamlets. `hoodCode` excludes every
locality class. No class parameter is needed with these selectors. A code can occur in
different categories because the filter identifies its namespace. Numeric level is not a
code namespace.

## Island proposals

See [the review table](reviews/island-code-proposals.md) and its adjacent JSON for
canonical IDs and source IDs. Regenerate with:

```sh
bun apps/harbour-cli/scripts/proposeIslandCodes.ts
```

The generator uses the island curation pipeline, corrected polygon areas, canonical
identity selection and the reviewed island-group inventory. It reserves existing
landform assignments and proposes codes only for islands and island groups. Larger
measured individual islands receive conflicting initials first. Unknown areas sort last;
group areas are not measured and groups follow individual islands. Groups receive a `G`
suffix when their preferred code conflicts. Different names expand a word; identical
names use an `X` suffix and remain separate canonical identities. Proposals require name
review before entering the assignment fixture.

Size priority applies when generating new proposals. Geometry refinements must not
reassign accepted codes. Code assignment must validate uniqueness across the whole
landform category, including classes outside this generator's island scope.

## Shared request contract

Use `filter[adminCode]`, `filter[localityCode]`, `filter[hoodCode]` and
`filter[landformCode]` consistently on every public API request that selects resources
with Division relationships, and on the geographic Divisions domain itself. This
includes collection, search, detail, geometry, geocoding and aggregate requests where
the resource has such a relationship. It is not conditional on requesting
`include=divisions`.

Implementation coverage must include:

- Divisions: collections, search, detail and related areas/boundaries; other domains
  such as planning use a geographic crosswalk.
- Places: lists, searches and details with Division membership.
- Addresses: lists, searches, details and related units with inherited membership.
- Streets: every route whose resource exposes Division membership.
- Statistics: observations and aggregates linked to Divisions, including planning
  geographies through a crosswalk.
- Geocoding: forward and reverse candidate selection, before ranking and limiting.

Use one shared schema and code resolver, with explicit resource-specific membership
adapters. Apply predicates before pagination, counts, ranking and aggregation. Include
filters and the selected geographic release in cache keys and pagination context.
Metadata-only requests without a Division relationship do not acquire geographic
filters.

Each selector accepts one code initially; different selectors combine with AND. Resolve
against the selected geographic release. Unknown codes or codes outside a selector's
allowed classes return a validation error; valid codes with no matching resources return
an empty collection. A detail resource excluded by filters returns 404. Never ignore
unsupported filter parameters silently.

For geographic divisions, match the selected division itself and descendants with an
explicit matching relationship. For other resources, match direct or supported inherited
membership. Preserve multiple hierarchy paths; do not invent combinations of ancestors
from unrelated paths. Mere presence of a Division in an included response is not
membership evidence.

## Planning crosswalk

TPU membership requires a versioned many-to-many link to geographic divisions, separate
from its PPU/SPU ancestry. Record both releases, canonical IDs, polygon fingerprints,
containment, overlap area and the fraction of the TPU covered. Derive area membership
through supported district relationships. Hood, locality and landform filters need their
own supported crosswalks or geometry intersections; district membership alone does not
supply them.

Use positive polygon-area overlap with a documented, tested sliver tolerance;
boundary-only contact is not membership. Retain genuine cross-boundary TPUs. Do not use
label points as proof of containment. Geometry release changes invalidate the crosswalk.
Historical TPU releases must identify which geographic release was used. Overlap
fractions must not silently apportion statistical population totals.

## Verification and publication

Category-level uniqueness is validated during registry synchronisation and enforced by
four partial unique indexes. The generated metadata migration preserves populated
assignments and rejects cross-class collisions within a category. Do not assign codes to
other categories as part of the island proposal task.

Test shared resolution, wrong-category codes, self/ancestor membership, multiple paths,
release selection, cross-boundary TPU links, pagination, counts, detail exclusion and
cache separation. Inventory all route variants so no related-resource route omits
filtering. Update API field fixtures, endpoint documentation and the Create a Map
tutorial and coverage matrix when implementation changes their contract.

## Crosswalk preparation

Prepare a crosswalk from exact published releases:

```sh
bun apps/harbour-cli/scripts/prepareGeographicCrosswalk.ts http://localhost:8787 GEOGRAPHIC_RELEASE_SET PLANNING_RELEASE_SET OUTPUT_DIRECTORY
```

The script reads `planning-tpu` polygons and geographic polygons, and writes
`crosswalk.json` and `crosswalk.sql`. Missing TPU polygons block preparation. Missing
geographic polygons are reported explicitly. Inspect that coverage before publication.
The SQL statements must be applied atomically to CURRENT, after its generated migration;
a different content hash for an existing selection is rejected. Retain the JSON artefact
with the release evidence. No source or geographic hierarchy is rewritten.

Containment uses original WGS84 topology. Area measurements use the Hong Kong 1980 Grid
projection. Positive overlaps must exceed one square metre and a source fraction of
`1e-8`; boundary-only contact is excluded. Each link carries exact input geometry hashes
and both Division and DivisionArea snapshot IDs. Codes remain independent of the
relationship keys.

TPU, HMA and New Town requests without the selected source/geographic crosswalk
return 503. Statistics use their explicit planning area-companion domain and cohort;
missing or ambiguous crosswalk selections return 503. These overlaps do not allocate
population. `geographicReleaseSet` pins code resolution; response links retain it and
the code filters, and `X-Geographic-Release-Set` identifies the selection.

For a local target, apply the reviewed artefact after the CURRENT migration:

```sh
bun apps/harbour-cli/scripts/applyGeographicCrosswalk.ts CURRENT_SQLITE_PATH OUTPUT_DIRECTORY/crosswalk.json
```

The importer verifies the artefact hash and policy, runs each statement in one immediate
transaction, and checks membership counts and foreign keys. Back up the target database
using SQLite's backup mechanism before migration or import. `saanseoi init:divisions`
delivers crosswalks for all published native cohorts after Division publication. For a
standalone backfill, run
`saanseoi divisions:crosswalk --target local|preview|production`; it selects published
v0.2 inventories, using exact CURRENT receipts or immutable snapshot-history replay
without requiring an API server. It covers TPU, HMA and all four New Town cohorts,
paired with each published SaanSeoi geographic edition. The API-based script accepts a
source domain as its final argument for individual release pairs. Intersections and
containment use geographic polygons, while Hong Kong grid coordinates measure areas.
Registry synchronisation, Division publication and crosswalk delivery each have their
own readiness checks. Verify the selected release through the public API, then check TPU
collection counts and a cross-boundary TPU against the pinned geographic release. Retain
the pre-operation backup for rollback; restoring it requires stopping writers and
separately reconciling publication metadata and stored release assets.

An explicit district membership takes precedence over inherited membership through a
neighbourhood that spans districts. Geographic targets without polygons cannot acquire
spatial TPU links; the preparation report lists this coverage limitation. A statistics
aggregate with no matching observations retains its route's no-data response.

`GET /divisions/v0.2/crosswalk?sourceReleaseSet=SOURCE_RELEASE_SET&geographicReleaseSet=GEOGRAPHIC_RELEASE_SET`
exposes persisted overlap evidence, policy, content hash and snapshot/geometry pins.
Narrow in either direction with `divisionId` or `geographicDivisionId`; paginate with
`page[limit]` and `page[offset]`. An unavailable pair returns 503; an empty filtered
result in a ready pair returns 200. Crosswalk membership includes overlaps below the
separate 5% covered-area hierarchy threshold.
