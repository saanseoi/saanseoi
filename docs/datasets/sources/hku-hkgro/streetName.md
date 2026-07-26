# Hong Kong Government Reports Online street-name candidates

HKU Libraries' [Hong Kong Government Reports Online](https://sunzi.lib.hku.hk/hkgro/)
(HKGRO) supplies digitised scans of the Hong Kong Government Gazette from 1842
through 1941. The collection has no published annual table of contents for 1849–1852. It
fills part of the historical gap before the official
[Hong Kong e-Gazette](../hkgov-gld/egazetteStreetName.md), which starts in 2000; it does
not cover 1942–1999.

## Local retrieval

Run the local-only evidence acquisition command:

```bash
bun run dataops -- hkgov-hkgro-street-names:retrieve --target local
```

It indexes every available annual HKGRO table of contents and writes the manifest and
candidate scans under the git-ignored path:

`data/hku/hkgro/street-name/`

The manifest retains every HKGRO PDF row with its publication date, notification number,
title, canonical HKU URL and deterministic local path. A deliberately broad, auditable
title matcher marks possible street-name notices (for example `street`, `road`, `lane`,
`naming` and `change of name`) and records the matched reasons. Only those candidates
are downloaded initially. Each source file is checked for a PDF header, byte length and
SHA-256; existing validated files are resumed without a second download. A bad response,
changed local byte length or changed SHA-256 stops the command with the year, HKGRO PDF
identifier, title and exact path/URL.

HKGRO sometimes serves a zero-byte `application/pdf` response for a TOC-linked PDF. The
command records that candidate as `assetStatus: "unavailable"` with the explicit failed
URL and reason, then continues the acquisition. It never writes a zero-byte source file.
A non-empty non-PDF response, a malformed local file, or a changed local hash still
stops the command so archive or parser problems cannot be mistaken for source evidence.

Use `--year 1901,1902` only for a bounded acquisition or repair run. The normal command
indexes all available years. The workflow retains the archive session cookie and retries
the annual TOC request once because HKGRO may initially return its generic landing page.

## Local OCR

After retrieval, create derived OCR evidence with:

```bash
bun run dataops -- hkgov-hkgro-street-names:ocr --target local
```

The historical HKGRO scans are image-only and predominantly English, so this uses
PaddleOCR's `en` model after rendering each page at 300 DPI. It writes one result per
unique retrieved candidate under `ocr/YYYY/<HKGRO-id>.ocr.json` plus
`ocr-manifest.json`. Each result preserves the source PDF path, byte length and SHA-256,
PaddleOCR engine/version/model/language, raw page-level PaddleOCR NDJSON, recognised
words with coordinates and confidence, and a layout-derived convenience text field. The
PDF remains the source evidence; the JSON is explicitly derived with `method: "ocr"`,
never publisher-native text.

OCR validates the current PDF header, byte length and hash before it starts. Completed
results are resumed only when their stored provenance matches those same source bytes.
An unreadable PDF, failed rendering, unavailable runtime/model, malformed PaddleOCR
output, or no recognised text records an `unparseable` attempt with the source path and
full failure detail in `ocr-manifest.json`, then stops immediately. Once corrected, a
rerun retries that record. Use `--year 1901,1902` for a bounded OCR or repair run. Use
`--hkgro-pdf-id 460097` to inspect or repair a specific retrieved scan.

The OCR environment remains UV-managed:

```bash
uv sync --project apps/harbour-dataops --python 3.12
```

Set `SAANSEOI_PADDLEOCR_PYTHON` only to point at an alternative compatible UV Python.
PaddleOCR downloads its initial English model weights on first use, so that first run
needs network access or a pre-seeded PaddleOCR cache. A single OCR page has a two-minute
timeout so an unavailable model host cannot hang the archive; set
`SAANSEOI_PADDLEOCR_TIMEOUT_MS` to a larger positive millisecond value only after
confirming that the runtime and model download are healthy.

## Discovery review

Once OCR is complete, create the local curator queue with:

```bash
bun run dataops -- hkgov-hkgro-street-names:discover --target local
```

It writes `discovery/review.json` beside the archive. The queue groups repeated table of
contents references to the same source PDF, retains the original source hash and OCR
path, and ranks entries using title and OCR signals. It suggests `manual-review`,
`not-street-name`, or `unclassified`; it never automatically accepts a source event.
Rerunning discovery preserves a curator decision when the bound source hash is
unchanged.

Curators inspect the original scan before accepting a row. Material events include a
street declaration, naming or renaming, deletion, legally material designation, or a
description change. Repairs, tenders, land sales, street cries, house numbering, and
other incidental street references are rejected as `not-street-name`. OCR excerpts and
extracted signals are review aids, never publisher-native facts.

Create those decisions through the local interactive curator flow:

```bash
bun run dataops -- hkgov-hkgro-street-names:review --target local
```

It starts with unfinished records suggested for `manual-review`, shows the table of
contents context, original PDF URL and local path, discovery signals, and OCR excerpt,
then records `street-name`, `not-street-name`, or `manual-review`. An accepted record
also requires one material kind: declaration, naming or renaming, deletion, legally
material designation, or description change. The decision is saved to
`discovery/review.json` after every record, so stopping safely or rerunning does not
lose completed work. `manual-review` is non-final and remains eligible for a later run.
Use `--all` to revisit deferred records and review unfinished `unclassified` records.
The command renders the first source-PDF page at 300 DPI and prints it inline with
`pdftoppm` and Kitty's graphics-protocol renderer (`kitten icat`) before prompting; it
records no free-text curator notes. This command does not upload evidence or materialise
street history.

## Classification and lifecycle boundary

Candidate selection is high-recall discovery, not a finding that a notice changes a
street name. Manifest records start as `unclassified` or `not-candidate`; later review
may mark a candidate `street-name`, `not-street-name`, or `manual-review`. No HKGRO row
is currently materialised into the LandsD street lifecycle, published to R2, or used to
infer canonical street identity. Before that integration, each scan needs explicit OCR
provenance, parsed facts, and a reviewed lifecycle/identity decision.

This is intentionally a pending fourth street-backfill stage. Discovery, retrieval, and
OCR remain local-only; there is no HKGRO staging or assembly command until the reviewed
selection also has parsed facts and lifecycle/identity decisions.

## Upstream

- [HKGRO annual Government Gazette browsing](https://sunzi.lib.hku.hk/hkgro/browse.jsp)
- [Hong Kong e-Gazette historical street-name notices](../hkgov-gld/egazetteStreetName.md)
