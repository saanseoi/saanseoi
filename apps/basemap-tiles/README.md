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
reads, and `tilejson` enriches PMTiles metadata. `region-labels` remains responsible for
the geographic label filter.

## Public API

The Worker reads `basemap/regions.json` to resolve a release name to its R2 object. It
serves these public resources:

| URL                                                                      | Response                                |
| ------------------------------------------------------------------------ | --------------------------------------- |
| `/regions.json`, `/versions.json`, `/{region}/versions.json`             | Published catalogues                    |
| `/{region}-{date}.json`, `/{region}-latest.json`                         | TileJSON, including `saanseoi:boundary` |
| `/{region}-{date}.boundary.geojson`, `/{region}-latest.boundary.geojson` | The exact release clipping boundary     |
| `/{region}-{date}/{z}/{x}/{y}.mvt`                                       | A vector tile from the PMTiles archive  |

Use `?labels=inside` on a TileJSON URL to obtain tile URLs that retain only labels whose
anchors fall within the release boundary. This is intended for the basemap viewer’s
boundary mask. It requires MVT tiles and is deliberately short-lived.

Versioned releases are immutable and cached for one year. The moving `-latest` TileJSON,
its boundary, and label-filtered responses are cached for five minutes. The Worker does
not cache `404` responses, so a release that appears after a request can become
available immediately. A forced `-latest` rebuild versions the TileJSON’s tile URLs with
the archive ETag, avoiding mixed tiles from old and new archive contents.

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
development origins, and diagnostic origins may request tiles without a bearer token.
This keeps the SaanSeoi applications free of API-key or token plumbing. These requests
are not rate-limited or included in product usage analytics.

Every other caller must use a short-lived bearer token. Exchange a SaanSeoi API key at
the Atlas API, then send the returned token on tile requests:

```sh
curl -X POST https://api.saanseoi.hk/v0/auth/tokens \
  -H 'content-type: application/json' \
  -H 'x-api-key: SS-your-api-key' \
  --data '{"audience":"basemap-tiles"}'

curl https://tiles.saanseoi.hk/hk-latest.json \
  -H 'authorization: Bearer <access-token>'
```

Tokens last 15 minutes, are valid only for the target product and deployment
environment, and identify the API key for rate limiting and Analytics Engine usage
reporting. The tiles product currently permits 600 requests per key per minute; this
edge limiter is an eventually consistent abuse guard, not a billing ledger.

An `Origin` header is browser metadata, not proof of caller identity: a non-browser
client can forge it. The first-party origin policy is therefore a browser convenience,
not an authorisation boundary. Do not add untrusted domains to it, and never embed an
API key in browser-delivered code.

`AUTH_MODE` is `required` in deployment. `bun run dev` overrides it to transparent local
access. Use `bun run dev:auth` plus a matching `ACCESS_TOKEN_PUBLIC_JWK` in `.dev.vars`
to exercise bearer verification locally.
