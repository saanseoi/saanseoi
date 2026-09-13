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
stated 263-island total is not verified by this inventory. Do not interpret the
difference as 107 missing islands: groups, unnamed islets and counting definitions must
first be reconciled. The source also contains 71 Reef and 10 Rock records; these must
not automatically become islands.

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

A dataops release command must retain input versions and hashes, extraction parameters,
identity decisions, reviewed overrides and exception reports. Select the latest
available Islands release at or before the Overture cohort date, and pin the exact
selected release in the consuming manifest. Preserve source reference dates and actual
publication dates. Missing eligible historical inputs must remain explicit.

Reingestion will populate address landform associations and Place division projections;
no backfill of published records is planned. The release generator and complete island
reconciliation remain to be implemented after resolving inventory coverage.
