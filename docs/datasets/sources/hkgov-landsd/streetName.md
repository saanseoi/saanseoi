# LandsD street names

The Lands Department publishes a complete gazetted street-name list as a PDF and
separate bilingual Government Notices and Gazette Plans. SaanSeoi publishes the current
register first. Historical evidence and lifecycle reconstruction are separate revision
work and do not block that release.

The source is
[`ds-hk-hkgov-landsd-street`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-street.json).

## Current register publication

Run:

```bash
bun run dataops -- hkgov-landsd-streets:current --target local|preview|production
```

The focused Streets initialiser runs this command. It:

1. downloads or reuses the retained `Gazetted_Street_Name.pdf`;
2. registers the PDF and its manifest as managed source evidence;
3. extracts and validates the complete English and Traditional Chinese register;
4. resolves every baseline source-record key through the checked-in canonical identity
   registry;
5. writes a baseline-only Parquet payload and source-release notes;
6. publishes the ordinary source release and current Street snapshot; and
7. verifies an already-published identical cohort as a no-op on rerun.

The release version is the retained PDF's acquisition date with a generated correction
suffix. The identity registry pins that version to the exact PDF SHA-256, so the same
bytes keep the same cohort across targets. No artificial historic date is used.

The current-release preflight requires:

- at least one baseline source record and no notice records;
- unique source-record keys and canonical IDs;
- `deferToNotices: false` on every row;
- English and Traditional Chinese publisher names on every row;
- exactly one registered baseline-PDF reference with the pinned SHA-256; and
- exact coverage by the identity registry.

The initial baseline materialises active streets at version 1 without creating changelog
entries. The source PDF remains evidence on the retained source records.

## Canonical identity registry

[`fixtures/meta/curations/hkgov-landsd-street-baseline.json`](../../../../fixtures/meta/curations/hkgov-landsd-street-baseline.json)
is the environment-independent bridge between immutable baseline source-record keys and
opaque canonical street IDs. Each entry also keeps the publisher names and district
codes so source drift is reviewable.

The first local run may create or extend this registry. Preview and production runs
refuse to publish when the retained PDF, record set, or IDs differ from the checked-in
registry. Review and commit the local registry update before publishing the same cohort
remotely. Names, districts, source-row order, and future geometry never derive or
replace the opaque ID.

## Historical revisions

The existing historical stages remain explicit:

```bash
bun run dataops -- hkgov-landsd-streets:landsd-notices --target local|preview|production
bun run dataops -- hkgov-landsd-streets:official-egazette --target local|preview|production
```

They stage, preserve, and parse evidence but are not part of current-register
initialisation. A later reviewed assembler will publish their output as a correction
revision of the current cohort. It must resolve identities through the published
baseline bridge and prove that historical enrichment does not unexpectedly replace the
present-day street set.

The LandsD notice stage covers bilingual source-page notices from 22 January 2016. The
official e-Gazette stage covers 19 May 2000 through 21 January 2016; the non-overlapping
boundary prevents duplicate ingestion. HKGRO discovery remains evidence-only until its
facts and identity decisions are reviewed.

Only declarations which create a new street can be automatic. Changes, deletions,
corrigenda, and intentions affecting an existing street require an explicit application
to a canonical ID. `Previous G.N.` is publisher provenance, never an identity resolver.
Unresolved lifecycle curation blocks the historical revision even when `--yes` is used.

The notice source ledger retains bilingual names and descriptions, notice identity and
type, Gazette and effective dates, previous-notice references, parsed raw text,
diagnostics, evidence links, and the reviewed application. The source hash includes the
application, Gazette date, and notice type so a curation or parser correction is
reprocessed.

Live LandsD downloads are restricted to the documented HTTPS origin. Historical
e-Gazette files are read from the curated local archive. Managed evidence links carry
the original URL, retained asset URL, media type, SHA-256, role, retrieval time, and
publisher identifier where available.

## Names and districts

English and Traditional Chinese are retained as publisher text. Simplified Chinese is
not part of the current Street contract. Publisher district codes are resolved against
the published canonical Overture district snapshot during materialisation; an unresolved
district blocks publication.

Road Centreline is optional for Street-name publication. A later geometry release can
enrich the same identities without becoming their source of truth.

## Upstream

- [LandsD Government Notices and Plans](https://www.landsd.gov.hk/en/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Traditional Chinese notices and plans](https://www.landsd.gov.hk/tc/survey-mapping/mapping/street-geographical-place-naming/street-naming.html)
- [Gazetted Street Name list](https://www.landsd.gov.hk/doc/en/street-name/Gazetted_Street_Name.pdf)
- [Hong Kong e-Gazette](../hkgov-gld/egazetteStreetName.md)
