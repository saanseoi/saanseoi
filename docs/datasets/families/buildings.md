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

### Small-radius sampled-index and cache experiment: 21 October 2026

The authenticated preview Worker supports `d1-cells` and `fgb-cache` alongside the
original `d1` and `fgb` engines. These remain experimental serving paths, not public
Buildings APIs. Worker version: `12937865-4f5a-4fa0-a827-7957027d62b5`.

To conserve the write budget, the cell indexes cover **only six test areas**, each
extending 0.0015 degrees around the points used above. Selected buildings retain all
their bounding-box cells in a 0.001-degree grid. This is conservative candidate
selection, followed by the same exact footprint-distance filter as the other engines. A
query must fit entirely inside one sampled area; otherwise `d1-cells` returns 400 rather
than silently returning incomplete results.

| Inventory | Selected buildings | Cell entries |
| --------- | -----------------: | -----------: |
| LandsD    |                760 |        1,161 |
| Overture  |                539 |          892 |

Only `benchmarkLandsdBuildingCellSample` and `benchmarkOvertureBuildingCellSample` were
added. D1 reported **2,057 row writes** for the four creation/population statements,
including schema overhead; database size increased by **98,304 bytes**. No
full-inventory cell index was written. Source rows and production remain unchanged. Cell
lookups still retrieve geometry from the full 546,402-record preview inventories.

The FlatGeobuf transport caches aligned **64 KiB chunks** containing headers, spatial
index nodes and feature bytes in the Workers Cache API, with a one-hour TTL. Keys
include the pinned object path and an experiment namespace; these objects must remain
immutable within a namespace. There is no final-result cache and no D1 write for this
cache. At most eight missing chunks are fetched concurrently. Cache writes are awaited
inside the measured request. Cache contents are local to a Cloudflare data centre.

For each location and inventory, a fresh cache namespace measures six phases: first 25 m
query, identical repeat, pin shifted approximately 10.6 m northeast, expand the original
pin to 50 m, identical repeat, and shifted 50 m query. All four engines run at each
phase, rotating engine order. The expansion phase reuses the 25 m cache; it is **not** a
fresh-cache 50 m measurement.

All **288 requests** completed, with identical result ID sets across all four engines
for **48 distinct searches**. All Workers ran in **NRT**; D1 remains in **HKG**. The
following are full-response medians, with p95 in parentheses. Original D1, cell-index D1
and uncached FlatGeobuf have 18 samples per row; cached repeat/shift results have 12 and
include any new chunks needed after shifting.

| Inventory | Radius |  Original D1 | Cell-index D1 |  Uncached R2 FGB | Cached FGB repeat/shift |
| --------- | -----: | -----------: | ------------: | ---------------: | ----------------------: |
| LandsD    |   25 m | 222 (427) ms |  188 (261) ms |   973 (1,220) ms |            163 (228) ms |
| LandsD    |   50 m | 222 (304) ms |  188 (321) ms |   996 (1,230) ms |            152 (314) ms |
| Overture  |   25 m | 188 (219) ms |  168 (214) ms | 1,018 (1,259) ms |            133 (349) ms |
| Overture  |   50 m | 200 (270) ms |  188 (246) ms | 1,086 (1,297) ms |            143 (364) ms |

Cell-index SQL medians are **0.83–0.99 ms**. Median rows read fall from approximately
247,000 to **124 / 163** for LandsD (25 / 50 m), and from approximately 142,000 to **100
/ 123** for Overture. Most end-to-end time is outside SQL execution; these full-response
figures are not D1 execution times.

First-access cached-FGB 25 m requests have median **1,067 ms LandsD / 1,026 ms
Overture**. All 24 identical repeats and **22 of 24 shifted-pin searches** need no R2
reads. Two shifted searches fetch additional chunks. Across cached requests there are
284 Cache API chunk hits and 64 misses. Cache reuse therefore works across changed
coordinates, but first access and occasional new chunks remain slower. The six
per-inventory first-access samples are too few for a strong tail-latency claim, and
fresh namespaces do not control underlying R2/infrastructure caches.

**Decision supported by this experiment:** D1 with a spatial-cell candidate index is a
credible nearby-building backend at 25–50 m; FlatGeobuf is not required for that
capability. Cached FGB is somewhat faster in the median once data is reused, but adds
cache/locality management and a first-access penalty. Keep FGB as an optional latest
release/download/map-delivery format. This sampled, sequential run is not a full-Hong
Kong index or concurrency/load test and does not establish a production SLA.

Reproduction (the generated SQL deliberately fails if the sample tables already exist):

```sh
bun scripts/buildings/prepare-cells.ts \
  .local/buildings-review/2026-09/review.sqlite /tmp/building-sample-cells.sql
bun scripts/buildings/verify-cells.ts \
  .local/buildings-review/2026-09/review.sqlite /tmp/building-sample-cells.sql
# Review the printed counts before applying to preview, never production.
node --env-file=.env --env-file=.env.local node_modules/wrangler/bin/wrangler.js \
  d1 execute ss-current-db-preview --config apps/building-benchmark/wrangler.jsonc \
  --remote --file /tmp/building-sample-cells.sql
bun scripts/buildings/benchmark-small.ts \
  https://ss-building-benchmark-preview.hypehk.workers.dev \
  .local/buildings-review/benchmark-secret.json \
  .local/buildings-review/2026-09/benchmark-small-results.json
bun scripts/buildings/summarise-small.ts \
  .local/buildings-review/2026-09/benchmark-small-results.json
```

Verification: all 48 local bbox searches agree between the sampled index and full
inventory; the deployed Worker rejects out-of-sample queries (400) and unauthenticated
requests (401). Five focused tests and the Worker type check pass, including cross-chunk
byte correctness, cross-request shifted-range reuse and cache-namespace isolation. Raw
measurements and preview write/count evidence are retained under ignored
`.local/buildings-review/2026-09/benchmark-small-*` files.
