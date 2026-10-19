# Basemap tiles

SaanSeoi's regional PMTiles archives are a generated base-geography family, separate
from the API resource families. Their input and publication process is documented in
[basemap tiles](../../tiles.md).

Monthly scheduled refreshes use the first day of the HKT month as their release date,
including persistent catch-up runs. An explicit `tiles:refresh --date YYYY-MM-DD`
recovers a missed release while retaining the actual build and publication timestamps in
its manifest. Existing releases remain immutable without `--force`.

Source-archive metadata hashes OSM files as a stream, without retaining the complete
archive in memory. Size, file identity and modification metadata are checked across the
read; a detected change stops archiving.

Remote object reads use temporary files and replace local artefacts only after a
successful download. Only an explicit missing-object response permits an absent
catalogue or source; authentication, transport and empty-diagnostic failures stop the
workflow without discarding retained files.

Generated archives have checksummed local build checkpoints. The build identity covers
the regional source PBF, clip and coastline file digests, region, image and repository
provenance. Matching completed builds reuse their archive and original provenance.
Inputs are checked again after generation. Builds write a temporary archive and replace
the destination only after success; `--force` explicitly rebuilds. Missing checkpoints,
changed inputs or changed archive bytes stop implicit reuse. Source/coastline
preparation and remote publication remain separate stages.

Catalogue completion has a separate durable intent. After the regional release is
recorded, retries can finish interrupted global catalogue writes without replaying
artefact uploads. Exact regional-entry and latest-selection checks prevent stale
completion intents from selecting another release. Publication is serialised within the
workspace; deployment operations require a single publishing workspace.

## Schema contract

The vector-layer schema is versioned as `protomaps-v2.N`: it starts from Protomaps
Basemaps v2, while `N` is incremented whenever SaanSeoi changes its published layers or
properties. The current contract is `protomaps-v4.1`. In addition to the inherited
Protomaps layers, it defines SaanSeoi's exact regional boundary, coastline, earth and
water additions described below. Each release manifest records the schema version it was
built against.

## Geography contract

The build filters the exact regional OpenStreetMap PBF used by Planetiler for
`natural=coastline` ways. It uses the resolved regional footprint only as temporary
construction geometry to close faces, derives complementary water, and emits the
following generated vector layers before tile clipping:

| Layer        | Geometry | Semantics                                                  |
| ------------ | -------- | ---------------------------------------------------------- |
| `earth`      | polygon  | Regional land coverage                                     |
| `water`      | polygon  | Regional water coverage                                    |
| `water`      | line     | Original coastline linework (`kind: "coastline"`)          |
| `boundaries` | line     | Landward regional outline (`saanseoi:region_border: true`) |

The coastline and boundary features exclude construction edges and enclosed inland-water
boundaries. Together they are the styling contract for a complete regional outline, so
consumers must not derive it from polygon edges. All generated base features expose
`saanseoi:base: true`.

The same exact clip applies to labels and all ordinary source geometry. A published
regional PMTiles archive is therefore self-contained: viewers render it from one tile
source and use the published boundary GeoJSON only for the outside-region mask. We
intentionally retain the versioned GeoJSON artefact; it records the exact release
footprint, supports that optional presentation, and supplies the integrity-checked input
required by imported and exceptional historic rebuild workflows. It is not required to
render or clip the regional PMTiles source.

Historic source-backed releases are regenerated from their matching archived GeoFabrik
Guangdong PBF. The source is retained privately in R2 and supplies the locally resolved
GBA, Hong Kong, and Macao clipping boundaries. A history rewrite fails before
publication when an archived input is unavailable, except that an old GBA extract may
reuse its hash-verified published boundary when its relation members cannot be resolved.
Imported PMTiles archives are retained instead: the generic import operation does not
embed this generated geography, so an import needs a matching boundary and a
source-aware build with its matching historic PBF before it can carry the same coastline
contract.

## Release statistics and usage

META stores one `basemapReleaseStats` row per `{region}/{version}`, tied to the
published PMTiles SHA-256. The release page only uses statistics whose archive digest
matches its manifest. Rows include the source, boundary and extracted-PBF digests,
counting method, vector-layer metadata, zoom range and addressed-tile count.

Run `python scripts/basemaps/backfill-release-stats.py --output <directory>` to prepare
statistics for every published Hong Kong, Macao and Greater Bay Area release. The
command verifies retained archives against the public catalogue and manifests,
re-extracts the archived Guangdong source with the published regional boundary and
`osmium --strategy=complete_ways`, and counts each matching OSM object once per
category. It does not count repeated tile representations. Categories overlap, building
relations may contain building ways, and complete ways can extend outside the clip.
These numbers describe source objects, not a deduplicated inventory of physical assets.

After applying META migrations, add `--apply-only --apply-local-meta <sqlite-path>` to
import the prepared `stats.json`. The importer backs up local META and upserts only the
release-statistics rows. It does not write remote D1. Re-run the calculation after
publishing another basemap release.

`scripts/basemaps/retrofit-manifests.ts <directory>` prepares missing schema metadata
from the verified archives. `--apply` retains the complete original R2 manifest, adds
only missing schema metadata and its evidence, then reads the object back to verify the
write. An exact vector-layer/field-type match permits the reference schema; otherwise
the archive's declared Protomaps profile version is explicitly labelled as such. Tile
archives and existing manifest values are retained.

Successful tile and TileJSON GET responses, including edge-cache hits and first-party
requests, emit `api.access` events under scope `basemap_release`. Date-pinned paths
identify a release directly; `latest` responses use the served PMTiles ETag and match it
to an immutable archive. Unknown ETags are not attributed to a guessed release.

Public `GET /downloads/{region}/{version}.pmtiles` streams a full archive. Only a fully
consumed successful response emits `downloads`; cancellations, HEAD, errors and range
requests do not. Archive chunks are cached internally at the edge, keyed by archive,
ETag and byte range; both cache hits and misses pass through download tracking. Browser
responses use `Cache-Control: no-store` so requests reach the service. Each request
checks the current R2 ETag, and cache failures fall back to R2. The existing SaanSeoi
API daily rollup copies the events from the shared Product Usage dataset into META's
access-analytics tables. Header metrics remain unavailable until a rollup exists; source
statistics do not imply historical usage counts.

## Routing companions

Current and previous completed graph editions expose public regional PBF, Valhalla and
GraphHopper downloads on the region-specific release page. Older graph payloads are
retired without deleting the basemap release, boundary, recipe or Guangdong source. See
[routing companions](routing.md) for publication, retention and shared service
operations. Full PMTiles archive downloads and dated boundary downloads are public;
ordinary tile/TileJSON requests retain their existing access policy.

## Geocoding evidence audit

The [geocoder coverage investigation](../../benchmarks/geocoder-2026-10-19.md) compares
retained OSM building polygons with canonical address points and a fixed reference-pin
sample. The read-only audit uses source geometry, records publication identities and
keeps overlapping footprints separate. Tile coverage and point containment do not by
themselves establish an address identity.

## Building address selection

At z15 and overzoomed views, OSM building and building-part polygons retain `source_id`
(the type-encoded Protomaps OSM identity, prefixed `osm:`), `addr_housenumber`,
`addr_street`, `addr_street_en`, `addr_street_zh`, `addr_full`, `name`, `name_en` and
`name_zh` when supplied by the source. Address-label points retain `addr_street` as well
as `addr_housenumber`. Addressed polygons remain independent of label-point
deduplication. Lower zooms can merge geometry and are unsuitable for building selection.
See [OSM building addresses](../sources/openstreetmap/building-addresses.md).

Select full buildings using `kind=building`, rather than `building_part`. Combine loaded
tile fragments with the same source identity before testing point containment. Source
queries are necessary for styles that draw only building outlines. Preserve a complete
source address, including number ranges, without replacing it with a nearby address
point. Missing address tags require explicit fallback or manual input; a number label
alone does not establish a street.
