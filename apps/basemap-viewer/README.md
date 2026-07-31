# SaanSeoi basemap release viewer

This independent static app compares releases through the public tile catalogue and
TileJSON endpoints. It never requests a `.pmtiles` archive directly.

## Release diagnostics

Choose a second release in **Compare with** to render synchronised primary and
comparison maps side by side, as an overlay, or in **Differences** mode. Differences
uses the compared release as the map base, showing labels added in that release in green
and labels removed from it in red; geometry changes are ignored. The diagnostics control
reports the immutable resolved release, TileJSON metadata, clipping/boundary health,
tile request timing and failures, and links to its public provenance manifest. It also
provides MapLibre tile-boundary, collision-box, and overdraw modes, plus
click-to-inspect rendered features. Copy report creates a self-contained JSON issue
payload including the current share URL.

## Development

```bash
cd viewer
npm install
npm run dev
```

Vite uses port `5174`, which is an allowed local origin for `tiles.saanseoi.hk`. Set
`VITE_TILE_ORIGIN` only when testing against a compatible alternate tile service. It
defaults to `https://tiles.saanseoi.hk`.

```bash
npm test
npm run build
```

## Cloudflare Workers deployment

The viewer is a static-assets Cloudflare Worker named `saanseoi-basemap-viewer`. Its
configuration attaches the `viewer.saanseoi.hk` custom domain. From the repository root,
deploy the tiles and viewer Workers together:

```bash
bun run deploy
```

To deploy only the viewer Worker:

```bash
bun run deploy:viewer
```

The existing tiles Worker already permits `*.saanseoi.hk` as a CORS origin; no change to
its CORS configuration is required.

## Fonts

The default glyph URL uses KlokanTech's public Noto Sans CJK PBF archive, which contains
Traditional Chinese, Simplified Chinese, Japanese, and Latin glyphs. For a first-party
production dependency, host the same PBF directory under a SaanSeoi static domain and
set `VITE_GLYPH_URL` to its `{fontstack}/{range}.pbf` template at build time.

## Region boundary mask

Each TileJSON release advertises its own exact clipping footprint as a GeoJSON boundary
artefact. The viewer loads that artefact, masks the area outside it, and draws its
outline below filtered labels. Symbols use a separate, viewer-only tile source that
retains only features whose label anchor is inside the same footprint. This prevents
external labels and empty regional tiles from being mistaken for ocean without adding
external map features to the PMTiles archive.
