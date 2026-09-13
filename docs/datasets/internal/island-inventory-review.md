# Hong Kong island inventory review

## Verified inputs

The retained LandsD Place Name source release `2026-06-10.0` contains 2,706 records. Its
Topographic class includes 156 `Island` records and four `Islands` records. All 160 have
point geometry and official English and Traditional Chinese names. The four groups are
Ninepin Group, Po Toi Islands, Soko Islands and The Brothers. Aliases are retained
separately from official names.

These records are excluded from the settlement projection, which selects only
`PLACE_CLASS=Settlement`. Island intake must read the full retained gazetteer rather
than the canonical settlement collection. Source coordinates are EPSG:2326; convert them
to WGS84 for spatial matching while retaining the native geometry.

The review export is `.local/reviews/islands/landsd-island-names.geojson`. It contains
160 WGS84 points with native geometry, source IDs, source version hashes and names. This
is an inventory export, not a published island dataset or accepted identity map. The
stated 263-island total is not verified by this inventory. The source also contains 71
Reef and 10 Rock records; these must not automatically become islands.

The September 2026 basemap comparison found **253 unique named** `place=island`,
`place=islet` and `place=archipelago` name strings after English/fallback-name
normalisation and deduplication. 142 match the reviewed LandsD names or aliases exactly;
111 are basemap-only candidates. Those 111 names have been appended to the local
[geometry reviewer](http://localhost:5174/local-review/islands/) alongside the 156
individual LandsD island candidates, giving 267 review entries. The complete extracted
name difference is listed in the
[basemap-only gap review](island-basemap-gap-review.md). This is a source coverage
comparison, not a count of physical islands: rocks, reefs, chambers, group labels,
duplicated geometries and differing counting rules still require review.

Each reviewer entry has `coverage: "landsd-gazetteer"` or `coverage: "basemap-only"`.
Coverage is processing evidence and belongs in source/review metadata; it is not an
identity identifier. Provider identifiers remain reserved for actual LandsD or OSM
object identities. The basemap-only entries retain the OSM source release, relevant
tags, Wikidata where present, and alternate geometries when the export contains more
than one candidate for a name.

## Geometry and scheduling

The installed `saanseoi-monthly-tiles.timer` runs on the first day of each month at
00:05 HKT. On 13 September 2026 its last trigger was 1 September and its service
reported success; the next trigger was 1 October. It invokes `schedule:run tiles`, which
runs `tiles:refresh`, including publication.

The local pipeline retains `.local/tiles/sources/hk.osm-coastline.pbf` and produces
version-labelled `coastline-land.geojson`, `coastline-water.geojson` and coastline line
artefacts through `tilesGeometry.ts`. Use the land polygons and their exact source
provenance, not rendered tiles or an unversioned experimental land export. Regional
clipping can truncate features at the boundary and requires review.

## Accepted dataset design

SaanSeoi Islands will prefer an existing Overture island identity, with a LandsD source
identity as fallback. Reconcile official names, aliases, location and physical extent,
keeping towns and their islands distinct. Prefer usable Overture physical island
polygons; otherwise use source-derived land polygons. Reject settlement polygons as
island geometry.

Group geometry must include all land within a reviewed group extent, including unnamed
islets. A group label point does not establish that extent; retain reviewed group
membership or boundary evidence. Flag unmatched names, ambiguous matches, reclamation,
bridge connections and missing small islands.

The current review policy is recorded in
`fixtures/meta/curations/saanseoi-island-review.json` as `geometryPolicy` version 1. It
formalises the rejected examples: remove man-made attachments; separate separately named
landforms and tombolo-connected land; re-anchor a displaced source point; and merge
aliases into one physical identity while retaining source assertions. Rejection codes
are retained beside the human-readable review notes so later geometry extraction can
apply the same correction consistently.

A dataops release command must retain input versions and hashes, extraction parameters,
identity decisions, reviewed overrides and exception reports. Select the latest
available Islands release at or before the Overture cohort date, and pin the exact
selected release in the consuming manifest. Preserve source reference dates and actual
publication dates. Missing eligible historical inputs must remain explicit.

The current local run emits 250 polygonal island identities, including six geometry
corrections selected from named basemap polygons and the Ping Chau and East Ninepin
alias merges. The review table is written to `.local/harbour/islands/curated-review.md`,
with machine-readable evidence in `.local/harbour/islands/curated-review.json`. The
upload gate remains closed while Ap Lei Chau, Ap Lei Pai, Kiu Tau, Tai Chau, Comber Rock
and High Island await manual decisions.

Reingestion will populate address landform associations and Place division projections;
no backfill of published records is planned. The curation processor and upload gate are
implemented; the remaining work is to resolve the six manual geometry and landform
decisions before the first island-bearing Geographic release.
