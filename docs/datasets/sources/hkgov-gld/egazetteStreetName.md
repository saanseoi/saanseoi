# Government e-Gazette street-name notices

The Government Logistics Department's
[Hong Kong e-Gazette](https://egazette.gld.gov.hk/en/search-gazette) provides the
digital Government Gazette archive. The site states that Main Gazette issues are
available from 19 May 2000. This is the historical companion source for the LandsD
street-name register: it supplies the bilingual Government Notice PDFs that pre-date the
LandsD HTML notice table and provides an independent archive of the later notices.

## Retrieval

The archive was queried under the Government Notice category (`c=1`) with the keyword
`street name`. Because the all-period search is capped, each year was queried with the
matching period and year/volume filter (`yv=YYYY`):

- 2000–2011: `p=2011 or before`
- 2012–2016: `p=2016-2012`
- 2017–2021: `p=2021-2017`
- 2022–2026: `p=2026-2022`

Records whose subject contains `street name` were retained. This includes street name
declarations, additions, changes, deletions, intentions and corrigenda, while excluding
notices that only mention a street in their body text. Each retained Government Notice
has both the official English (`type=egn`) and Traditional Chinese (`type=cgn`) PDF.

The local retrieval manifest and content-addressed source PDFs are written to the
git-ignored path:

`data/hkgov/gld/egazette/street-name/`

The manifest records the publication date, issue and volume, Government Notice subject,
official URLs, local paths, byte lengths and SHA-256 hashes. The current retrieval
contains 594 notice records and 1,188 bilingual PDFs, covering 19 May 2000 through 3
July 2026.
`bun run dataops -- hkgov-landsd-streets:official-egazette --target local|preview|production`
reads and stages only bilingual PDFs dated 19 May 2000 through 21 January 2016 before
registering their managed assets. Notices from 22 January 2016 onward belong exclusively
to the LandsD notice stage, so no event is duplicated in the assembled lifecycle ledger.
Lifecycle links still require the LandsD curation workflow; `Previous G.N.` never
resolves a street ID. The staged records remain unpublished until a reviewed correction
revision can prove that historical enrichment preserves the published current street set
and canonical IDs.

The command uses English text as the authoritative source for Government Notice
identity, publication/effective dates, notice kind and `Previous G.N.` values. If an old
Traditional Chinese PDF has no usable text layer, it renders the original PDF at 300 DPI
and runs `baidu/Qianfan-OCR` at revision `623bf5d20d446abdb36606aa4547cd0c18886fe5`. The
Chinese name/description text is stored with parser provenance `method: "ocr"`,
engine/runtime version, model revision, language, DPI, raw Qianfan page JSON and the
retained unparseable native extraction. It is never represented as native publisher
text. Explicit HTML or Markdown table cells are converted to fixed text columns for the
Gazette parser. Chinese labelled description/name blocks support multiple street rows,
including wrapped descriptions and name labels omitted after the first row. Each row
must contain its own standalone name; missing names, ambiguous blocks, inconsistent
columns or merged cells fail extraction. The adapter preserves the notice postamble and
date outside the table. The English parser also ends the table at the plan inspection
postamble. English PDF facts remain authoritative.

Use the [Qianfan GPU runtime setup](../hku-hkgro/streetName.md#local-ocr). The same
pinned model, prompt, 300 DPI rendering, twenty-minute per-page inference timeout and
token-limit rejection apply. `SAANSEOI_QIANFAN_PYTHON` selects a compatible runtime and
`SAANSEOI_QIANFAN_TIMEOUT_MS` adjusts the timeout. The model runs locally on a
PyTorch-visible CUDA/ROCm GPU; initial weights require Hugging Face access or a
pre-seeded cache.

The command fails before publication when the English PDF cannot yield its authoritative
facts, or OCR cannot yield matching non-empty Chinese rows. Its error includes the
manifest publication date, issue/subject and both local PDF paths so an unsupported PDF
layout, missing OCR runtime, or damaged retrieval can be corrected deliberately.

## Upstream

- [e-Gazette search](https://egazette.gld.gov.hk/en/search-gazette)
- [e-Gazette important notices](https://egazette.gld.gov.hk/en/important-notices)
- [LandsD Government Notices and Plans for Street Naming](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)

## Publication readiness

Notice processing contributes evidence and lifecycle changes to the canonical Street
lineage. Its current projection uses a stable scope, with `streetPublicationState`
identifying the logical publication. The local compiler preserves unchanged rows and
timestamps, transmitting only final content differences. Scope reuse preserves the
notice identities and historical evidence.

Delivery checks its sealed scope token in every current write batch. Complete validation
records preparation; publication alone grants readiness, including for empty results.
Interrupted delivery remains unavailable. See the
[publication-state contract](../../publication-state-plan.md).
