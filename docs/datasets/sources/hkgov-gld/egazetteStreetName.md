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
`bun run dataops -- hkgov-landsd-streets:backfill --target local|preview|production`
reads the manifest and parses every bilingual PDF before registering archive assets.
Parsed notices before 2016 are immutable source events in the LandsD street lifecycle
ledger, while notices also present in the post-2015 LandsD HTML forward feed contribute
a separately role-tagged `historicalGovernmentNotice` evidence asset to that event
rather than creating a duplicate event. Lifecycle links still require the LandsD
curation workflow; `Previous G.N.` never resolves a street ID.

The command uses English text as the authoritative source for Government Notice
identity, publication/effective dates, notice kind and `Previous G.N.` values. If an old
Traditional Chinese PDF has no usable text layer, it renders the original PDF at 300 DPI
and runs PaddleOCR with its `chinese_cht` model. The resulting Chinese name/description
text is stored with parser provenance `method: "ocr"`, engine, engine version, model,
language, DPI and the retained unparseable native extraction. It is never represented as
native publisher text.

PaddlePaddle does not support Python 3.14. The OCR runtime is a UV-managed Python 3.12
subproject at `apps/harbour-dataops`; create or update it with:

```bash
uv python install 3.12
uv sync --project apps/harbour-dataops --python 3.12
```

The ingest automatically uses `apps/harbour-dataops/.venv/bin/python`. Set
`SAANSEOI_PADDLEOCR_PYTHON` only to override that UV environment. Model weights are
managed by PaddleOCR and are downloaded on its first use; network access to its model
host (or a pre-seeded PaddleOCR model cache) is therefore required. This is an explicit
host dependency, like the existing Poppler PDF tools, rather than a hidden network
fallback.

The command fails before publication when the English PDF cannot yield its authoritative
facts, or OCR cannot yield matching non-empty Chinese rows. Its error includes the
manifest publication date, issue/subject and both local PDF paths so an unsupported PDF
layout, missing OCR runtime, or damaged retrieval can be corrected deliberately.

## Upstream

- [e-Gazette search](https://egazette.gld.gov.hk/en/search-gazette)
- [e-Gazette important notices](https://egazette.gld.gov.hk/en/important-notices)
- [LandsD Government Notices and Plans for Street Naming](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
