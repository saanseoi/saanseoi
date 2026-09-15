# SaanSeoi reviewed DivisionArea

The Hong Kong assembly combines the reviewed hierarchy in
`fixtures/divisions/hk/geographic-hierarchy-patch.json`, drawings in `stub-areas.json`
and island inventory in `island-areas.json` with published Overture Division and
DivisionArea snapshots. Both curated snapshots use the `saanseoi` variant. The
geographic API composition selects the curated Division primary and DivisionArea
companion together.

Geometry precedence, per canonical division, is reviewed drawing, then island inventory
polygon, then Overture area. Drawings replace all source area parts for that division.
Polygon and MultiPolygon coordinates, holes and shared edges are retained exactly. No
simplification, rounding, snapping or buffering runs during assembly. Review-only
original drawings and working baselines are not published as geometry.

Island review identifiers map to existing island identities when unambiguous, or stable
UUIDs otherwise. Hierarchy references use those same canonical identifiers. Missing
ancestors, conflicting classes, ambiguous island identities and malformed rings block
assembly. Ma Shi Chau uses its retained named island polygon: the coastline
connected-component candidate includes mainland Hong Kong. Its explicit
`restrictHierarchyToGeometry` correction removes ancestry assertions whose reviewed
point lies outside that island. Both review editors and the island inventory generator
read the corrected upstream fixture. The hierarchy patch also excludes the incorrect
mainland ancestry so an editor export cannot reintroduce it. Other reviewed hierarchy
paths are retained.

## Local ingestion

The initial independent edition is `2026-09-01.0`, published on 1 September 2026. The
Division and DivisionArea datasets have an **as-needed** cadence. The manifest in
`fixtures/divisions/hk/release.json` records the edition date separately from its
reviewed Overture input cohort, `2026-08-19.0`, and September coastline reference.
Drawings are retained between editions; monthly Overture uploads do not create a new
reviewed edition.

After a local Hong Kong Overture Division or DivisionArea upload for the input cohort,
the CLI assembles this edition once both native projections are available. A local
database reset followed by metadata sync and those source uploads recreates the edition
from the fixtures. Remote publication is not implemented by this assembler.

The exclusions in `fixtures/divisions/hk/exclusions.json` remove North Rock and Kap Ma
Kum Tong from reviewed coverage. Kap Ma Kum Tong also has a guarded native Overture
exclusion; North Rock is rejected in the supplemental island curation. The inventory
generator and geometry editor apply these exclusions.

In [the local editor](http://localhost:5174/local-review/), open Cleanup, select islands
with polygons, and choose **Clip islands to coast**. Accepted island reference polygons
can be selected directly; point-only islands need an outline first. Each outline is
intersected independently with the detailed coastline, retaining island classification.
Undo restores the previous drawings. Download fixtures to retain the edited geometry for
ingestion.

To repeat assembly against already ingested local sources:

```sh
bun apps/harbour-cli/scripts/assemble-curated-divisions.ts
```

The publisher retains inputs and assembled rows under
`.local/curated-divisions/<sha256>/`, writes current and retained history rows in a
transaction, publishes immutable root snapshots, and publishes the geographic API
release set only after both snapshots are ready. Repeating identical inputs reuses the
published snapshots and verifies their current publication receipts. Existing published
snapshots remain available through retained history. A changed root snapshot requires a
corresponding API field fixture anchor; unsupported signatures fail rather than reuse an
unreviewed mapping.

## Geocoding and coverage

`/divisions/v1/geocode` reads the selected published SaanSeoi area snapshot, with
Overture fallback for releases without one. It does not read the drawing fixture at
request time. `geometry=area` includes the selected polygons. Bounding boxes reject
irrelevant polygons before exact point-in-polygon tests. Points on a shared edge retain
both memberships rather than falling into a numerical gap.

The reviewed local assembly contains 2,088 divisions, 488 areas and all 117 drawings.
There are 266 canonical island divisions. Coverage is partial: many named divisions have
no polygon. Full-profile `meta.datasetCoverage` reports this separately from the lookup.
A fully evidenced lookup is `resolved`; competing hierarchy paths remain `ambiguous`.
For example, Prince Edward and Mong Kok both contain the tested point but the reviewed
hierarchy does not make one the ancestor of the other. The resolver preserves both
paths.

All 488 assembled polygons passed the geometry validity audit. Exact preservation
introduces no new seams, but does not repair gaps or overlaps in the inputs. The
reviewed L5 drawings include an approximately 113 m² overlap between Kowloon Tsai and
Kowloon Tong. Administrative and locality categories can intentionally overlap.

On the local development machine, a 3,000-lookup benchmark over Austin, Prince Edward
and San Po Kong measured approximately 0.10 ms median and 0.15 ms p95 in the resolver,
with an 8 ms index build over 125,695 vertices. HTTP requests, including loading and
parsing the release, took roughly 200–300 ms. These are development measurements, not
production throughput guarantees. Retaining exact geometry is appropriate; optimise
release-scoped loading before reducing geometric precision. Any future simplified
derivative must simplify shared topology once for the complete coverage, then validate
gaps, overlaps, holes and point classifications against the detailed version.
Independently simplifying each polygon is unsuitable.

Local examples:

- [Austin, L5](http://localhost:8787/divisions/v1/geocode?lat=22.3036669&lng=114.1658961)
- [San Po Kong, L5](http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697)
- [Lamma Island](http://localhost:8787/divisions/v1/geocode?lat=22.2094533&lng=114.1497273)
