# @saanseoi/hkgcode

## 0.1.0

### Initial release

Add offline Hong Kong GeoCode encoding and decoding at 2 km, 100 m and 5 m precision,
with a dependency-free HK1980 core and an optional Proj4 geographic entry point.

Use the published ITRF96-to-HK1980 forward transformation and validate geographic
coverage. All 12,540 recorded API outcomes match, including cell boundaries and range
rejections. Include a reproducible comparison and offline regression fixtures.

Distribute the package under GPL-3.0-or-later with TypeScript declarations and Bun
source exports.
