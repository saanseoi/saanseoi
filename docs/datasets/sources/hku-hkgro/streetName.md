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
are downloaded initially. Each download is capped at 256 MiB. Each source file is
checked for a PDF header, byte length and SHA-256; existing validated files are resumed
without a second download. A bad response, changed local byte length or changed SHA-256
stops the command with the year, HKGRO PDF identifier, title and exact path/URL.

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

The historical HKGRO scans are image-only and predominantly English. Qianfan-OCR
(`baidu/Qianfan-OCR`, revision `623bf5d20d446abdb36606aa4547cd0c18886fe5`) transcribes
each page rendered at 300 DPI with the prompt `Parse this document to Markdown.` It uses
FP16, eager attention and deterministic generation with thinking disabled. No expected
answers or other OCR text are supplied.

Results live under `ocr/qianfan-<revision>/YYYY/<HKGRO-id>.ocr.json`, with
`manifest.json` in the same engine/revision directory. Each result retains the PDF path,
byte length and SHA-256, engine/runtime version, model revision, language, DPI, raw page
JSON (including image hash, prompt and generation settings), and Markdown text. The PDF
remains the source evidence; OCR is derived with `method: "ocr"`. Coordinates and
confidence scores are not supplied by this model.

OCR checks the PDF header, byte length and hash before running. Reuse requires valid
source-bound results for the pinned engine/revision. Rendering failures, unavailable
GPU/runtime/model, malformed output, empty text or token-limit truncation record an
`unparseable` attempt and stop the command. A rerun retries failed records. Rendering
has a five-minute timeout; inference has a twenty-minute per-page timeout and an
8,192-token output limit. Set `SAANSEOI_QIANFAN_TIMEOUT_MS` to a positive millisecond
value to adjust the inference timeout. Use `--year 1901,1902` or `--hkgro-pdf-id 460097`
for bounded runs.

The local AMD/Linux x86-64 runtime uses Python 3.12 and ROCm 6.3 PyTorch:

```bash
uv sync --project apps/harbour-dataops --python 3.12 --locked
```

The runner uses the cached runtime at `.cache/qianfan-ocr/.venv/bin/python` when
present, otherwise `apps/harbour-dataops/.venv/bin/python`. `SAANSEOI_QIANFAN_PYTHON`
selects an explicit compatible GPU Python environment. Model weights use
`.cache/qianfan-ocr/huggingface` by default; `HF_HOME` overrides this location. First
use needs Hugging Face access or the pinned model already cached. Poppler's `pdftoppm`
and GPU device access are required. The RX 6900 XT trial used approximately 10 GiB
allocated VRAM; runtime and model downloads require additional disk space. Run OCR
sequentially on this GPU.

Names and numeric tables require source review even when the transcription is fluent.
OCR does not authorise lifecycle changes or publication.

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
street declaration, naming or renaming, absorption into an existing street, deletion,
legally material designation, or a description change. An absorption is not treated as a
simple rename: it ends the source street or section while extending the legal extent of
a surviving, already named street. Its future lifecycle application must therefore
identify both the ending source and surviving target. Repairs, tenders, land sales,
street cries, house numbering, and other incidental street references are rejected as
`not-street-name`. OCR excerpts and extracted signals are review aids, never
publisher-native facts.

Create those decisions through the local interactive curator flow:

```bash
bun run dataops -- hkgov-hkgro-street-names:review --target local
```

It starts with unfinished records suggested for `manual-review`, shows the table of
contents context, original PDF URL and local path, discovery signals, and OCR excerpt,
then records `street-name`, `not-street-name`, or `manual-review`. An accepted record
also requires one material kind: declaration, naming or renaming, absorption into an
existing street, deletion, legally material designation, or description change. The
decision is saved to `discovery/review.json` after every record, so stopping safely or
rerunning does not lose completed work. `manual-review` is non-final and remains
eligible for a later run. Use `--all` to revisit deferred records and review unfinished
`unclassified` records. Discovery retains the OCR page number(s) that contain the
ranking signal. The review command shows those page references and renders the first
relevant source-PDF page at 300 DPI, resizes it to half the terminal width, and prints
it inline with `pdftoppm`, ImageMagick, and Kitty's graphics-protocol renderer
(`kitten icat`) before prompting; it records no free-text curator notes. This command
does not upload evidence or materialise street history.

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

## Publication readiness

Canonical current delivery validates its complete snapshot before recording preparation
in the relevant `*PublicationState` table. Publication alone marks that preparation
ready for API reads. Empty snapshots require the same explicit completion evidence. See
the [publication-state contract](../../publication-state-plan.md).
