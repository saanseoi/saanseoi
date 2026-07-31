# Basemap tiles

## Access

SaanSeoi's own browser applications can call the tiles Worker without an API key or
bearer token. Other callers exchange a SaanSeoi API key for a 15-minute `basemap-tiles`
bearer token at `POST /v0/auth/tokens` on the Atlas API, then use that token in the
`Authorization: Bearer …` header. See the
[tiles Worker README](../apps/basemap-tiles/README.md#access-and-usage-metering) for the
request format, quotas, and the important distinction between the browser-only origin
convenience and authentication.

`saanseoi tiles:refresh` builds and publishes date-versioned Protomaps basemap extracts.
It defaults to the Greater Bay Area (GBA):

```sh
saanseoi tiles:refresh
saanseoi tiles:refresh --region mo
```

Supported regions are `gba`, `hk` (`hongkong`), and `mo` (`macau`). A GBA refresh
provisions three same-date archives: the consolidated `gba` basemap plus standalone Hong
Kong and Macao maps. If a Hong Kong or Macao release already exists for the current HKT
date, a normal refresh leaves it in place instead of rebuilding it.

Every tileset is clipped to its exact OSM administrative boundary during tile
generation. The command resolves and dissolves the region relations into one GeoJSON
footprint, then passes it to Protomaps with `--clip-buffer=0`. Consequently, vector-tile
features outside the boundary are absent from the PMTiles archive rather than merely
hidden by the viewer. Labels whose anchors fall within the boundary remain intact;
labels outside it are omitted. The boundary relation identifiers and exact-buffer policy
are included in the release manifest.

The same resolved footprint is published as a versioned GeoJSON boundary artefact beside
each archive. The `-latest` boundary pointer advances with `-latest.pmtiles`. Consumers
use this artefact to mask the area outside a regional extract without inventing water or
including external map features.

During the build, OpenStreetMap's global land-polygons dataset is intersected exactly
with the regional footprint. Its complement within that footprint becomes the regional
water geometry. These are emitted into the PMTiles archive itself as its `earth` and
`water` layers, before tiling. This preserves a stable coastline and water holes at
every zoom level without including features outside the region or requiring a special
viewer-side overlay.

The GBA archive is not a bounding box and is not a Guangdong basemap. The command
downloads GeoFabrik's Guangdong extract once, uses the eleven OSM administrative
relations for Guangzhou, Shenzhen, Zhuhai, Foshan, Huizhou, Dongguan, Zhongshan,
Jiangmen, Zhaoqing, Hong Kong, and Macao to construct an Osmium polygon, then extracts
their complete ways into the local `gba.osm.pbf` source Planetiler consumes. The final
tile-generation clip removes any geometry retained solely to complete an OSM way.

`osmium` must be installed and available on `PATH` for a GBA refresh:

```sh
# Fedora
sudo dnf install osmium-tool

# Debian or Ubuntu
sudo apt install osmium-tool

# macOS
brew install osmium-tool
```

## Release process

The command updates a shallow managed clone under `.local/tiles/repositories/` for
`protomaps/basemaps` and records that commit alongside the current SaanSeoi repository
commit in the release manifest. It builds a commit-tagged Docker image if needed, then
runs Planetiler with the configured `--area`. The container runs as the invoking user,
so generated archives and cache files remain writable for a later `--force` rebuild.

Every release is immutable by default. `tiles:refresh` uploads the dated archive and
manifest before it updates the explicit `-latest` archive and public indexes.
`tiles:backfill` uploads only the immutable archive, manifest, and version indexes; it
never changes the current `-latest` object.

```
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.pmtiles
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.json
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.boundary.geojson
basemap/{regionCode}/{regionName}-latest.pmtiles
basemap/{regionCode}/{regionName}-latest.boundary.geojson
basemap/{regionCode}/versions.json
basemap/versions.json
basemap/regions.json
```

The tiles Worker serves a dated release manifest at
`/releases/{regionCode}/{YYYY-MM-DD}.json`. It is the public provenance record for the
viewer’s diagnostic report: archive and boundary hashes, clipping inputs, coastline
inputs, build commits, and command context. It never exposes a PMTiles archive itself.

`tiles:refresh` always uses the current Hong Kong time (HKT) date. A version may not be
overwritten by a normal refresh. Use `--dry-run` to inspect object names without
downloading, building, or uploading.

Use `--force` to rebuild an existing current-date release with Planetiler. It replaces
the dated archive and its manifest, then publishes that rebuilt archive as `-latest` and
updates the version indexes:

```sh
saanseoi tiles:refresh --region hk --force
```

`--force` does not download the existing archive from R2. It re-obtains the source data
and generates a new PMTiles archive with Planetiler.

## Historic imports

An already-built PMTiles file can be backfilled without rerunning Planetiler:

```sh
saanseoi tiles:backfill \
  --region hk \
  --date 2025-04-25 \
  --file /path/to/basemap_hongkong-2025-04-25.pmtiles
```

Backfill manifests mark the source as an imported local archive, since the original
build commits and command are not available.

If a `-latest` object was promoted accidentally, remove the pointer and its catalogue
entry with:

```sh
saanseoi tiles:unpublish-latest --region hk
```

To retract an incorrectly published dated release, remove its archive, boundary,
manifest, version-catalogue entry, and cached public URLs together:

```sh
saanseoi tiles:retract --region hk --date 2026-07-30
```

If the retracted date is also `-latest`, the command unpublishes that pointer rather
than silently promoting another release.

## Credentials

The command uses Wrangler's Cloudflare API, not R2's S3-compatible API. Create a
Cloudflare **Profile API token** with **Account** > **Workers R2 Storage** > **Edit**,
scoped to the `tijptjik` account, and expose it as `CLOUDFLARE_API_TOKEN` in the shell
that runs the command. An R2 API token's Access Key ID and Secret Access Key (including
one scoped as Object Read & Write) are S3 credentials and do not authorise Wrangler's
Cloudflare API requests.

The token needs both reads, to merge existing indexes and check existing releases, and
writes, to publish the archive and catalogue objects. A `tiles:retract` additionally
needs **Zone** > **Cache Purge** > **Purge**, scoped to `saanseoi.hk`, so cached dated
TileJSON and tiles cannot remain publicly accessible after their R2 objects are removed.
The CLI supplies the fixed `tijptjik` account ID when it calls Wrangler, so no separate
account environment variable is required.

The command invokes the repository's locally installed Wrangler binary at
`node_modules/.bin/wrangler`. Run `bun install` if that binary is unavailable.
