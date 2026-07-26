# LandsD street names

The Lands Department publishes a complete gazetted street-name list as a PDF and
subsequent bilingual Government Notices and Gazette Plans. SaanSeoi treats
`Gazetted_Street_Name.pdf` as the baseline street snapshot, not as an event log. Every
later source row is retained as an immutable LandsD notice event, including a revised
publisher version when LandsD changes the source page.

The source is
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).
The baseline PDF is downloaded on every update. Its immutable source version is skipped
when its content hash is unchanged. Baseline rows, immutable notices, and their
persisted applications are stored separately as `StreetBaselineRecords`,
`StreetNotices`, and `StreetNoticeApplications`.

## Notice ledger and evidence

The append-only source ledger retains the notice event ID, LandsD-listed `gazetteDate`
(verified against the known PDF examples), notice type, bilingual publisher names and
district labels, parsed bilingual descriptions, an explicitly parsed effective date and
previous-Government-Notice candidates where the publisher layout supplies them, raw
publisher properties, retrieval metadata, source-page snapshots, extracted PDF text,
parser diagnostics, hashes, and source revisions.

The two HTML source pages, the baseline PDF, each English and Traditional Chinese
Government Notice PDF, and related Gazette Plan PDFs are preserved as managed source
assets. `evidenceAssets` is the only evidence-link representation: every link is
role-tagged and includes its publisher identifier where available, label, original URL,
managed URL, media type, content hash, and provenance. Plan WebP previews are optional
release-note assets and never replace the primary PDF evidence.

## Parsing and application

`saanseoi ingest:hkgov-landsd-streets --target local|preview|production` pairs English
and Traditional Chinese page rows by notice identity. Its PDF parser understands
three-column `Description`/`Name`/`Previous G.N.`, two-column `Description`/`Name`, and
deletion `Name`/`Named in` layouts. Lifecycle curation parses the linked bilingual
change and corrigendum PDFs; historical unstructured notices retain their extracted text
and predecessor candidates for review. Those candidates are evidence only: neither a
parser fallback nor page-row order creates a lifecycle link. Missing PDF evidence blocks
publication. A readable PDF whose layout is not recognised is retained as evidence and
presented for a curator decision instead.

The command reports its active stage, source-PDF and Government Notice extraction
counters, plan-preview rendering, release publication, and cursor update. This makes
long local backfills visibly distinguishable from a stalled process.

For `--target local`, immutable evidence and manifests are registered in the local
metadata database and written to the local Wrangler R2 state. The resulting links use
the local Atlas asset endpoint, so a local release remains inspectable without sending
publisher evidence to a remote environment.

Canonical street IDs are opaque UUIDv7-style values minted once and persisted. They are
never derived from a name, district, source record, grid cell, or future geometry.
`Previous G.N.` values are publisher provenance, not a canonical-street lookup key. A
deletion updates the application’s explicit affected street and sets `deletedAt` only
for a confidently parsed legal effective date.

Declarations may create a new street automatically. Other existing-street changes
require a versioned application fixture in
[`fixtures/meta/curations/hkgov-landsd-street.json`](../../../../fixtures/meta/curations/hkgov-landsd-street.json).
The first blocked run writes `lifecycle-review.json` beside `operator-report.json`. Each
entry has the immutable source-record ID, bilingual names, publisher PDF URLs, and
parsed `Previous G.N.` candidates. A curator chooses one of:

- `apply`, with the affected canonical street ID and, for a name change, a new ID and
  whole/partial scope;
- `noOp`, when the immutable source event has no material street-state effect; or
- `defer`, which intentionally continues to block publication.

The ingest validates that every change, corrigendum, and intention notice has a
non-deferred decision. Applications do not replace parsed publisher facts. A partial
name-change decision additionally records non-empty English and Traditional Chinese
descriptions for the retained portion; Simplified Chinese is translated and stored with
the source event. A no-op remains in the source ledger but does not create a canonical
street version. Unknown, duplicate, or stale decisions block the run.

`Notice of intention to change street name` remains a source notice event and appears as
`notice_of_name_change` in the relevant street changelog when its application identifies
the affected street. A whole-street name change creates a new street identity and
deletes the old one; a partial change retains the old identity and creates one for the
renamed portion.

Each updater run emits one source release and canonical snapshot for the newly observed
batch of notices. Current snapshots contain active streets only. Historic deleted states
and the replay projection remain in history, while every current street includes its own
`attributes.changelog`; the full replay is available at `GET /v0/hk/streets/changelog`.

## Names and districts

English and Traditional Chinese remain publisher text. Unique Traditional Chinese names
and parsed descriptions are translated to Simplified Chinese with Azure Translator v3
(`yue` to `zh-Hans`), cached by source-text hash, and retain translation provenance.
Translation failures block publication; Traditional Chinese is never a silent fallback.

Publisher district labels and baseline district codes stay in the source ledger. During
canonical materialisation they are resolved against the published district snapshot and
stored as canonical `districtIds`. An unresolved district blocks publication and is
reported as a quality error.

## Upstream

- [LandsD Government Notices and Plans](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Traditional Chinese notices and plans](https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Gazetted Street Name list](https://www.landsd.gov.hk/doc/en/street-name/Gazetted_Street_Name.pdf)
- Historical bilingual Government Notice PDFs are also archived by the Government
  Logistics Department in the [Hong Kong e-Gazette](../hkgov-gld/egazetteStreetName.md).
