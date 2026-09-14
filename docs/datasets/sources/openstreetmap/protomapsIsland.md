# Protomaps island geometry

The SaanSeoi island assembly extracts reviewed island polygons from the selected
Protomaps baseline map. `protomapsIslandFeatures` is a source-shard assertion table:
each row retains the source feature ID, acquisition locator, native properties, native
polygon, release and validity history. It has no canonical division ID or selection
state.

The source is registered as `ds-hk-protomaps-island-feature` with the `protomaps`
variant and `divisionArea` resource type. Its retained local baseline is `2026-09-01.0`,
from the Hong Kong `refresh-hk-2026-09-01` map release.

The island review fixture chooses a Protomaps feature only after review. That choice is
stored with the assembled SaanSeoi snapshot and recorded in the canonical record as a
`geometry` contribution. It does not alter the retained Overture Division or LandsD
Place Name source rows.

For a matched island, such as Lantau, the assembled Division keeps the Overture ID,
LandsD supplies official names and aliases, and the selected Protomaps polygon supplies
the DivisionArea geometry. The assembly never unions overlapping source polygons.
