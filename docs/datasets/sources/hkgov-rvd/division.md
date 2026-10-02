# RVD Property Review area membership

RVD source rows retain PDF page evidence in `properties`. The shared PDF member belongs
in the processing receipt; `hkgovRvdAreas` has no `sourceLocator` column.

The ingredient is the **Areas and Districts** appendix of the **Hong Kong Property
Review 2015**, published by the Rating and Valuation Department on **30 April 2015**.
The
[Government announcement](https://www.info.gov.hk/gia/general/201504/30/P201504300318.htm)
confirms publication at 15:02 HKT. The review discusses the 2014 property market and
forecasts for 2015–2016; those reference years are not its release date.

The [bilingual PDF](https://www.rvd.gov.hk/doc/tc/hkpr15/06.pdf) contains four pages.
Its embedded creation and modification dates are 21 and 27 April 2015 respectively;
these identify file preparation, not publication. The source edition is `2015-04-30.0`
and belongs in the BEFORE SOURCE shard.

## Extraction and retention

```sh
bun apps/harbour-dataops/src/cli.ts hkgov-rvd:areas path/to/06.pdf \
  --out-dir .local/rvd --target local
```

The parser uses Poppler word coordinates to keep Chinese, English and tertiary planning
unit columns separate. It is pinned to the exact PDF SHA-256 and fails for other files.
The retained ZIP includes the PDF, parsed records, checksum, publication URL and date.
Ordinary native-source ingestion registers the archive and imports `hkgovRvdAreas`
without creating a competing canonical Division snapshot. The full Divisions initialiser
ingests this locked local appendix before publishing curated SaanSeoi Divisions that
reference its membership assertions.

There are 148 assertions: 3 areas, 18 districts, 126 subdistricts and 1 explicitly
included locality (Tung Chung under Lantau Island). District rows retain the listed
tertiary planning units, including `(p)` markers. The separate Office Sub-districts
section is outside this ingredient's scope and is recorded as an excluded section.

Source keys such as `RVD:HKPR2015:p1:district-YTM:subdistrict-1` are synthetic document
locators. RVD does not assign these keys or our abbreviated division codes.

## Membership contract

The SaanSeoi SOURCE payload uses `memberships`, an array of collection assertions:

```json
{
  "collection": "rvd-areas-and-districts",
  "dataset": "ds-hk-hkgov-rvd-division",
  "release": "dr-hk-hkgov-rvd-division-2015-04-30.0",
  "record_id": "RVD:HKPR2015:p1:district-YTM:subdistrict-1",
  "key": "KL:YTM:TST",
  "keyAuthority": "saanseoi"
}
```

`record_id` links to the retained assertion. `key` is a readable SaanSeoi path,
constructed from the source's historical area/district grouping and our curated code; it
is not an RVD identifier or the current spatial hierarchy. The source release makes
historical membership explicit. Other lists can use their own collection and release
without adding a publisher identifier that never existed. This evidence field is
retained in the source archive; it is not a new public API response field.

The explicit crosswalk is
`fixtures/meta/curations/saanseoi-division/division-identity-matches.json` under
`sourceMemberships.rvd`. It matches 147 assertions, including the curated Mei Foo
neighbourhood and Tung Tau microhood. Lei Muk Shue is excluded from Division membership
because it represents an estate. Its native assertion remains in SOURCE.

The appendix establishes inclusion in this RVD publication. It does not establish
statutory status, current district boundaries or the completeness of Hong Kong's
locality inventory. West Kowloon Reclamation is retained as an alias of West Kowloon.

## Processing policy ownership

Native ingestion validates the prepared archive and retains RVD area assertions in
`hkgovRvdAreas`. Geography identity resolution is a Division snapshot assembly policy;
SOURCE intake does not invent geometry or canonical classification.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.
