# Streets API family

The Streets family models persistent logical streets rather than Government Notice rows.
The LandsD gazetted register is the baseline materialisation. Each later LandsD notice
is an append-only source event that may create a street, change its description, rename
all or part of it, delete it, or make no materialised change.

The historical e-Gazette archive preserves bilingual Government Notice evidence from 19
May 2000 onward, including notices before the LandsD HTML notice table begins. The
LandsD street ingest parses its immutable manifest before it registers any source
assets. Its pre-2016 notice rows join the same source ledger and lifecycle/curation
reducer as the LandsD forward feed; matching later archive PDFs are retained as
independent evidence on the LandsD-page event, not replayed as duplicate lifecycle
events.

HKU Libraries' HKGRO scans cover Gazette tables of contents and source PDFs from
1842–1941 (except 1849–1852). They are retrieved locally as high-recall street-name
_candidates_ with a manifest, file hashes and explicit classification state. HKGRO
candidates are not lifecycle events and are neither uploaded to R2 nor materialised into
this family until OCR, parsing and a reviewed identity/lifecycle decision are available.

The source ledger separates baseline rows, immutable notices, and persisted notice
applications. Only declarations that create a new street can be automatic; every
existing-street change needs an explicit affected canonical ID. `Previous G.N.` is
publisher provenance, never an identity resolver. No-op notices remain in the source
ledger without creating a canonical version.

Canonical streets have a positive, monotonic `version`, an `active` or `deleted` status,
and a nullable `deletedAt`. The current snapshot contains active streets only; a deleted
version remains in the immutable history shard and is never hidden by an API-side
`active` filter. A source-page snapshot alone never increments every street version.

A whole-street name change creates a new street identity and deletes the old identity. A
partial name change creates a new identity for the renamed portion while retaining the
old identity for the remaining portion; the curated decision records the two retained
descriptions. Every street response embeds its LandsD changelog in
`attributes.changelog`. `GET /v0/hk/streets/changelog` replays those source events
across the history shards. Version changes are limited to changes in the materialised
names, descriptions, district IDs, status, relevant evidence, or translation provenance.

`GET /v0/hk/streets/{id}` returns the latest materialised state. Per-street history is
available without introducing broad street search endpoints:

- `GET /v0/hk/streets/{id}/versions`
- `GET /v0/hk/streets/{id}/versions/{version}`

Responses contain English, Traditional Chinese, and Simplified Chinese names and
descriptions, lifecycle status, publication/effective provenance, and role-tagged
`evidenceAssets`. Each link contains the original publisher URL, managed asset URL, and
publisher identifier where available. There are no separate Government Notice or Gazette
Plan URL fields. JSON:API links provide `self`, `versions`, and the exact `version`;
exact historic versions also provide adjacent `previous` and `next` links.

Each release records notice-event counts by type; streets added, changed, deleted, and
active/deleted totals; versions created; description completeness; PDF extraction
outcomes; district coverage; and translation provenance. Pairing, parsing, district,
asset, lifecycle-resolution, and translation failures block publication and are reported
to the operator. An e-Gazette failure identifies the publication date, issue/subject,
both local PDF paths, and the exact failed fact. When an older Chinese e-Gazette PDF has
no usable text layer, Traditional Chinese names and descriptions are extracted with
PaddleOCR (`chinese_cht`, rendered at 300 DPI). The English PDF remains authoritative
for Government Notice identity, lifecycle kind, dates, and `Previous G.N.` values; OCR
is explicitly retained as an extraction method, model and engine version in parser
provenance.
