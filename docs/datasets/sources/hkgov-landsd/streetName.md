# LandsD street names

The Lands Department publishes a complete gazetted street-name list as a PDF and
subsequent bilingual Government Notices and Gazette Plans. SaanSeoi treats
`Gazetted_Street_Name.pdf` as the baseline street snapshot, not as an event log. Every
later source row is retained as an immutable LandsD notice event, including a revised
publisher version when LandsD changes the source page.

The source is
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).
The initial source release is `2016-01-01.0`; it preserves the exclusion audit linking
baseline rows to their later logical streets or events. Notice releases are grouped by
publication day.

## Notice ledger and evidence

The append-only source ledger retains the notice event ID, publication date, notice
type, bilingual publisher names and district labels, parsed bilingual descriptions, an
explicitly parsed effective date, explicit previous-Government-Notice references, raw
publisher properties, retrieval metadata, source-page snapshots, extracted PDF text,
parser diagnostics, hashes, and source revisions.

The two HTML source pages, the baseline PDF, each English and Traditional Chinese
Government Notice PDF, and related Gazette Plan PDFs are preserved as managed source
assets. `assetLinks` is the only evidence-link representation: every link is role-tagged
and includes label, original URL, managed URL, media type, content hash, and provenance.
Plan WebP previews are optional release-note assets and never replace the primary PDF
evidence.

## Parsing and application

`saanseoi ingest:hkgov-landsd-streets --target local|preview|production` pairs English
and Traditional Chinese page rows by notice identity. It parses the linked bilingual
PDFs with their fixed `Description`, `Name`, and `Previous G.N.` layout. Rows are paired
by notice identity, exact bilingual name, consistent previous-notice references, and
only then the per-notice ordinal. An unsupported layout, PDF extraction failure, or
ambiguous pairing is an operator-report error and blocks publication.

For `--target local`, immutable evidence and manifests are registered in the local
metadata database and written to the local Wrangler R2 state. The resulting links use
the local Atlas asset endpoint, so a local release remains inspectable without sending
publisher evidence to a remote environment.

Canonical lifecycle resolution uses explicit prior Government Notice references only;
street names are never used as identity or as a fuzzy target matcher. A deletion updates
the matched logical street to `deleted` and sets `deletedAt` only for a confidently
parsed legal effective date. A later valid restoration becomes a new active version. A
source event that causes no materialised change remains in the source ledger without
creating a redundant street version.

`Corrigendum` and `Declaration to change street name` notices deliberately fail fast
with `curationRequired` entries in `operator-report.json`. The data feed does not
reliably express whether a name change is a replacement, split, or merge.
`Notice of intention to change street name` remains a source notice event; reviewed
old/new street-name relations live in the separate name-change model when they can be
linked deterministically.

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
