# LandsD street names

The Lands Department publishes a complete gazetted street-name list as a PDF and later
changes in bilingual Government Notices and Gazette Plans tables. SaanSeoi treats the
PDF as the initial register and every notice row—including changes, deletions and
corrigenda—as an immutable source record.

The source is
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).
The initial source release is `2016-01-01.0`; it excludes only exact normalised
English-name matches represented by a later notice and emits an exclusion audit. Notice
releases are one per publication day.

## Ingestion and evidence

`saanseoi ingest:hkgov-landsd-streets --target preview|production` downloads both the
English and Traditional Chinese pages, pairs their rows by publication and evidence
identity, and fails if either language has an unmatched or ambiguous row. Incremental
runs can select immutable notice IDs with `--notice-id`.

The ingestion retains the two HTML snapshots, the gazetted list PDF, every English and
Traditional Chinese Government Notice PDF, and every Gazette Plan PDF. Every object has
a SHA-256-addressed immutable key below `by-source/hk/hkgov-landsd/street-naming/`, with
a JSON manifest alongside it. The bucket is private. Each structured, role-tagged asset
link contains both the original LandsD URL and the managed public asset URL; no
duplicate notice or plan URL fields are stored. Plan WebP renders are additional
release-note previews and never replace the source PDF.

Any missing or broken source asset writes an `operator-report.json` and blocks the
release. The same report records bilingual page counts, pairing failures, translation
counts, and the baseline-exclusion audit.

## Names and districts

English and Traditional Chinese names remain publisher text. Unique Traditional Chinese
names are translated to Simplified Chinese with Azure Translator v3 (`yue` to
`zh-Hans`), cached by source-text hash, and carry `machine: azure-translator-v3`
provenance. Translation failures block publication; Traditional Chinese is never used as
a silent fallback.

The original district label and baseline district code are preserved. At import time
they are resolved against the current canonical district snapshot and persisted as
`districtIds`. An unresolved district is a blocking quality error. This supplies the
district coverage map and distribution statistics without making publisher labels or
canonical IDs substitutes for one another.

## Releases and retry safety

The source/history shard is `BEFORE` for the baseline and 2016–2024 notices, `2025` for
2025 notices, and `2026` for 2026 notices. A daily release clones its preceding street
snapshot, then adds or revises only records with that day's immutable notice IDs.
Current and history tables therefore retain notices even where a street is changed,
removed, restored, or corrected.

The updater moves `.local/harbour/update-state.json` only after source evidence,
translations, fixtures, source/history/current rows, and release publication all
succeed. Its cursor advances by successfully published notice date, allowing a failed
later date to retry safely.

## Upstream

- [LandsD Government Notices and Plans](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Traditional Chinese notices and plans](https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Gazetted Street Name list](https://www.landsd.gov.hk/doc/en/street-name/Gazetted_Street_Name.pdf)
