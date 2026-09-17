# Geographic hierarchy and stub-area review

The local drawing map is served at <http://localhost:5174/local-review/> by the basemap
viewer (`bun run --cwd apps/basemap-viewer dev`). Its page and modules live in
`apps/basemap-viewer/local-review/` and
`apps/basemap-viewer/src/local-review/division-areas/`. These local review directories
are ignored by Git and excluded from the deployed viewer.

The review inventory in `fixtures/divisions/hk/geographic-review-inventory.json`
contains 1,759 retained geographic divisions from `data-hk-divisions-2026-08-19.0`,
their retained source points, names and provisional ancestry. Nine divisions have no
source point. Reviewed exclusions, including level-6 squares, plazas, promenades and
East Wing Forecourt, are omitted. The local reference-area file contains the selected
release's existing polygons; these remain distinct from drawn stubs.

## Drawing and retaining decisions

1. Search for a division or filter for missing areas at levels 0–5. Landforms have no
   numeric level. Select a division, then choose **Draw area**.
2. Click vertices on the map. Lower-level points inside the draft are highlighted.
   Choose **Finish** to close it. Vertices can be dragged; **Undo vertex** removes the
   latest vertex. **Cancel** discards the current edit.
3. Use **Edit stub** to adjust the first exterior ring, or **Add polygon part** for a
   disconnected area. Imported holes and other parts are retained during editing. Stubs
   use valid closed polygon rings with at most 2,000 distinct vertices per ring.
   **Adjoin boundary** copies the shortest boundary path between two selected nodes from
   a nearby polygon. **Adjoin street** replaces the nearest active-ring path with the
   shortest connected route through the local street-centreline graph.
4. Choose **Derive hierarchy** to inspect point membership and competing parents.
   Level-6 divisions are points only: draw level-5 parents instead. A point in multiple
   same-tier polygons receives the smallest containing polygon; division ID breaks ties.
   Competing IDs remain in the decision for review.
5. **Download fixtures** produces `stub-areas.json` (GeoJSON) and
   `geographic-hierarchy-patch.json` (one entry per division). Place both files under
   `fixtures/divisions/hk/`. Downloads do not apply ingestion or publish a release.

Browser storage retains drawings for the selected cohort. **Import stubs** validates
cohort and identity, replaces matching drawn divisions and retains other saved drawings.
Download fixtures to keep a durable copy outside browser storage. Reference polygons are
never overwritten.

The **Geometry cleanup** controls apply to saved level-3, level-4 and level-5 stubs.
Each selected level is clipped to the retained
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

The shared `geographicReview.ts` implementation is used by the map and tests. Stub
geometry takes precedence for the same division; reference providers then prefer HAD,
Overture and remaining providers. Point-on-boundary membership is included; hole
interiors are excluded. Numeric parent tiers must be smaller than the child tier.
Landforms use their category and class instead of numeric levels.

Point inference applies to localities and hoods at levels 3–6. Administrative divisions,
cities and landforms retain reviewed ancestry; a label point cannot establish the
administrative coverage of an island or city spanning multiple districts. Polygon
containment and intersection evidence for those features require a separate review.

Every export covers the complete inventory. `geometry` marks a division with a district
polygon and its immediate parent tier (or a level-3 town with district evidence).
`provisional` marks incomplete evidence with retained ancestry; `unresolved` marks the
same uncertainty when **Retain provisional ancestry** is disabled. Polygon matches and
overlap alternatives remain explicit. A geometric match is point-membership evidence,
not a claim that the child has its own polygon or that its entire extent is contained.

The cohort-scoped hierarchy patch checks division identity and canonical class during
Overture normalisation, after classification and source ancestry processing. Unresolved
entries block application. It changes canonical hierarchy paths, not retained publisher
assertions. Reingestion is required to materialise changes; this review does not mutate
published snapshots.

## Internal geometry variant

`stub-areas.json` belongs to the Hong Kong geographic domain and its explicit cohort.
The API accepts `include=areas:stub` only for that active cohort. Empty coverage returns
empty geometry relationships. Other domains and cohorts cannot use the fixture.

The variant is intentionally absent from public dataset/source registrations, public
variant enumerations, OpenAPI examples and default geometry selection. It is an explicit
review overlay, not an authoritative published geometry source. No source catalogue
entry or provider attribution is invented for hand-drawn geometry.

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
preview before it becomes a stub; published data is unaffected.
