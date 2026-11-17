# @saanseoi/hkgcode

Offline Hong Kong GeoCode encoding and decoding. The core has no runtime dependencies.
The optional WGS84 entry point uses Proj4 as a peer dependency. Neither entry point
performs network requests.

```ts
import { hk80ToHkgeocode, hkgeocodeCellOrigin } from '@saanseoi/hkgcode'
import { wgs84ToHkgcode } from '@saanseoi/hkgcode/wgs84'

hk80ToHkgeocode(839515.959, 817041.289) // K8FA38
hkgeocodeCellOrigin('K8FA3B') // { easting: 839515, northing: 817055, cellSize: 5 }
wgs84ToHkgcode([114.20839, 22.29241]) // K8FA3B
```

Install `proj4@^2.22.0` alongside this package when using `/wgs84`. Coordinates use
longitude, latitude order and decimal degrees. HK1980 coordinates use easting, northing
order and metres. The optional length argument is 2 (2 km), 4 (100 m), or 6 (5 m, the
default). Decoding returns a cell's southwest origin and width, not an address or a
surveyed point. Add the width to obtain the other three corners.

Coverage is E [800000, 864000), N [800000, 848000). Invalid inputs throw
`HKGeoCodeError`. Decoding accepts lowercase and outer whitespace, but rejects ambiguous
letters, internal separators and impossible grid indices.

Geographic conversion uses LandsD's published **ITRF96-to-HK1980 forward parameters**
(7P_ITRF96_HK80_V1.0), then Proj4 for the map projection. The `wgs84ToHkgcode` entry
point follows the API's ITRF96 reference-frame convention (epoch 1998:121); it does not
convert a modern GNSS observation's epoch. Geographic inputs must also satisfy the API
bounds: latitude 22.13–22.57° and longitude 113.82–114.48°.

## Live API comparison

**Result: 12,540 / 12,540 matching outcomes; zero mismatches.** This comprises 12,504
identical code strings and 36 matching out-of-range rejections.

Captured at **2026-11-17T01:39:43.040Z**, against API version **v23-10-2026**, using
Node **v24.2.0** and Proj4 **2.22.0**.

| Precision            | Geographic codes | Geographic range rejections | HK1980 grid codes | Mismatches |
| -------------------- | ---------------: | --------------------------: | ----------------: | ---------: |
| 2 characters / 2 km  |    2,096 / 2,096 |                     12 / 12 |     2,072 / 2,072 |          0 |
| 4 characters / 100 m |    2,096 / 2,096 |                     12 / 12 |     2,072 / 2,072 |          0 |
| 6 characters / 5 m   |    2,096 / 2,096 |                     12 / 12 |     2,072 / 2,072 |          0 |

The deterministic sample contains:

- 24 geographic locations across Hong Kong Island, Kowloon, the New Territories, Lantau,
  Cheung Chau, Lamma, Po Toi and Tung Ping Chau.
- One point in each of the 768 region cells, including offshore coverage. These region
  centres also exercise exact boundaries at the finer precisions.
- 792 boundary probes near twelve locations, on both axes at every precision, with
  offsets of 0, ±0.1 mm, ±0.5 mm, ±1 mm, ±1 cm and ±1 m.
- 512 pseudo-random grid points, generated with seed `20261117`.
- 12 probes at and immediately outside the documented geographic input bounds.

Every geographic input is sent with `inDatum: ITRF96` and `inUnit: decdeg`. The 2,072
generated grid inputs are also checked directly with `inDatum: HK1980`. Two random
points lie within the grid rectangle but outside the API's geographic latitude limit;
they remain in the test and must be rejected by geographic conversion. Some API range
failures omit the request ID, so range-limit probes are sent individually and matched
only to their single input. Unexpected API errors fail the comparison.

The test exposed boundary mismatches in the inverse `+towgs84` approach. LandsD's
separately rounded reverse parameters are not numerically interchangeable with its
published forward parameters. The implementation applies the forward matrix directly and
does **not** round projected coordinates before choosing a cell. Rounding merely to hide
numerical differences failed the sub-millimetre probes.

[The comparison script](scripts/compare-api.mjs) retains the exact requests, responses,
API versions, input points, results and source SHA-256 hashes in
[`tests/fixtures/api-comparison.json`](tests/fixtures/api-comparison.json). The ordinary
unit suite also replays these captured responses. From the SaanSeoi repository root:

```sh
# Build the small distribution used by the comparison.
bun run --cwd libs/hkgcode build
# Refresh evidence from the live API; exits nonzero on any mismatch.
bun libs/hkgcode/scripts/compare-api.mjs
# Check the current distribution against the captured responses without network access.
bun libs/hkgcode/scripts/compare-api.mjs --replay
```

This establishes 1:1 agreement for the recorded sample and API version, including the
boundary cases above. A finite sample does not prove equivalence for every possible
coordinate or future API revision, and matching the API does not establish survey
accuracy of the input location.

## Sources and implementation

- [Lands Department specification](https://www.landsd.gov.hk/en/survey-mapping/hkgcode.html)
- [API manual, revised 23 October 2026](https://www.geodetic.gov.hk/transform/tformAPI_HKGCode_manual.pdf)
- [Official pseudocode](https://www.geodetic.gov.hk/transform/pseudocode.pdf)
- [Forward datum transformation parameters](https://www.geodetic.gov.hk/common/data/parameter/7P_ITRF96_HK80_V1.pdf)
- [Geographic input limits](https://www.geodetic.gov.hk/transform/tformAPI_manual.pdf)

The published grid dimensions and worked examples take precedence over two apparent
pseudocode errors: subdivision divisions require parentheses around the residual, and
the northernmost region index is 23 (`Q`), not 31 (`Z`). Tests cover the worked
examples, boundaries, invalid inputs, all 768 region cells and the captured API
comparison.

## Licence

GPL-3.0-or-later. See `LICENSE` for the licence terms and `NOTICE` for retained
third-party notices.

## Development

Install dependencies with `bun install` from the repository root. Then, from the package
directory (`libs/hkgcode`):

```sh
bun run lint
bun run check
bun run test
bun run build
bun pm pack --dry-run
```

The package exports ESM and TypeScript declarations; Bun resolves the included
TypeScript source. Packing and publishing run the build automatically through the
`prepack` script.

### Versioning and release notes

The initial `0.1.0` release is documented in [CHANGELOG.md](CHANGELOG.md). Subsequent
package versions and changelog entries use the repository's Changesets workflow. From
the repository root, run `bun run changeset`, select `@saanseoi/hkgcode`, and record the
appropriate semantic-version change with a user-facing summary. Commit the Changeset
with the implementation. The release workflow consumes it to update the package version
and generate `CHANGELOG.md`; do not edit generated release notes by hand.

Lint and formatting inherit the repository's pinned Biome configuration. `bun run lint`
is read-only; `bun run format` intentionally rewrites package source and documentation.
The captured API response JSON is retained as generated evidence and is not reformatted
by these package scripts.
