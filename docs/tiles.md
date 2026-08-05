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
provisions three same-date archives in GBA, Hong Kong, then Macao order: the
consolidated `gba` basemap plus standalone Hong Kong and Macao maps. If a Hong Kong or
Macao release already exists for the current HKT date, a normal refresh leaves it in
place instead of rebuilding it.

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

During the build, the exact regional OSM PBF that Planetiler consumes is also filtered
for `natural=coastline` ways. The resolved footprint closes those lines only while
constructing land and water faces; it is never emitted as coastline geometry. Land is
the face on the left of each directed OSM coastline, and the complementary faces become
regional water. These are emitted into the PMTiles archive itself as its `earth` and
`water` layers, before tiling. This keeps source dates aligned and avoids tile-edge
outlines without requiring a special viewer-side overlay.

The archive also exposes a `coastline` line layer. It contains only original OSM
`natural=coastline` linework inside the regional footprint: no footprint or vector-tile
edges, and no enclosed inland-water outlines. It is the layer consumers should use for a
styled earth boundary; outlining `earth` or `water` polygons will also outline their
vector-tile clipping edges.

SaanSeoi-generated base geography carries `saanseoi:base: true`. The stable coastline
contract is source layer `coastline`, `LineString` geometry, and `kind: "coastline"`.
Consumers should select that layer directly; the marker identifies SaanSeoi's generated
base features rather than a styling category.

The GBA archive is not a bounding box and is not a Guangdong basemap. The command
downloads GeoFabrik's Guangdong extract once, uses the eleven OSM administrative
relations for Guangzhou, Shenzhen, Zhuhai, Foshan, Huizhou, Dongguan, Zhongshan,
Jiangmen, Zhaoqing, Hong Kong, and Macao to construct an Osmium polygon, then extracts
their complete ways into the local `gba.osm.pbf` source Planetiler consumes. The final
tile-generation clip removes any geometry retained solely to complete an OSM way.

The same prepared GBA export supplies the complete OSM relation context for Macao's
`regional_border` layer. Macao's dedicated GeoFabrik extract omits some adjoining Zhuhai
ways referenced by its administrative relation; the GBA export retains them. The layer
is intersected with Macao's exact boundary before publication, so this context never
adds mainland geometry to the Macao tileset.

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

Every release is immutable by default. The three publishing commands have deliberately
different purposes:

- `tiles:refresh` generates the current HKT release from the current GeoFabrik input,
  then advances the matching `-latest` archive and public indexes.
- `tiles:import` publishes a supplied, prebuilt historic PMTiles archive at a fixed
  date. It never changes `-latest` and does not claim to have regenerated its layers.
- `tiles:rebuild --all` replaces source-backed releases after a generator-contract
  change, using their date-matched archived GeoFabrik PBFs. It retains imported archives
  because they have a separate upstream build provenance.

```
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.pmtiles
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.json
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}.boundary.geojson
basemap/{regionCode}/{regionName}-latest.pmtiles
basemap/{regionCode}/{regionName}-latest.boundary.geojson
basemap/{regionCode}/{regionName}-{YYYY-MM-DD}-{light|dark}.webp
basemap/{regionCode}/{regionName}-latest-{light|dark}.webp
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

After publishing each tileset, `tiles:refresh` invokes Cloudflare Browser Rendering to
capture the release in the viewer's headless mode at 1200 × 800 pixels. It publishes
immutable `light` and `dark` WebP previews alongside the release; both modes currently
use the viewer's `midnight` map theme. When the release is the region's current release,
the command also refreshes the two `-latest` preview objects.

Render imported or generated releases independently with:

```sh
saanseoi tiles:render --region hk --date 2026-08-01
saanseoi tiles:render --region hk --date 2026-08-01 --mode light
```

Omitting `--mode` renders both modes. The dated tileset must already be present in the
region's version index. The viewer URL uses `headless=true`, which hides its navigation,
controls, status, and panels; rendering waits for the fitted map to become idle before
capturing it.

Use `--force` to rebuild an existing current-date release with Planetiler. It replaces
the dated archive and its manifest, then publishes that rebuilt archive as `-latest` and
updates the version indexes:

```sh
saanseoi tiles:refresh --region hk --force
```

`--force` does not download the existing archive from R2. It reuses the local regional
PBF (downloading it only when absent), derives the source-local base layers, and
generates a new PMTiles archive with Planetiler.

## Pre-release history rewrite

After a deliberate generator-contract change, rebuild every published area and date
with:

```sh
saanseoi tiles:rebuild --all --dry-run
saanseoi tiles:rebuild --all --rewrite-history
```

The dry run reads each regional version catalogue and prints every archive that would be
replaced or retained. `--rewrite-history` is intentionally required for the write
operation. Before it replaces anything, it requires one locally archived GeoFabrik PBF
for every source-backed regional release under
`.local/tiles/historical/sources/{YYYY-MM-DD}/`; otherwise it fails without publishing a
partial rewrite. It rebuilds each eligible release from that archived input, replaces
its PMTiles, manifest, and previews, and refreshes a region's `-latest` pointer only
when rebuilding the release it already identified as latest. Imported releases are
retained.

Macao's historic rebuild also requires the matching archived `gba.osm.pbf`, because it
uses that complete GBA export to resolve Macao's cross-boundary administrative relation
before clipping the resulting border linework to Macao.

To deliberately replace one historic date across GBA, Hong Kong, and Macao, and make
that date current for all three regions, use:

```sh
saanseoi tiles:rebuild --all --date 2026-08-01 --promote-latest --rewrite-history
```

This still preflights all three date-matched archived inputs before it replaces any
release. `--promote-latest` is required to move all three `-latest` pointers; omit it
when the rebuilt date should remain historic.

For a single region, replace `--all` with `--region gba`, `--region hk`, or
`--region mo`. A date-specific rebuild always requires `--rewrite-history` to write.

## Historic imports

An already-built PMTiles file can be imported without rerunning Planetiler:

```sh
saanseoi tiles:import \
  --region hk \
  --date 2025-04-25 \
  --file /path/to/basemap_hongkong-2025-04-25.pmtiles
```

Import manifests mark the source as an imported local archive, since the original build
commits and command are not available. Importing does not add SaanSeoi's generated
`earth`, `water`, `coastline`, or `regional_border` layers to the supplied archive.
Those layers must be generated from the release's matching historic GeoFabrik PBF and
packaged with the imported source in a separate, source-aware build; `tiles:rebuild`
will not substitute another date or replace an import with a current OSM extract.

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
Rendering previews additionally requires **Account** > **Browser Rendering** > **Edit**.
The CLI supplies the fixed `tijptjik` account ID when it calls Wrangler, so no separate
account environment variable is required.

The command invokes the repository's locally installed Wrangler binary at
`node_modules/.bin/wrangler`. Run `bun install` if that binary is unavailable.
