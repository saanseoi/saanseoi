# Geographic hierarchy and SaanSeoi estimated-area review

The local drawing map is served at <http://localhost:5185/divisions/> by Harbour
(`bun run review:divisions`). Its page and modules live in `apps/harbour-app/divisions/`
and `apps/harbour-app/src/tools/division-areas/`. The application source is tracked;
generated geometry and browser working state stay local.

The editor generates its identity inventory and reference geometry from the pinned
archives in `fixtures/meta/datasetInputs/saanseoi-division-review.json`, then applies
the purpose-specific files in `fixtures/meta/curations/saanseoi-division/`. Class
determines category and level; names and ancestry labels are resolved by ID. No full
publisher inventory or expanded hierarchy catalogue needs to be committed.

Run `bun scripts/divisions/prepare-review.ts` to populate the ignored
`.local/division-review/editor.json` cache. The local viewer also invokes this generator
through its development-only `/__division-review/inputs` endpoint. It works without a
populated database. `SAANSEOI_REVIEW_API_URL` selects an asset API for pins carrying
`assetId`; `SAANSEOI_REVIEW_ARCHIVE_URL` selects an R2 archive origin. The optional
`SAANSEOI_REVIEW_OPTIONS` file supplies loader options such as `paths` keyed by dataset
code or source pins with deployment-specific asset IDs. Every fallback verifies the same
pinned hash; source refreshes must be explicit.

Curated exclusions, including level-6 squares, plazas, promenades and East Wing
Forecourt, are omitted. The local reference-area file contains the selected release's
existing polygons; these remain distinct from drawn estimated areas.

## Drawing and retaining decisions

1. Search for a division or filter for missing areas at levels 0–5. Landforms have no
   numeric level. Select a division, then choose **Draw area**.
2. Click vertices on the map. Lower-level points inside the draft are highlighted.
   Choose **Finish** to close it. Vertices can be dragged; **Undo vertex** removes the
   latest vertex. **Cancel** discards the current edit.
3. Use **Edit area** to adjust the first exterior ring, or **Add polygon part** for a
   disconnected area. Imported holes and other parts are retained during editing.
   Estimated areas use valid closed polygon rings with at most 2,000 distinct vertices
   per ring. **Adjoin boundary** copies the shortest boundary path between two selected
   nodes from a nearby polygon. **Adjoin street** replaces the nearest active-ring path
   with the shortest connected route through the local street-centreline graph.
4. Choose **Derive hierarchy** to inspect point membership and competing parents.
   Level-6 divisions are points only: draw level-5 parents instead. A point in multiple
   same-tier polygons receives the smallest containing polygon; division ID breaks ties.
   Competing IDs remain in the decision for review.
5. **Download drawings** exports `division-geometry.json` and
   `division-editor-project.json`. Save the geometry file in
   `fixtures/meta/curations/saanseoi-division/` and the optional editor cache in
   `.local/division-review/`. The geometry export retains active and withheld drawings,
   unique original drawings, pencil linework and reviewed core points. The editor cache
   retains working baselines, cleanup stages and recovery history. Hierarchy derivation
   produces a preview; explicit parent edits belong in `division-hierarchy.json`.
   Downloads do not ingest or publish a release.

Browser storage retains drawings for the selected cohort. **Import estimated areas**
validates cohort and identity, replaces matching drawn divisions and retains other saved
drawings. Download fixtures to keep a durable copy outside browser storage. Reference
polygons are never overwritten.

The **Geometry cleanup** controls apply to saved level-3, level-4 and level-5 estimated
areas. Each selected level is clipped to the retained
`hongkong-2026-09-01.coastline-land.geojson` layer, simplifies the coastline to
five-metre detail (three metres for L4), snaps existing boundary vertices to local
street centrelines within five metres, closes seams up to five metres, and assigns the
combined footprint in stable division-ID order so adjoining polygons do not overlap. L4
corners use a single miter point rather than round-join arcs. Street snapping is ignored
when no centreline is within five metres, and the coastline clip is applied afterwards
so coastline geometry takes precedence. Other levels are preserved. **Undo last
cleanup** restores the previous browser-storage state; download the cleaned fixture
after review.

The review page loads local OSM highway centrelines from the Hong Kong extract dated
2026-07-29. The source is kept as an ignored local-review asset because it is only
needed for interactive cleanup.

## Derivation and application

The shared `geographicReview.ts` implementation is used by the map and tests. Saanseoi
geometry takes precedence for the same division; reference providers then prefer HAD,
Overture and remaining providers. Point-on-boundary membership is included; hole
interiors are excluded. Numeric parent tiers must be smaller than the child tier.
Landforms use their category and class instead of numeric levels.

Point inference applies to localities and hoods at levels 3–6. Administrative divisions,
cities and landforms retain curated ancestry; a label point cannot establish the
administrative coverage of an island or city spanning multiple districts. Polygon
containment and intersection evidence for those features require a separate review.

Every export covers the complete inventory. `geometry` marks a division with a district
polygon and its immediate parent tier (or a level-3 town with district evidence).
`provisional` marks incomplete evidence with retained ancestry; `unresolved` marks the
same uncertainty when **Retain provisional ancestry** is disabled. Polygon matches and
overlap alternatives remain explicit. A geometric match is point-membership evidence,
not a claim that the child has its own polygon or that its entire extent is contained.

The cohort-scoped hierarchy decisions validate canonical identity and class during
SaanSeoi archive assembly. They determine the synthetic dataset's ancestry; native
Overture ingestion retains its own normalised ancestry. Building an archive does not
mutate published snapshots. Upload its Division and DivisionArea archives through the
ordinary ingestion pipeline to publish a curated edition.

## Published and working geometry

`division-geometry.json` contains the evolving authored geometry. The editor overlays it
on pinned source geometry; API requests receive published archive records. Working edits
become published geometry only after building and ingesting a new immutable
Division/DivisionArea edition. `.local/division-review/division-editor-project.json` is
ignored local editor state and does not enter ingestion records. A fresh editor session
needs no recovery cache: authored drawing inputs remain in `division-geometry.json`.

## Cross-domain geometry and building suggestions

The local review map offers a searchable catalogue of retained area geometry with source
domain and cohort labels. Ma On Shan has separate new-town geometry for 2006, 2011 and
2016; the 2021 source provides a combined Sha Tin–Ma On Shan area. Copying a preview
assigns it to the selected geographic division while retaining its source division, area
identity, domain and cohort. It does not modify the source dataset.

The built-up extent preview uses OSM building polygons from the retained
`guangdong-2026-09-01.osm.pbf`, filtered to the Hong Kong review bounds. It starts at
the nearest building centre within 500 metres and grows through centres within the
configured gap, bounded by a radius around the division point. A buffer closing
operation creates an outline with a five-metre margin. Both gap and radius are in
metres. The preview records its seed, parameters, source date and method version.

This estimates connected building coverage, not the named settlement extent. It may
cross roads or water and omit undeveloped land, large separated buildings or missing OSM
footprints. Expansion above 5,000 buildings is rejected. Review and explicitly copy the
preview before it becomes a saanseoi; published data is unaffected.

## Curated additions awaiting drawings

Mei Foo (`MF`) is a level-5 neighbourhood awaiting a drawn boundary and core point. Tung
Tau (`TGT`) and Starstreet (`STR`) are level-6 microhoods with OSM locality points.
Starstreet Precinct and 星街社區 are aliases of Starstreet. Lei Muk Shue is an estate
and is excluded from Division list membership. Jordan uses its exported polygon and core
point.

New short-code proposals are restricted to divisions with Hong Kong Island or Kowloon
administrative ancestry. Supplied and explicitly accepted codes outside those areas
remain assigned and reserve their codes within their classes. Other outside-area
identities are held for later review. Run `scripts/divisions/recommend-codes.py` with
`--hk-kowloon-only` to apply that review scope.

The island editor exports decisions to `division-exclusions.json` and source references
to `division-geometry-selections.json`. Replacing an authored island correction also
exports the updated `division-geometry.json`. Independent point corrections belong in
`division-point-overrides.json`; ordinary source points and polygon core points are not
repeated there. Map extents come from the selected DivisionArea geometry.

## Versioned local division editor

The division editor page at `apps/harbour-app/divisions/index.html` and its modules
under `apps/harbour-app/src/tools/division-areas/` are application source in version
control. Other temporary review pages remain ignored.

Run `bun run dev:harbour-app` and open <http://localhost:5185/divisions/>. The default
`development` mode registers the input-generation and local-asset endpoints. Retain the
pinned ingredient archives needed by `scripts/divisions/prepare-review.ts`; it builds
`.local/division-review/editor.json`. The government comparison also requires the
retained HAD and C&SD files listed in `scripts/divisions/government-review.ts`. Missing
required inputs produce an explicit error, not a substitute source edition.

Optional catalogue, building and road exports live in `.local/division-review/assets/`
as `catalogue.json`, `buildings.json` and `road-centrelines.geojson`. They are served
through an allowlisted development endpoint, not shipped as application assets. To
prepare these from retained division-area deliveries and exported building/road
FeatureCollections, run from the repository root:

```sh
uv run --with duckdb --with shapely python \
  apps/harbour-app/src/tools/division-areas/prepareGeometryInputs.py \
  --buildings /path/to/buildings.geojson --roads /path/to/road-centrelines.geojson
```

The catalogue preparation reads locally retained division-area Parquet deliveries with
`geometry`, `i18n` and `division_id` fields. Missing optional data disables catalogue
search or reports an error when the corresponding geometry tool is used. Coastline
cleanup uses the retained
`.local/tiles/data/hk/hongkong-2026-09-01.coastline-land.geojson` export. Browser
drawings, backups and `.local/division-review/division-editor-project.json` remain local
working state. The checked-in Tseung Kwan O recovery fixture supports the editor's
existing once-per-browser restore; it is not published by the viewer.

Harbour is a local development application with no deployment command. Its input and
query endpoints run in the development server. A static build checks browser bundles; it
does not provide the local endpoints. Public basemap builds reject imports from
`harbour-app`, and temporary basemap review pages remain excluded from deployments.

## Editor loading

Harbour starts the basemap while preparing editor inputs. The development server retains
successful input generation in memory and checks source-code, curation, pin, retained
archive, government input and editor-project file metadata before reuse. Changes
invalidate the result; restarting the server also requires a rebuild. Concurrent
requests share generation, and failed builds are retried.

Government comparison polygons are fetched with **Load government comparisons** under
**Use an existing area**. They remain separate from active reference geometry. The
optional geometry catalogue downloads only when a search term is entered. These
comparison inputs are not part of the initial editor response.
