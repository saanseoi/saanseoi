# Divisions dataset family

The Divisions API family combines canonical divisions with geometry companions. Geometry
variants are source-specific assertions and are not merged. The family currently
requires a snapshot for each resource type: canonical `division`, `divisionArea`, and
`divisionBoundary`. Required variants of one resource type are alternatives, so at least
one eligible area source is sufficient. An area may be the exact-cohort Overture
snapshot or the latest published HAD snapshot at or before the set cohort; the boundary
requirement currently remains exact-cohort Overture. This lets long-lived authoritative
HAD geometry accompany a newer canonical division release without selecting future data.

The reusable resource contract and variant rules are documented in
[`divisionGeometry`](../resourceType/divisionGeometry.md) and
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). The Overture and
Home Affairs Department profiles are kept in the provider source folders:

- [`Overture geometry`](../sources/overture/divisionGeometry.md)
- [`Home Affairs Department area`](../sources/hkgov-had/divisionArea.md)
- [`Overture historical reconstructions`](../sources/overture/historicalReconstruction.md)
- [`Planning Department TPU and subunit areas`](../sources/hkgov-pland/divisionArea.md)

Planning Department TPU/subunit areas and New Town areas are optional variants. The
former accompany Planning Department canonical planning divisions at the exact cohort.
Planning Department canonical planning rows coexist with Overture geographic rows in a
cohort snapshot: replacement is scoped to the provider/domain assertion set, never to
all canonical divisions. New Towns follow the same planning-domain model and do not
bridge to Overture geographic towns. Neither changes the Overture/HAD default selection.

Functional domains are explicit (`administrative`, `planning`, `electoral`, and
`geographic`). A division may have secondary domain memberships, while hierarchy edges
carry domain context so planning or electoral relationships cannot enter the default
administrative traversal accidentally. Cohort keys identify the period selected for a
release; source publication and validity metadata remain provenance.
