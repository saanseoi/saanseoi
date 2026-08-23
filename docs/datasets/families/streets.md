# Streets API family

The Streets family models persistent logical streets rather than Government Notice rows.
The LandsD gazetted register is the baseline materialisation. Each later LandsD notice
is an append-only source event that may create a street, change its description, rename
all or part of it, delete it, or make no materialised change.

The baseline's historic source-version anchor is `2016-01-01.0`. It is intentionally
earlier than the 22 January 2016 LandsD notice-feed boundary and identifies the initial
present-state reconciliation input; it is not the publication date of the current
gazetted-register PDF. A later release version such as `2026-08-14.0` identifies the
latest notice included in an assembled payload, not a new baseline.

The street backfill uses three non-overlapping inputs: the LandsD gazetted-list PDF;
LandsD bilingual notice PDFs from 22 January 2016 onward; and official e-Gazette notice
PDFs from 19 May 2000 through 21 January 2016. Each input is staged separately, then the
assembler reconciles the baseline against the complete notice ledger and publishes one
immutable snapshot revision. The date boundary prevents a Government Notice from being
replayed from both publishers.

HKU Libraries' HKGRO scans cover Gazette tables of contents and source PDFs from
1842–1941 (except 1849–1852). They are retrieved and OCRed locally as high-recall
street-name _candidates_. Local discovery ranks them into an auditable curator review
queue while preserving source hashes and OCR provenance. Accepted candidates may be
street declarations, naming or renaming, absorption into an existing street, deletion,
legally material designation, or description changes. An absorption ends the source
street or section and extends a surviving street, rather than creating a renamed street
identity. Curators make those local selection decisions through the HKGRO interactive
review queue; decisions are saved after each source PDF and do not publish data. HKGRO
candidates are not lifecycle events and are neither uploaded to R2 nor materialised into
this family until parsed facts and a reviewed identity/lifecycle decision are available.
Their local PaddleOCR output is explicitly marked as English `method: "ocr"` derived
evidence and bound to the exact HKGRO source-PDF SHA-256; it is not publisher-native
text or a source of canonical street identity. Retrieval caps each PDF at 256 MiB, and
whole-document PDF rendering has a five-minute timeout before page-level OCR begins.

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
`attributes.changelog`. `GET /streets/v0/hk/streets/changelog` replays those source
events across the history shards. Version changes are limited to changes in the
materialised names, descriptions, district IDs, status, relevant evidence, or
translation provenance.

`GET /streets/v0/hk/streets/{id}` returns the latest materialised state. Per-street
history is available without introducing broad street search endpoints:

- `GET /streets/v0/hk/streets/{id}/versions`
- `GET /streets/v0/hk/streets/{id}/versions/{version}`

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

Live LandsD evidence downloads are restricted to the publisher's documented HTTPS
origin, including redirect targets. Historical e-Gazette files are read from the curated
local archive rather than followed from publisher HTML.

# Streets

Street identity is established from LandsD gazetted names. LandsD Road Centreline
releases provide an optional geometry for individual streets, but a published Streets
composition requires a selected Road Centreline release. Historic street versions
resolve the corresponding historic centreline release.
