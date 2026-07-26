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

Use `--year 1901,1902` only for a bounded acquisition or repair run. The normal command
indexes all available years. The workflow retains the archive session cookie and retries
the annual TOC request once because HKGRO may initially return its generic landing page.

## Classification and lifecycle boundary

Candidate selection is high-recall discovery, not a finding that a notice changes a
street name. Manifest records start as `unclassified` or `not-candidate`; later review
may mark a candidate `street-name`, `not-street-name`, or `manual-review`. No HKGRO row
is currently materialised into the LandsD street lifecycle, published to R2, or used to
infer canonical street identity. Before that integration, each scan needs explicit OCR
provenance, parsed facts, and a reviewed lifecycle/identity decision.

## Upstream

- [HKGRO annual Government Gazette browsing](https://sunzi.lib.hku.hk/hkgro/browse.jsp)
- [Hong Kong e-Gazette historical street-name notices](../hkgov-gld/egazetteStreetName.md)
