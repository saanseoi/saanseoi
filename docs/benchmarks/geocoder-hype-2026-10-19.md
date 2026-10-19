# SaanSeoi versus Hype geocoding

SaanSeoi scores higher on this fixed 25-place sample, particularly for complete
addresses. Hype's preprocessing loses useful components in several cases; direct ALS
performs better than Hype's complete-address flow. Reverse selection remains imperfect
in both systems, with distinct cases where Hype is better.

## Results

Scores are manual first-result building/street agreement, using the same Google
references and original rubric as the [SaanSeoi evaluation](geocoder-2026-10-19.md).
Ignore floor/unit detail, casing, abbreviations and transliteration. Accept a matching
street/number range or explicitly named building, but reject a conflicting facility.
Strict agreement retains letter-suffix distinctions. A returned candidate is not
necessarily an agreeing candidate.

| Mode                      |        SaanSeoi | Current Hype flow | Direct ALS control |
| ------------------------- | --------------: | ----------------: | -----------------: |
| Complete listing          | **22/25 (88%)** |       13/25 (52%) |        18/25 (72%) |
| Simplified address        | **19/25 (76%)** |       18/25 (72%) |        18/25 (72%) |
| Reverse structured result | **16/25 (64%)** |       12/25 (48%) |     Not applicable |

Hype's English reverse display text alone agrees in 13/25 cases. It is a separate
measure because Hype preserves that label from HK Map Service while merging ALS
structured fields and coordinates. The main reverse score evaluates the returned
structured address. This exposes enrichment conflicts instead of treating an agreeing
English label as proof that the whole returned result agrees.

Under the requested policy of ignoring suffixes, SaanSeoi versus Hype scores are:
complete **24/25 versus 13/25**, simplified **21/25 versus 20/25**, and reverse **17/25
versus 13/25**. Direct ALS scores 18/25 complete and 20/25 simplified under that policy.
These counts do not verify that a suffixed premise is the same identity as its numeric
stem.

Hype returns one result in all 75 cases. SaanSeoi returns candidates in 25 reverse, 24
complete and 24 simplified cases. Hype's single-result configuration does not provide a
comparable top-five or candidate-ambiguity score. All 75 Hype lookups and 50 additional
direct-ALS controls completed; all 150 underlying HTTP requests returned 200. HTTP
success alone does not establish matching quality.

## What was exercised

The runner imports the actual Hype source functions read-only, from commit
`505bd7585545c8bc955061db47e6cef2d4cecee4`. Source-file hashes are retained with the
responses. The Hype checkout was clean during identification.

- Forward import flow: `getAddressForQuery(input, 'en')`,
  `fetchALSResultFromAddress(queryAddress)`, then `processForwardGeocodeResult`. This
  reproduces the geocoding portion of `GeoLookupStep.svelte`, without its cache.
- Forward provider: `https://www.als.gov.hk/lookup`, with Hype defaults `t=60`, `n=1`,
  `3d=0`. Floor/unit text is retained locally rather than passed as a 3D request,
  matching the current import call site.
- Reverse: Hype's `reverseGeocode(lng, lat)`, as called by `GeoLocationModal.svelte`.
  This calls HK Map Service with radius 500 metres and Web Mercator coordinates, then
  ALS-enriches the returned street address.
- Direct ALS control: the same original complete and simplified strings, with Hype's
  provider defaults but without `getAddressForQuery`. All simplified result labels were
  identical to the Hype-flow run.

The fixture contains the same 25 listings and 75 inputs. SaanSeoi results come from its
retained local run on `data-hk-addresses-2026-09-23.0`, radius 1,000 metres and limit 5.
Government services were queried live on 19 October 2026 and do not expose a matching
release pin here. All selected SaanSeoi reverse first results were within 100 metres, so
none relied on the extra 500 metres of search radius.

This is a local execution of Hype functions, not a browser/CORS or deployed-Hype test.
There are no translation credentials or cached results in the runner. It adds a
30-second network timeout and 500 ms pacing per request; neither affected response
selection. Public-service network latency and the isolated local SaanSeoi latency are
not comparable speed measurements.

## Findings that affect the replacement decision

1. **Hype can remove the most useful part of a complete address.** The One IFC listing
   becomes `Central`, and ALS returns Central Heights at 9 Tong Tak Street in Tseung
   Kwan O. Kings Wing Plaza's Chinese listing becomes `Sha Tin`, returning a Shatin
   Hospital facility. The 75 Yeung Uk Road listing becomes `Tsuen Wan`, returning
   another road. Direct ALS improves complete-address agreement from 13 to 18 cases.
2. **SaanSeoi adds value beyond preserving the raw string.** It correctly resolves
   several full listings that direct ALS misidentifies, including One IFC, Century
   Centre at 44–46 Hung To Road, 75 Yeung Uk Road and Kings Wing Plaza 1.
3. **Hype's reverse enrichment can combine incompatible evidence.** For the Crawford
   House pin, English display says 19 Stanley Street, but structured fields and
   coordinates come from Country Apartment at 19 Stanley Village Road. For Texaco Road,
   English display says 220 while enriched fields say 188–202. Hype retains the original
   reverse distance alongside the enriched coordinates. Comparisons therefore
   recalculate distance from coordinates and never trust that mixed field.
4. **Hype is better on some reverse cases.** It finds 3 On Kwan Street and Kin Tak
   House, where SaanSeoi ranks Technology Park and Shun Hing Building first.
5. **A plausible result can be worse than no result.** Tai Wai Market is unmatched in
   SaanSeoi. Hype's simplified lookup returns Old Tai Po Market Railway Station.
6. **Broad shared addresses remain ambiguous.** A bare 1 Harbour View Street returns IFC
   Mall in Hype. A bare Gold Coast road/section address returns Block 1 rather than the
   explicitly named Gold Coast Piazza. These do not establish the intended facility
   simply because a street number agrees.

Hollywood House at number 27 is accepted at building level where Hype identifies that
same explicitly named building; the reference is its 29 frontage. Hype's English reverse
display alone omits the building, so its display-only score for that case is false. The
per-case review makes this judgement explicit.

## Recommendation

Proceed towards a staged SaanSeoi replacement, subject to production authentication,
CORS and availability checks, rather than treating Hype's current matching as the
accuracy target. Keep candidate selection visible. Retain the government reverse service
as a comparison/fallback option while testing linked building evidence on the cases each
system gets wrong. A separate, broader holdout sample is needed before claiming Hong
Kong-wide accuracy.

If Hype remains in service during that work, preserve meaningful street/building
components in its forward preprocessing and reject contradictory ALS reverse enrichment.
Those fixes are supported by this comparison but are not made by this read-only
benchmark task.

## Per-place first-result agreement

Each cell is **SaanSeoi / Hype**, using the strict structured-address rubric. A cross
means the returned first result disagrees, or no candidate was returned.

| Reference                          | Complete | Simplified | Reverse |
| ---------------------------------- | -------- | ---------- | ------- |
| 70 Queen's Road Central            | ✓ / ✓    | ✓ / ✓      | ✓ / ✗   |
| 29 Hollywood Road                  | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 1 Harbour View Street              | ✓ / ✗    | ✗ / ✗      | ✓ / ✗   |
| 200 Queen's Road East              | ✓ / ✓    | ✗ / ✓      | ✓ / ✗   |
| 173-174 Gloucester Road            | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 13 Swatow Street                   | ✓ / ✗    | ✓ / ✓      | ✗ / ✗   |
| 139A Sai Yee Street                | ✗ / ✗    | ✗ / ✗      | ✗ / ✗   |
| 160 Prince Edward Road West        | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 164 Prince Edward Road West        | ✗ / ✗    | ✗ / ✗      | ✗ / ✗   |
| 8 Tsun Yip Lane                    | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 50 Hoi Yuen Road                   | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 44-46 Hung To Road                 | ✓ / ✗    | ✓ / ✓      | ✓ / ✓   |
| 220-248 Texaco Road                | ✓ / ✗    | ✓ / ✓      | ✓ / ✗   |
| 32-36 Hau Tei Square               | ✓ / ✓    | ✓ / ✗      | ✓ / ✓   |
| 75 Yeung Uk Road                   | ✓ / ✗    | ✓ / ✓      | ✗ / ✗   |
| 3 On Kwan Street                   | ✓ / ✗    | ✓ / ✓      | ✗ / ✓   |
| 27-31 Au Pui Wan Street            | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| Tai Wai Market                     | ✗ / ✗    | ✗ / ✗      | ✗ / ✗   |
| 8 Heung Sze Wui Street             | ✓ / ✓    | ✓ / ✓      | ✓ / ✓   |
| 4 Tsing Yuen Street                | ✓ / ✗    | ✓ / ✓      | ✗ / ✗   |
| 63 On Ning Road                    | ✓ / ✓    | ✓ / ✗      | ✓ / ✓   |
| 10-16 Kin Tak Street               | ✓ / ✓    | ✓ / ✓      | ✗ / ✓   |
| 8 Yan Po Road                      | ✓ / ✗    | ✓ / ✓      | ✓ / ✗   |
| 1 Castle Peak Road Castle Peak Bay | ✓ / ✗    | ✗ / ✗      | ✓ / ✗   |
| Fu Tung Market                     | ✓ / ✓    | ✓ / ✓      | ✗ / ✗   |

## Artefacts and reproduction

- [Unchanged reference fixture](../../scripts/geocoding/fixtures/florists-2026-10-18.json)
- [Hype inputs, provider responses and processed results](geocoder-hype-2026-10-19.responses.json)
- [Direct ALS control responses](geocoder-als-direct-2026-10-19.responses.json)
- [Manual per-case comparison and summaries](geocoder-hype-2026-10-19.review.json)
- [Runner](../../scripts/geocoding/compare-hype.ts)

Run from SaanSeoi; the runner imports the sibling Hype checkout by default:

```fish
bun scripts/geocoding/compare-hype.ts --hype-repo /home/io/code/hype
bun scripts/geocoding/compare-hype.ts --direct-als --output /tmp/geocoder-als-direct.json
```

The runner checkpoints every result and excludes the provider key from recorded URLs.
Google listings/pins are references rather than surveyed truth; this small purposive
sample supports a local comparison, not a general accuracy guarantee.
