# Routing companions and shared service

Regional basemap editions have optional routing companions generated from their exact
archived Guangdong OpenStreetMap source and published boundary. Regions are `hk`, `mo`
and `gba`. The region is established by the release URL; the Routing tab has no region
selector. OSRM is not published.

## Artefacts and access

The current and previous completed graph editions offer regional OSM PBF, Valhalla 3.8.3
and GraphHopper 11.1 packages. GraphHopper contains `car`, `bike` and `foot` profiles,
including CH preparations; Valhalla supports pedestrian, bicycle, auto and motor scooter
costing. These are engine-specific packages, not interchangeable graph formats. Runtime
configuration, source/build recipe and OSM attribution accompany each archive.
GraphHopper's pinned compiler JAR is downloaded separately by the recipe.

Public downloads require no API key:

- `/routing/{region}/{date}.json`: companion manifest and availability.
- `/routing/{region}/{date}/region.osm.pbf`: regional source extract.
- `/routing/{region}/{date}/{valhalla|graphhopper}.tar.gz`: engine package.
- `/routing/{region}/{date}/recipe.json` and `/rebuild.py`: retained build inputs and
  CLI.
- `/routing/{region}/latest.json`: latest completed companion edition.
- `/routing/{region}/{engine}/{engineVersion}/latest.json`: compatible discovery
  pointer.
- `/sources/guangdong/{date}.osm.pbf`: retained upstream snapshot, streamed from
  `ss-basemap-sources` without exposing other bucket keys.
- `/downloads/{region}/{date}.pmtiles`: full map archive.
- Existing dated regional `.boundary.geojson` endpoints are public too.

The release page shows a PMTiles button for every published edition and a regional OSM
PBF button for the latest two editions. Engine downloads appear on Routing. Retired
Routing tabs retain checksums, versions and regeneration commands instead of broken
links. Tile and TileJSON access continues to use the normal SaanSeoi key/origin policy.
Public archive access does not grant access to private routing compute.

## Build, publish and retain

```sh
# All regions, current and previous published basemap editions:
bun run routing:backfill

# Missing recipes for every historical basemap edition, without building graphs:
python3 scripts/routing/publish.py --region all --backfill --recipes-only

# One newly published basemap edition:
python3 scripts/routing/publish.py --region hk --version 2026-10-01
```

Requires Docker, Python 3.11+ and osmium-tool. Toolchain image digests, GraphHopper JAR
checksum and profile configuration live in `scripts/routing/toolchain.json`. Each recipe
pins source/boundary hashes and the engine configuration. The extraction uses
`osmium extract --strategy=complete_ways`; complete ways can extend beyond the exact
administrative boundary. No artificial polygon-edge segments are created. The source
edition date is not a claim that OSM was captured at midnight on that date.

`tiles:refresh` publishes companions after its regional basemap publication and preview
steps. Repeating a refresh reuses completed graph builds whose recipe identities and
archive hashes match. The publisher serialises its own operations with a workspace lock;
operate one publishing workspace. Basemap publication is not rolled back if a companion
fails: graph latest remains on the last complete edition and the command can be retried.

Payloads are uploaded before their completion manifest. Only after both engines and PBF
are published does the publisher update the edition catalogue and latest pointers. It
retains the newest two completed graph editions, independently of backfill order. Then
it marks older companion manifests retired and deletes exactly their `region.osm.pbf`,
`valhalla.tar.gz` and `graphhopper.tar.gz` R2 keys. Recipes, rebuild scripts, manifests,
PMTiles, boundaries and archived Guangdong sources remain. Partial retirement is
resumable. Retired payload endpoints return 410; metadata is not cached. No other object
family is eligible for graph retention deletion.

The archived Guangdong PBF is the long-term source of historical reproducibility. Public
recipes rebuild their fixed region from that snapshot and its exact boundary. They
reproduce the engine dataset/configuration; tar timestamps and tool/platform behaviour
do not promise byte-identical compressed archives. Keep source snapshots, engine
images/JARs and recipe metadata available for the desired retention period. The current
packages declare that elevation, live traffic, admin/timezone databases and transit
feeds have not been imported. Their publication is not route-quality or performance
certification.

## Shared private routing compute

`workers/routing` hosts Valhalla behind private Cloudflare service bindings:

- `ss-routing-prod`: production consumers.
- `ss-routing-preview`: preview consumers, separate namespace, credentials and engine.

Both use the latest compatible **GBA** Valhalla companion to cover all three regions.
The build downloads and verifies a pinned package before baking its graph into the
container image. Changing a remote latest pointer alone does not update a running image.
There is one named engine per environment, one vCPU/3 GiB RAM/2 GB disk and a
two-instance application ceiling. The engine starts on `/warmup` or `/route` and is
destroyed after 120 seconds idle. At most eight active calculations are admitted;
overload returns retryable 503. No periodic warm-up runs.

```sh
bun run deploy:routing:preview
bun run deploy:routing:prod
```

These commands deploy only routing compute. API credentials come from the scheduled job
environment or `ROUTING_CLOUDFLARE_ENV_FILE`. The generated owner-only client registries
under `.local/routing/clients-{production|preview}.json` stay out of Git.
`ROUTING_CLIENTS` is an environment-specific secret mapping app IDs to independently
revocable tokens. Requests carry `X-Routing-Client` and a matching bearer token. Each
client has a 300/minute service limit, while consumer apps remain responsible for
user-session checks and per-user limits. Hype's `routing:configure:prod` and
`routing:configure:preview` commands securely install its matching app token.

Neither service has a public route or workers.dev/preview URL. CORS/Origin is not used
as application authentication. The service accepts bounded two-point street requests and
returns the existing native envelope plus source edition metadata; app UI/session state
is not hosted here. Logs record client, status, mode, latency, graph release and colo,
without coordinates or raw errors. `/health` is authenticated and passive; `/stop` and
benchmark controls do not exist.

A monthly GBA graph publication also redeploys the shared production and preview images.
Standalone graph publication/backfill does not switch live compute until the explicit
deployment commands run. Rollback redeploys the previous retained GBA edition using its
pinned package and metadata; it must restore the container image together with Worker
metadata. A Worker-code-only rollback is not a graph rollback.

## Initial publication

September and October 2026 companions were backfilled for all three regions. Sizes below
are compressed archive MiB (1,048,576 bytes); published manifests contain exact byte
sizes and SHA-256 checksums.

| Region | Edition    | Regional PBF | Valhalla | GraphHopper |
| ------ | ---------- | -----------: | -------: | ----------: |
| HK     | 2026-09-01 |         36.1 |     20.7 |        21.2 |
| HK     | 2026-10-01 |         36.2 |     20.8 |        21.3 |
| MO     | 2026-09-01 |          2.9 |      1.6 |         1.6 |
| MO     | 2026-10-01 |          2.9 |      1.6 |         1.6 |
| GBA    | 2026-09-01 |        120.6 |    101.1 |       129.2 |
| GBA    | 2026-10-01 |        121.4 |    101.7 |       129.9 |

The initial shared production and preview deployments use `gba-2026-10-01`. Street
routing packages were built successfully; a GraphHopper package startup loaded all three
profiles. Public metadata, download sizes and release-page rendering were checked. No
route-quality, end-user latency or load certification was performed.

## Historical build recipes

Every published regional basemap edition has a routing recipe. Older editions that never
had hosted graph packages use `recipe-only` metadata: pinned engines and exact
source/boundary inputs, without invented graph hashes or sizes. These recipes apply the
pinned toolchain to historical OSM, rather than claiming a historical graph build. The
recipe-only publisher verifies source availability/size and boundary checksums, never
builds graphs, never changes latest pointers and never invokes retention. Existing
completed or retired package metadata is preserved.

The public Routing tab explains Valhalla's shared street graph and dynamic per-request
costing separately from GraphHopper's prepared profiles. It does not describe internal
service policies as graph format restrictions. The Release information popover explains
that only the latest two regional PBFs are downloadable; all published PMTiles remain
available independently of graph retention.
