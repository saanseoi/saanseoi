# SaanSeoi basemap tiles

`ss-protomap` is the public Cloudflare Worker for the SaanSeoi basemap. It serves the
PMTiles releases in the `ss-pmtiles` R2 bucket at `https://tiles.saanseoi.hk`; it does
not expose PMTiles archives for download.

The [basemap tiles guide](../../docs/tiles.md) is the source of truth for building,
publishing, retracting, and storing releases. The
[basemap library](../../libs/basemap/src/index.ts) owns the shared URL and R2-key
conventions used by this Worker and the release viewer.

## Structure

`src/index.ts` coordinates requests only. Its local `src/lib/` modules own distinct
concerns: `access` applies origin access policy, `cache` handles Worker Cache API
responses, `catalogue` reads and validates release metadata, `pmtiles` adapts R2 range
reads, and `tilejson` enriches PMTiles metadata.

## Public API

The Worker reads `basemap/regions.json` to resolve a release name to its R2 object. It
serves these public resources:

| URL                                                                      | Response                                |
| ------------------------------------------------------------------------ | --------------------------------------- |
| `/regions.json`, `/versions.json`, `/{region}/versions.json`             | Published catalogues                    |
| `/releases/{region}/{date}.json`                                         | Immutable release provenance manifest   |
| `/{region}-{date}.json`, `/{region}-latest.json`                         | TileJSON, including `saanseoi:boundary` |
| `/{region}-{date}.boundary.geojson`, `/{region}-latest.boundary.geojson` | The exact release clipping boundary     |
| `/{region}-{date}/{z}/{x}/{y}.mvt`                                       | A vector tile from the PMTiles archive  |

Versioned releases are immutable and cached for one year. The moving `-latest` TileJSON,
and its boundary are cached for five minutes. The Worker does not cache `404` responses,
so a release that appears after a request can become available immediately. A forced
`-latest` rebuild versions the TileJSON’s tile URLs with the archive ETag, avoiding
mixed tiles from old and new archive contents.

Release manifests are deliberately public and do not require a token. They are safe,
immutable provenance records intended for diagnostic reports; all other tile-service
resources continue to follow the normal browser-origin or bearer-token policy.

## Development and deployment

The Worker has one deployment only: `ss-protomap` with the `ss-pmtiles` binding. Do not
pass a Wrangler environment name.

```sh
# From the repository root
bun run --filter=basemap-tiles dev
bun run --filter=basemap-tiles dev:auth # requires local token-verification secrets
bun run --filter=basemap-tiles check
bun run --filter=basemap-tiles test
bun run --filter=basemap-tiles build # Wrangler dry-run
bun run --filter=basemap-tiles deploy
```

`wrangler dev` uses local R2 storage by default. Regenerate the bindings after changing
[`wrangler.jsonc`](wrangler.jsonc):

```sh
bun run --filter=basemap-tiles cf-typegen
```

## Cross-origin access

The Worker reflects allowed `Origin` values and sends `Vary: Origin`. Its configured
origins cover the SaanSeoi/HYPE domains, designated local and diagnostic clients, and
the currently permitted external origins. Keep any change to those rules in
[`wrangler.jsonc`](wrangler.jsonc) aligned with the consumers that need browser access.

## Access and usage metering

First-party browser callers at the configured hub origins, core domain suffixes, local
development origins, and diagnostic origins may request tiles without a public key. This
keeps the SaanSeoi applications free of API-key plumbing. These requests are not
rate-limited or included in product usage analytics.

Every other caller sends a public SaanSeoi API key (prefixed `pk.`) directly. Use the
`access_token` query parameter when a map library cannot set request headers, or send an
`X-API-Key` header:

```sh
curl 'https://tiles.saanseoi.hk/hk-latest.json?access_token=pk.your-public-key'

curl https://tiles.saanseoi.hk/hk-latest.json \
  -H 'x-api-key: pk.your-public-key'
```

The edge stores a 15-minute authorisation lease per key in KV, validates the key's
current status when renewing that lease, and identifies the key for rate limiting and
Analytics Engine usage reporting. The tiles product currently permits 600 requests per
key per minute; this edge limiter is an eventually consistent abuse guard, not a billing
ledger.

An `Origin` header is browser metadata, not proof of caller identity: a non-browser
client can forge it. It is used for usage attribution and future browser-domain
policies, not as an authorisation boundary. A `pk.` key is intentionally public and may
be embedded in browser-delivered code; never treat it like a server secret or put it in
logs or source control.

`AUTH_MODE` is `required` in deployment. `bun run dev` overrides it to transparent local
access. Use `bun run dev:auth` with local KV and Durable Object storage to exercise
public-key verification locally.
