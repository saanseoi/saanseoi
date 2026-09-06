# Streets API family

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
