# Buildings

Tracking:
[Buildings and frontage addresses #68](https://github.com/saanseoi/saanseoi/issues/68).

## Inventory boundaries

LandsD Buildings and Overture Buildings are strictly separate inventories. Each owns its
source IDs, release membership, attributes, geometry and history. They must never be
merged into a deduplicated combined inventory. Nearby queries require an explicit
inventory. The review app can overlay both independently.

A cross-inventory relationship records both IDs, both release IDs, directional coverage,
geometry repair and ambiguity evidence, and any review decision. A GERS reference on a
LandsD record is an association, not replacement of its source identity. Partial
containment must not imply identity equivalence. Geometry-only candidates remain
proposals until the identity policy or review establishes a link.

The proposed production lifecycle writes only changes. Attribute-only revisions should
reuse an unchanged geometry reference. Geometry changes create a new retained geometry
version; a release membership record preserves unchanged records without copying their
geometry. Latest-release indexed FlatGeobuf files can be published independently for
each inventory, while D1 retains source identity and revision history. This lifecycle
and the public Buildings API are not implemented by the benchmark.

## September 2026 comparison

The pinned pair is LandsD **2026-09-21** and Overture **2026-09-23.1**. Input checksums,
counts and methodology are recorded by `scripts/buildings/prepare.py` in `summary.json`.
LandsD contains **342,195** footprints; Overture contains **204,207** in the retained
Hong Kong clipSmart scope. That Overture scope includes 27 more boundary records than a
strict intersection with the district union. Counts are not directly comparable measures
of physical-building completeness.

Intersections use EPSG:2326, no buffers, and strictly greater than 0.99 before display
rounding. Each direction divides intersection area by that source footprint's area.
Positive-area overlaps are retained; touching boundaries alone are not matches. The
analysis repairs 83 invalid LandsD geometries in an analysis copy; original source
geometry is retained. No Overture input geometry required repair.

| Criterion                                                | LandsD records | % of LandsD |
| -------------------------------------------------------- | -------------: | ----------: |
| More than 99% covered by at least one Overture footprint |         35,151 |    10.2722% |
| More than 99% in both directions                         |         13,061 |     3.8168% |
| Forward threshold without a mutual match                 |         22,090 |     6.4554% |
| Unique reciprocal mutual candidate, no repair            |         12,461 |     3.6415% |

Review categories prioritise ambiguity and therefore partition differently from the
headline counts: mutual 12,461; partial 21,472; reverse partial 12,273; ambiguous 1,218;
other overlap 188,599; unmatched 106,172. Multiple qualifying Overture candidates, or a
mutual candidate shared by LandsD records, require review. There are 329,933
positive-area pairs. The app shows the top ten counterparts ordered by minimum
directional coverage, then intersection area; the category calculation uses all pairs.

## Reproduction and local review

Python dependencies are pinned in `scripts/buildings/requirements.txt`. Prepare a fresh
output directory; the script refuses to overwrite existing review evidence:

```sh
python scripts/buildings/prepare.py \
  --landsd /path/to/landsd-wgs84.geojson \
  --overture /path/to/overture-hk.parquet \
  --out .local/buildings-review/2026-09
python scripts/buildings/test_prepare.py
bun test apps/building-benchmark/src
bun --bun run --cwd apps/harbour-app check
bun run --cwd apps/harbour-app dev
```

Open <http://review.localhost:5185/buildings/>. The development middleware reads
`.local/buildings-review/2026-09/review.sqlite` only. It is not a production API, and a
static Harbour build does not include these local data endpoints. The two latest
releases are pinned independently; this is not a temporal comparison of consecutive
releases.

The map has separate cyan LandsD and orange Overture layers, independent visibility,
hover highlighting, a configurable search radius and selected-footprint outlines. The
**Hide outside radius** toggle clips all map content, including basemap labels and
selected outlines, to the search circle. It follows panning, zoom, bearing and pitch;
controls stay visible and hidden footprints cannot be selected. Filter by overlap
category, search LandsD names/CSUIDs, select either inventory on the map, and inspect
directional coverage, IoU, areas and repairs. When both layers overlap, clicking prefers
LandsD; hiding LandsD allows selection of Overture. Decisions persist in browser storage
for this release pair and export as JSON. They never write source IDs or mutate the
inventory. Test decisions belong to an isolated browser context.

Browser checks cover map rendering, category filters, name search, selected
counterparts, visibility, radius, decision persistence and export. Synthetic geometry
tests cover mutual/partial/reverse/ambiguous/disjoint cases, invalid geometry and SQL
replay. Local FlatGeobuf and SQLite searches agree across 32 search cases.

## Preview benchmark

`apps/building-benchmark` is an authenticated, preview-only Worker. It reads
`benchmarkLandsdBuilding` and `benchmarkOvertureBuilding` in `ss-current-db-preview`, or
separate `.fgb` objects beneath `benchmarks/buildings/2026-09/` in `ss-assets-preview`.
These are disposable scratch tables, not domain migrations. The preview database was
exported before insertion, and existing application tables remain unchanged.

Run from the repository root, with Cloudflare credentials supplied through the normal
local environment. The local token file must be ignored and mode 0600:

```sh
node --env-file=.env --env-file=.env.local node_modules/wrangler/bin/wrangler.js \
  deploy --config apps/building-benchmark/wrangler.jsonc
bun scripts/buildings/benchmark.ts \
  https://ss-building-benchmark-preview.hypehk.workers.dev \
  .local/buildings-review/benchmark-secret.json \
  .local/buildings-review/2026-09/benchmark-results.json
```

The benchmark uses six points (Mong Kok, Tsim Sha Tsui, Central, Quarry Bay, Sha Tin,
Kam Tin), radii 100/250/500/1000 m, both separate inventories and three repetitions.
Requests are sequential; engine order alternates between repetitions. Every response's
sorted ID hash must match the other engine and repetitions. Nearby distance is to the
filled polygon, including courtyard holes, in a local tangent plane; it is not centroid
distance or walking distance. The same filtering implementation is used by both engines.

D1 uses a covering bounding-box B-tree index `(minX,maxX,minY,maxY)` plus geometry
lookup; it is not a specialised spatial index and can scan many rows. FlatGeobuf uses
its packed spatial index through R2 binding range reads. Each request has a fresh
reader; there is no application-level header/index cache, CDN, or result cache.
Underlying infrastructure caches are uncontrolled, so these are not guaranteed
cold-cache measurements. Verbose FlatGeobuf debug calls are removed from the timed
Worker bundle.

Measurements distinguish full HTTP response time, Worker selection/filter time, D1 SQL
duration/rows read, R2 ranges/bytes, candidate count and result count. D1 and FlatGeobuf
both return the same full GeoJSON response. Results do not benchmark an HTTP Range CDN
or direct browser FlatGeobuf delivery.

Storage: the two scratch inventories increase preview D1 from 634,880 to **297,000,960
bytes**. Indexed FlatGeobuf files with source IDs, names and geometry occupy
**132,106,896 bytes** (LandsD) and **69,972,792 bytes** (Overture). These include the
packed spatial indexes and properties; they are larger than geometry-only binary
estimates.

### Measured results on 21 October 2026

All **288 requests** completed and all **48 distinct searches** returned identical
source ID sets across engines and three repetitions. All Worker requests were served in
**NRT**; the preview D1 primary reports **HKG**. Each row below contains 72 requests.
Percentiles use linear interpolation across that row's measurements.

| Inventory | Engine        | Full response p50 | Full response p95 | Retrieval p50 | Retrieval p95 |
| --------- | ------------- | ----------------: | ----------------: | ------------: | ------------: |
| LandsD    | D1            |            472 ms |          1,529 ms |        149 ms |        441 ms |
| LandsD    | R2 FlatGeobuf |          1,644 ms |          2,820 ms |      1,249 ms |      1,848 ms |
| Overture  | D1            |            276 ms |            743 ms |         98 ms |        278 ms |
| Overture  | R2 FlatGeobuf |          1,512 ms |          2,090 ms |      1,175 ms |      1,842 ms |

D1 SQL duration p50 is 49.63 ms for LandsD and 27.09 ms for Overture. Median rows read
are **251,570** and **144,955** respectively: this B-tree query is too scan-heavy to
treat as an optimised production spatial lookup. FlatGeobuf uses a median **6 R2 range
reads** per query, fetching approximately **600 KB** for LandsD and **468 KB** for
Overture. Across the run: 27,040,509 D1 rows read; 822 R2 ranges; 116,264,952 R2 bytes
retrieved. Maximum returned footprints per query were 4,730 LandsD and 3,366 Overture.

Retrieval times include binding/network wait and parsing. Workers' clock resolution does
not isolate synchronous CPU time; the equal `fetchMs` and `workerMs` values must not be
interpreted as zero filtering CPU. Full response times include transfer and client read.
The two engines return the same IDs and GeoJSON contract, not byte-identical encodings.

**Conclusion:** retaining geometry history in D1 and publishing separate latest-release
FlatGeobuf files remains feasible, but uncached R2 range access is slower in this
preview configuration. These measurements do not justify selecting it as the interactive
nearby backend yet. Compare immutable header/index or range caching, object/Worker
locality and a D1 spatial-cell candidate index before the production serving decision. A
direct browser/CDN FlatGeobuf path would be a separate benchmark. D1's current latency
advantage does not remove its excessive row-scan cost.

The ignored local `benchmark-results.json` contains per-request measurements and ID
hashes. Reproduce the aggregate with:

```sh
bun scripts/buildings/summarise.ts .local/buildings-review/2026-09/benchmark-results.json
bun scripts/buildings/verify-local.ts .local/buildings-review/2026-09
```
