# Streets API family

Native source SQL preserves unchanged open assertions, including large payloads.
Replacement membership is compared in disjoint indexed ID ranges; several assertions for
one publisher ID remain current when all are present in the incoming release.

## TODO: Source payload consolidation

- [ ] When Streets work resumes, review moving parsed publisher attributes from
      `hkgovLandsdStreetBaselineRecords` and `hkgovLandsdStreetNotices` into
      `rawProperties`. The baseline stores names and district codes directly; notices
      store names, descriptions, dates, classifications, notice references and district
      codes directly. These are structured PDF extractions, so define the retained raw
      payload before removing columns. Preserve source identity, provenance, document
      evidence, parser diagnostics and notice-application decisions. Update ingestion
      and readers, generate the migration, and verify retained evidence and lifecycle
      behaviour. This review is deferred until Streets work starts.

## TODO: API-family contract unification

- Tracked in [GitHub issue #64](https://github.com/saanseoi/saanseoi/issues/64).
- [ ] Implement Streets as a first-class API family with the same explicit version and
      major-alias policy as Addresses, Divisions, Places and Statistics. The current
      source route registers only `v0.1` for Streets, selects a separate
      `StreetSourceRecordsResponseSchema`, and the canonical Street routes and schemas
      remain in a dedicated stack. Review and align route registration, aliases, OpenAPI
      documents, operation IDs, middleware, history/changelog responses and snapshot
      errors while preserving intentional Street-specific semantics.
- [ ] Audit the remaining source-contract drift: Street source records have a distinct
      envelope and reader path, PDF baseline and notice sources are projected into
      `rawProperties`, Street source descriptions are not localised through the shared
      OpenAPI message keys, and the app schema/sample flows contain Streets-specific
      branches. Define the common source-record, source-schema, JSON/NDJSON, pagination,
      error and localisation contract, retain only deliberate Street extensions, and
      update the relevant API and source-record documentation with contract tests.

## Source storage and publication

Road Centreline source rows use `(sourceRecordId, versionHash)` with release-validity
columns. Native feature hashes exclude archive provenance, so a replacement archive does
not create new versions of unchanged publisher properties and geometry.

Street ingestion records its selected release, source rule and effective recipe under
the [assembly provenance contract](../pipeline.md#snapshot-assembly-provenance).

Native feature source tables retain publisher attributes in `rawProperties`, native
geometry separately, and identity, release history and provenance in the source
envelope. Retained source-property keys use the shared camelCase convention while
publisher values remain unchanged. TD's layer kind identifies the source collection.
Names, descriptions, coordinates and classifications are not duplicated as extracted
source columns. PDF baseline and notice records retain structured extracted evidence
because these publishers supply documents, not feature-property objects; notice
applications retain the audit decision separately from canonical street state.

The Streets family publishes persistent logical street identities. Its first release is
the current Lands Department gazetted street-name register: one active street per
baseline source record, with the publisher's English and Traditional Chinese names and
canonical district references.

The baseline is present-state data, not a synthetic lifecycle event. Initial publication
therefore creates no per-street changelog entries and does not require the Government
Notice, e-Gazette, HKGRO, or Road Centreline backfills.

Canonical IDs are opaque UUIDv7-style values. They are minted once and checked into the
LandsD baseline identity registry beside the source-record key, bilingual publisher
names, and district codes. The registry also pins the retained baseline PDF hash to its
acquisition cohort. A remote publication is refused when the current baseline is not
represented by that reviewed registry, preventing local, preview, and production from
minting different IDs.

Later source-release revisions may add historical Government Notices and e-Gazette
artefacts. Those revisions must reuse the published baseline identities, retain each
notice as an immutable source record, and make lifecycle changes only through reviewed
applications. Historical evidence enrichment is not allowed to replace an existing
canonical ID or silently change the present-day set.

The implemented API surface is:

- `GET /streets/v0.1/{id}`
- `GET /streets/v0.1/{id}/versions`
- `GET /streets/v0.1/{id}/versions/{version}`
- `GET /streets/v0.1/changelog`

Street names and descriptions are available in English and Traditional Chinese. The
current source does not provide Simplified Chinese or street geometry. LandsD Road
Centreline is an optional composition member which can later enrich streets for
approximate location lookup and map labelling.

HyD street evidence uses explicit quarterly source-schema mappings and native layer
validation. Road Centreline retains publisher integer street codes as decimal text, with
the original values preserved in its native source properties.

Native imports support retries and bounded SQL writes for large polygon values. Road
Centreline review reports retain readable bilingual names, grouped segment evidence and
the selected published snapshot IDs. District matching uses HaD district areas whose
canonical IDs cover the street district references. Unresolved named segments require
curation before publication.

Road Centreline intake offers `--review` for colour-coded, grouped terminal curation.
Reviewers can search and link existing streets, retain groups as source-only evidence,
or leave them unresolved. Decisions save after each choice with archive and canonical
snapshot provenance; review itself does not publish a release or create street
identities.

Current snapshots contain active streets. When lifecycle revisions are published,
deleted states remain in immutable history and notice events appear in the changelog.
API history and changelog reads must remain bounded by published snapshots.

## Gazette OCR evidence

Historical HKGRO scans and the Traditional Chinese e-Gazette text-layer fallback use
Qianfan-OCR with pinned model revision, raw page output and source provenance. Rendered
pages use 300 DPI. OCR results remain derived evidence: English e-Gazette PDFs supply
notice identity, dates, kinds and predecessor references; Chinese OCR supplies names and
descriptions. Truncated output, invalid layouts and bilingual mismatches stop
processing. Chinese labelled OCR blocks preserve each description/name pair as a
separate row; incomplete or ambiguous pairs fail extraction. Street identity and
lifecycle decisions require curation.

See [HKGRO OCR setup](../sources/hku-hkgro/streetName.md#local-ocr) and
[e-Gazette processing](../sources/hkgov-gld/egazetteStreetName.md).

## Local D1 with production artefacts

For a fresh local initialisation, `--target local --r2 production` keeps processing and
registrations in local D1 while retaining source and provenance objects in production
R2. See the
[storage-target workflow](../d1-bootstrap.md#ingest-locally-with-production-r2) for
immutable uploads and continuation requirements.

## Registry metadata

The Lands Department Road Centreline dataset declares EPSG:2326 for retained native
source geometry. Document-only street products do not acquire a CRS from their canonical
map output.

## Native street CRS

Street-name plates, sensitive streets, strategic streets and the five pedestrian-street
layers use EPSG:2326 (Hong Kong 1980 Grid). Their active FileGDB catalogue entries
declare Esri WKID 102140 and LatestWKID 2326. All 22 retained native archives agree: 12
nameplate releases (2023-Q3 to 2026-Q2), two sensitive-street releases (2024-Q1 and
2025-Q1), one strategic-street release (2025-Q1), and seven pedestrian-street releases
(2024-Q2 to 2026-Q1). Deleted catalogue records are not evidence of a current layer's
CRS.

Source intake validates the active layer CRS and retains native easting/northing
coordinates. The private FileGDB reader disables automatic WGS84 projection without
changing other FileGDB consumers. Dataset `sourceCrs` is EPSG:2326; coordinate
conversion belongs to a separately declared map derivative. Document-only street
products retain a null CRS.

## Publication readiness

Current materialisations claim a publication-state receipt before delivery and mark it
prepared only after complete delivery validation, including valid empty snapshots. The
selected published snapshot must be ready for the API to serve it. Publication, search
readiness and cleanup follow the shared
[publication-state contract](../publication-state-plan.md). The next reset and reingest
creates these receipts through normal delivery; no backfill infers readiness from
existing records.

Street delivery seals current, history and metadata mutations for resumable local or
remote replay. Preparation validates active streets, their localisations and changelog
entries; deleted localisations do not count towards the active inventory.
