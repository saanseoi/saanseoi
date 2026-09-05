# Adding a data source — implementation plan for the next dataset

For the end-to-end implementation route and the ownership of DataOps, `saanseoi update`,
upload dispatch, schemas and fixtures, start with the
[dataset pipeline](../pipeline.md). This page remains a detailed design checklist for
the early source-modelling decisions.

This document is a reusable planning checklist for an LLM or engineer adding a new
source to an existing dataset family. It deliberately contains no provider-specific
feature counts, URLs, field quirks, or quality findings. Those facts belong in the
provider folder and are linked from the checklist below.

## Where each decision belongs

Keep the plan small and route detail to the document that owns it:

| Question                                                                           | Location                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| What did the provider publish? URLs, licence, schema, CRS, fields, counts, defects | `docs/datasets/sources/<provider>/`        |
| What does the logical resource mean? ownership, required fields, includes          | `docs/datasets/resourceType/<resource>.md` |
| Which resources make a family/release set? required snapshots and defaults         | `docs/datasets/families/<family>.md`       |
| What is normative for schema, identity, API, cohorts, bridges and variants?        | `spec/`                                    |
| How is it implemented? source schema, processor, CLI, fixtures and migrations      | repository code and fixture folders        |
| What changed for users? release notes and dataset metadata                         | `fixtures/meta/`                           |

Start by reading the family/resource contract and the relevant provider profile. Do not
copy provider observations into this file; link to them instead. This keeps future
source additions reviewable and prevents an old source profile from becoming an
accidental global rule.

Current examples:

- [Overture geometry profile](../sources/overture/divisionGeometry.md)
- [Home Affairs Department area profile](../sources/hkgov-had/divisionArea.md)
- [geometry resource contract](../resourceType/divisionGeometry.md)
- [Divisions family policy](../families/divisions.md)
- [normative geometry contract](../../../spec/divisions-geometry.md)

## 1. Inventory the provider artefact

Record in the provider document:

- catalogue page, direct download/service URL, publisher, licence and attribution;
- file/service format, layer name, source release identifier and schema version;
- publication, revision and effective/validity dates;
- observed feature count, geometry-type distribution, extent and CRS;
- source fields, nullability, units, identifier semantics and any source invariants;
- whether the artefact is a complete snapshot or a delta.

Download a representative artefact and inspect it with the same tools used by the
importer (for example DuckDB for parquet or a GeoJSON/GeoPackage reader for vector
services). Print the profile and retain reproducible queries or checks in the provider
document. If an upstream defect is found, record the affected IDs and the decision to
retain, reject, or repair them there—not in this generic plan.

## 2. Identify the logical resource and provider variant

Decide whether the data is a new logical resource type or a variant of an existing one.
For geometry, use `divisionArea` for an area associated with one division and
`divisionBoundary` for a border between two divisions. A catalogue title such as
“Boundary” does not decide the resource type; inspect the geometry and relationships.

Register a stable provider/variant code. The variant is an assertion, not an enrichment
operation: retain separate source, history and current rows and select the assertion at
API read time. State the default variant and whether the family requires this snapshot
for publication in the family document.

## 3. Define identity, domains and time

Document how provider identifiers map to canonical IDs. If an identifier is not already
canonical, create a versioned bridge fixture/table keyed by authority, external ID,
domain and cohort. Include mapping method, review status, source release and any
ambiguity. Add reverse provider identifiers to canonical `identifiers` only through an
explicit enrichment policy.

Choose a primary functional domain (`administrative`, `planning`, `electoral`,
`geographic`, or a reviewed extension). Permit explicit secondary memberships when the
same division has more than one domain, and carry domain context on hierarchy edges. Do
not let a domain-specific relationship enter another domain's default hierarchy.

Use `cohortKey` for the source period used in identity and release selection. Keep
publication/revision timestamps and any source validity interval as separate provenance.
If cohort cannot represent a source's effective period, propose a period object in the
normative spec rather than silently reusing a persistent ID.

## 4. Specify CRS and geometry policy

In the provider profile, state the source CRS, axis/order conventions, dimensionality,
accepted geometry union and canonical API CRS. Transform once at ingestion (normally to
EPSG:4326 GeoJSON) and retain original CRS/coordinates in source provenance.

Preflight must reject null, empty, malformed, self-intersecting, or invalid-ring
geometries unless a separately reviewed repair policy exists. Accept every geometry type
expressly allowed by the source contract, including single and multi forms. Define
extent/cut predicates and allowlists deterministically, and print retained and rejected
populations during processing.

## 5. Map source and canonical schemas

Follow the family’s established column order and reuse shared schema/versioning
fragments. For every source field, record one of: retain exactly, normalise, enrich,
drop after a preflight check, or retain only in `rawProperties`.

At minimum, geometry source rows normally include source ID, bbox, source geometry,
source provenance/version, raw properties and provider relationship IDs. Canonical area
rows include canonical ID, division ID, bbox, geometry, provider identifiers, source
provenance, normalised type and source flags. Canonical boundary rows additionally
include ordered left/right division IDs. History/current rows use the same
version-management columns as the family’s existing resources.

The complete source-neutral field and variant contract is
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md); provider field
tables stay in the provider profile.

## 6. Plan ingestion, preflight and statistics

Add source-kind routing to the CLI and worker, schema drift checks, source-specific
preflight, normalisation, hashing, source/history advancement, current snapshot cloning,
stale-row deletion, rollback and cache profiles. Reuse shared full-snapshot SQL logic;
keep provider relationship normalisation in its adapter.

Preflight should check required columns, constant/dropped values, source filters,
geometry validity, relationship cardinality/order, bridge coverage, referenced
divisions, CRS transformation and duplicate IDs. It must identify the source, cohort,
record and reason for every failure.

Emit stats for accepted records, geometry types, normalised types/flags, bridge
coverage, and changed/unchanged/deleted rows. Keep rejection and quality diagnostics
visible in processing output even when they are not persisted as release stats. Add
stats tests and document any intentionally omitted dimensions.

## 7. Define cohort assembly and API behaviour

Declare which snapshots are required for an exact-cohort API release set and which are
optional variants. Define upload ordering and CLI feedback: uploads that require a
primary snapshot fail early when it is absent; after each upload, report missing
requirements or that all requirements are met and a release set can be created.

Geometry relationships should be sparse and opt-in. Use plural relationship names and
qualified provider selectors (`areas:<provider>`, `boundaries:<provider>`). Update API
fields, response schemas, query planning, serialisers, deduplication and unknown/
unavailable variant errors together. The normative response contract belongs in
[`spec/atlas-api.md`](../../../spec/atlas-api.md).

## 8. Prepare metadata, fixtures and documentation

Create or update, as applicable:

- publisher, dataset and release metadata fixtures;
- API composition members, roles/default variants and API-field relationship paths;
- source-to-canonical bridge fixtures and reverse identifier enrichment;
- localised release notes with retained, normalised, enriched, compatibility and
  dropped-field sections;
- family/resource documentation and the provider profile linked from this plan.

Regenerate fixture hashes with repository tooling. Never encode a provider fact only in
an implementation comment when it affects the public contract; put it in the appropriate
source/spec document.

## 9. Schema, migration and verification checklist

Add source, history and current tables, indexes, constraints and stats serialisation in
the same style as neighbouring resources. Generate migrations with the repository
command and run them locally; do not hand-edit Drizzle snapshots. If rename/drop
resolution is interactive, stop and obtain generated artefacts before continuing.

Before declaring the source complete, verify:

- source/canonical column order, keys, indexes and constraints;
- CLI routing, schema drift, preflight, bridge and cohort checks;
- first/unchanged/changed/deleted loads, history closure, current cloning and rollback;
- stats and processing diagnostics;
- exact-cohort release assembly and upload-order feedback;
- API default omission, each include, combined includes, sparse no-result responses,
  variant selection, unknown variants and included-resource de-duplication;
- metadata, release-note, bridge and localised fixture hashes;
- links and source/spec docs are current.

## Questions to resolve for every new source

1. Is this a new logical resource or a provider variant, and what is its stable code?
2. Which domain(s), cohort/validity period and hierarchy relationships apply?
3. What is the deterministic identifier bridge and review process?
4. Which source fields are retained, normalised, enriched, dropped, or kept in
   `rawProperties`?
5. What CRS/geometry union and validity policy applies?
6. Is the snapshot required for publication or optional at the family level?
7. What API relationship/include and provider-selection behaviour is required?
8. What source-quality anomalies, diagnostics and stats must be visible?
9. Which fixtures, release notes, migrations, tests and documentation must change?
