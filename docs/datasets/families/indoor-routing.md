# Optional indoor pedestrian routing

The experimental Hong Kong indoor edition is independent of the default OSM routing
editions. It combines Lands Department 3D Pedestrian Network and 3D Indoor Network
segments, with 98 station graphs for authoring and application routing. It contains no
vehicle network. Existing default pointers and retention policies are not changed.

Publication: https://tiles.saanseoi.hk/routing/hk/indoor/2026-11-16/manifest.json

The manifest contains payload hashes, source hashes, station coverage and limitations.
`stations/{CODE}.json` preserves source node and segment identities, floor mappings,
direction, access class, estimated time, POI attachments and exact outdoor portal nodes.
`valhalla-all.tar.gz` includes paid areas. `valhalla-unpaid.tar.gz` excludes paid
segments structurally. Neither download is enabled in the hosted routing service.

## Validation and remaining native integration

Both variants compile with the pinned 3.8.3 engine and retained elevator-patched
binaries; `build.json` records binary hashes and the container digest. OSM reference
validation reports no missing nodes. Native smoke requests succeed for walkway, stairs,
escalator and lift examples, but identical-XY lift landings can return zero distance
even with `search_filter.level`. Therefore `nativeServiceReady` is false. Do not treat
successful HTTP responses as proof of correct inter-floor routing. Correct the lift
representation and test snapped levels, reverse paths and complete outdoor-to-POI
journeys before hosting this graph as a live routing engine.

Nine station graphs have no accepted outdoor portal: AIR, AWE, LMC, LOW, MKK, MOS, RAC,
TSH and TWO. Excluded time-restricted paths may contribute to gaps. Missing portals are
not repaired using proximity. Place attachments use network vertices contained in their
source unit and floor; these are not surveyed doors. Entry amenities additionally need a
visible attachment within five metres. Some places remain unmatched.

Hype can opt into its own Dijkstra search over these source station graphs. That search
preserves distinct XYZ identities and does not depend on Valhalla snapping. It supports
strict unpaid-only, unpaid-first fallback and paid-allowed search. Native costs differ
from station-side estimated times; neither is calibrated travel-time evidence.

## Rebuild and publication

Run Python processing under `dev-check`, with the versions in
`scripts/routing/indoor/requirements.txt`. `prepare.py` takes `--indoor`, `--outdoor`,
`--baselines` and a fresh `--out`. `build.py` takes `--prepared` and the directory of
pinned `--binaries`. Outputs are immutable; use a new directory for each attempt.

`publish.py --prepared DIRECTORY --version YYYY-MM-DD` prepares and checks the release;
adding `--publish` uploads only the indoor namespace. Payloads are uploaded before the
completion manifest. An existing different completed edition is rejected. No default
latest pointer or default routing retention function is called. The artifact Worker
serves only allowlisted paths and requires a completed manifest for payload retrieval.

See [LandsD source contract](../sources/landsd/indoor-routing.md).
