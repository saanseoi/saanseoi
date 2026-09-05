# LandsD street names

The Lands Department publishes a complete gazetted street-name list as a PDF and
subsequent bilingual Government Notices and Gazette Plans. SaanSeoi treats
`Gazetted_Street_Name.pdf` as the baseline street snapshot, not as an event log. Every
later source row is stored as an immutable LandsD notice event, including a revised
publisher version when LandsD changes the source page.

The source is
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).
The baseline PDF is downloaded on every update. Its immutable source version is skipped
when its content hash is unchanged. Baseline rows, immutable notices, and their
auditable reducer decisions are stored separately as `StreetBaselineRecords`,
`StreetNotices`, and `StreetNoticeApplications`. Publisher English and Traditional
Chinese labels stay paired on their parent source row (`nameEn` and `nameZhHant`);
notices retain paired `descriptionEn` and `descriptionZhHant` there too, rather than
using source locale rows.

## Historic baseline version

The historic source-version anchor for the gazetted baseline is **`2016-01-01.0`**. The
initial local bootstrap runs `hkgov-landsd-streets:baseline` before
`hkgov-landsd-streets:landsd-notices`, and stages the baseline payload at that version.
It deliberately predates the LandsD notice-feed boundary of 22 January 2016. This is a
source-version anchor for a present-state reconciliation list, not a claim that the
publisher PDF itself was issued on 1 January 2016.

`2026-08-14.0` is not a replacement baseline: it is the latest Government Notice date
included in the current assembled release. When a complete notice ledger is present, the
assembler versions the combined payload by that latest notice date; it falls back to
`2016-01-01.0` only when there are no notice records. Consequently, the normal complete
ingest does not create a separate published `2016-01-01.0` snapshot release.

## Notice ledger and evidence

The append-only source ledger retains the notice event ID, LandsD-listed `gazetteDate`
(verified against the known PDF examples), notice type, bilingual publisher names and
district labels, parsed bilingual descriptions, an explicitly parsed effective date and
previous-Government-Notice candidates where the publisher layout supplies them, raw
publisher properties, retrieval metadata, source-page snapshots, extracted PDF text,
parser diagnostics, hashes, and source revisions.

The bilingual PDF dates are compared as a source-quality check. If one signature block
contains a publisher date typo, the paired table rows and their explicit operation
remain usable: the English PDF date is retained for the event and the discrepancy is
reported to the operator. A date typo must not turn a tabled description replacement
into an unclassified name change.

A later corrigendum that expressly corrects a date in the Chinese version of an earlier
notice is parsed as publisher metadata. It identifies the earlier G.N. and the erroneous
and corrected dates, repairs that known bilingual discrepancy during pairing, and is
recorded automatically as a source-only no-op; it never creates a street lifecycle
application.

The two HTML source pages, the baseline PDF, each English and Traditional Chinese
Government Notice PDF, related Gazette Plan PDFs, and their e-Gazette historical
counterparts are preserved as managed source assets. `evidenceAssets` is the only
evidence-link representation: every link is role-tagged and includes its publisher
identifier where available, label, original URL, managed URL, media type, content hash,
and provenance. Plan WebP previews are optional release-note assets and never replace
the primary PDF evidence. Completed preview page sets are cached in the stage directory
and reused only when their count matches the source PDF's reported page count. Live
LandsD pages and evidence PDFs are fetched only from the documented
`https://www.landsd.gov.hk` origin. Cross-origin links and redirects are rejected before
their response bodies can be retained or published as managed evidence.

## Parsing and application

The LandsD stages are:

```bash
bun run dataops -- hkgov-landsd-streets:baseline --target local|preview|production
bun run dataops -- hkgov-landsd-streets:landsd-notices --target local|preview|production
```

The notice stage pairs English and Traditional Chinese page rows by notice identity and
includes notices dated 22 January 2016 onward. Its PDF parser understands three-column
`Description`/`Name`/`Previous G.N.`, two-column `Description`/`Name`, and deletion
`Name`/`Named in` layouts. Lifecycle curation parses the linked bilingual change and
corrigendum PDFs; e-Gazette source PDFs are parsed before any assets are registered. A
Chinese e-Gazette PDF without a text layer is OCRed using PaddleOCR (`chinese_cht`, 300
DPI), and the event records that extraction method, engine version and model separately
from native publisher text. The parser accepts spacing inserted between the opening
Chinese road-description characters and English name cells shifted left of their
headings by PDF text extraction, so those rows remain distinct notices. Unsupported
historical layouts fail with their exact local paths and parse facts. Those candidates
are evidence only: neither a parser fallback nor page-row order creates a lifecycle
link. Missing PDF evidence blocks publication. A readable PDF whose layout is not
recognised is retained as evidence and presented for a curator decision instead.

The baseline stage prepares opaque canonical street IDs before either notice stage runs.
The LandsD and e-Gazette stages require that staged baseline, so lifecycle review always
presents its matching baseline street IDs. These three commands stage evidence and
parsed immutable records; none publishes a street snapshot. After the official e-Gazette
stage is complete, run `hkgov-landsd-streets:assemble` to reconcile baseline names
against the complete notice ledger and publish one snapshot revision. This avoids
treating a present-state baseline as an event that follows older notices.

For `--target local`, immutable evidence and manifests are registered in the local
metadata database and written to the local Wrangler R2 state. The resulting links use
the local Atlas asset endpoint, so a local release remains inspectable without sending
publisher evidence to a remote environment.

Canonical street IDs are opaque UUIDv7-style values minted once and persisted in
canonical street records. Their durable source bridge is the canonical record's the
source record's `rawProperties`, not a source-table ID or relationship. They are never
derived from a name, district, source record, grid cell, or future geometry.
`Previous G.N.` values are publisher provenance, not a canonical-street lookup key. A
deletion updates the application’s explicit affected street and sets `deletedAt` only
for a confidently parsed legal effective date.

Declarations may create a new street automatically. Other existing-street changes and
deletions require a versioned application fixture in
[`fixtures/meta/curations/hkgov-landsd-street.json`](../../../../fixtures/meta/curations/hkgov-landsd-street.json).
It is a schema-version 2 manifest; an empty `decisions` array is valid until a
reviewable notice needs a manual disposition. The first blocked run writes
`lifecycle-review.json` beside `operator-report.json`. Each entry has the immutable
source-record ID, bilingual names and descriptions, publisher PDF URLs, parsed
`Previous G.N.` candidates, and baseline streets whose English names match after case
and whitespace normalisation. Each baseline candidate includes its minted canonical
street ID and district codes. During interactive review, one matching baseline street is
selected automatically; when several match, the operator selects from the
district-labelled list. No baseline match remains an explicit reviewed decision rather
than a guessed identity. A description-replacement notice with one matching baseline
street is applied automatically as a description change. The manifest is shared by the
non-overlapping LandsD and historical e-Gazette stages: a stage applies only decisions
for notices in its own input. The LandsD notice stage additionally rejects decisions
that do not match its current source, retaining drift detection for the live publisher
feed. If bilingual PDF extraction disagrees only on `Previous G.N.` references, the
paired descriptions and names remain available for review and the combined references
are retained as a provenance warning. A parseable corrigendum with one matching baseline
street is applied automatically as a field-scoped amendment. The prose parser recognises
flexible English and Traditional Chinese wording for a character or complete-text
correction and limits the amendment to the named English or Traditional Chinese name
and/or description field, or to the published `Previous G.N.` provenance. The review
displays both the erroneous and corrected street name, rather than treating a
corrigendum as an unspecified street change. A corrigendum always creates a lifecycle
version and changelog entry, including when the present-state baseline already contains
the corrected text. `Previous G.N.` is never used to identify a street. A curator
chooses one of:

- `apply`, with the affected canonical street and, for a name change, whole/partial
  scope. The resulting street ID is minted by the system;
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
the affected street. A parseable intention to rename one language field, with one exact
English-name baseline match, is linked automatically for that changelog entry but does
not alter the street state or create a version; only the later legal declaration may do
so. A whole-street name change creates a new street identity and deletes the old one; a
partial change retains the old identity and creates one for the renamed portion.

An intention that proposes several actions—for example, renaming one section of a street
and ceasing another—remains a reviewed changelog decision. The review states each
proposed action, rather than attaching the multi-street proposal automatically to the
first matching street. This includes notices that identify the source section through an
earlier Government Notice before naming the replacement street. Review candidates for a
partial rename are matched against that existing source street, not the proposed new
name. Its later declaration is where the corresponding whole or partial name-change
application is recorded.

Each updater run emits one source release and canonical snapshot for the newly observed
batch of notices. The source-release notes enumerate only subsequent Government Notice
events; the complete gazetted baseline is retained in the release payload, not written
as changelog entries. Current snapshots contain active streets only. Historic deleted
states and the replay projection remain in history, while every current street includes
its own `attributes.changelog`; the full replay is available at
`GET /streets/v0/hk/streets/changelog`.

## Names and districts

English and Traditional Chinese remain publisher text. Unique Traditional Chinese names
and parsed descriptions are translated to Simplified Chinese with Azure Translator v3
(`yue` to `zh-Hans`), cached by source-text hash, and retain translation provenance.
Translation failures block publication; Traditional Chinese is never a silent fallback.

Publisher district labels and baseline district codes stay in the source ledger. During
canonical materialisation they are resolved against the published district snapshot and
stored as canonical `districtIds`; those IDs never leak back into source storage. An
unresolved district blocks publication and is reported as a quality error. The gazetted
baseline's `Is` and `K&T` codes resolve respectively to Islands and Kwai Tsing through
the versioned bridge; mixed codes retain every applicable district.

## Upstream

- [LandsD Government Notices and Plans](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Traditional Chinese notices and plans](https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Gazetted Street Name list](https://www.landsd.gov.hk/doc/en/street-name/Gazetted_Street_Name.pdf)
- Historical bilingual Government Notice PDFs are also archived by the Government
  Logistics Department in the [Hong Kong e-Gazette](../hkgov-gld/egazetteStreetName.md).
