# Division areas and boundaries

`divisionArea` and `divisionBoundary` are geometry companions to the `division` API
family. They are logical resource types with provider-specific variants; each provider
assertion has its own source snapshot and canonical history/current rows. Geometry is
never merged implicitly across providers.

The normative contract is in
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). Provider facts and
quality decisions belong under [`docs/datasets/sources`](../sources/).

An area associates an accepted provider geometry union (normally Polygon/MultiPolygon)
with one division. A boundary associates an accepted provider geometry union (normally
LineString/MultiLineString) with two ordered divisions. The adapter declares the union;
single geometries must not be rejected merely because a multi geometry is also present.
Canonical `type` may be `land`, `maritime`, or `mixed`; `mixed` is used when both land
and territorial coverage flags are true.

The canonical layer normalizes relationship IDs, preserves bbox and transformed
geometry, records source keys and provenance, and keeps provider flags exactly as
received. Source-specific fields remain available through `rawProperties` and the source
tables. External identifiers are resolved through reviewed bridge fixtures when they do
not equal canonical IDs.

Overture geometry uploads are anchored to the exact cohort of the primary division
snapshot. Independently versioned provider variants, such as the Home Affairs Department
district areas, are bridged directly to canonical division identifiers and can be
published without an exact-cohort division snapshot. When a Divisions API release set is
composed, it selects the newest published geometry snapshot at or before the release-set
cohort for each provider dataset; this keeps an older valid variant available without
allowing future geometry into the set. Family-required snapshots determine publication;
optional variants can be added after the required set is complete. The current Divisions
family policy configures Overture area and boundary snapshots as required/default
members; this is a family policy, not an intrinsic property of every future provider.

Geometry relationships are sparse and opt-in. Clients request plural paths such as
`include=areas` or `include=boundaries`; a qualified path (`areas:<provider>` or
`boundaries:<provider>`) selects a named variant. Unknown or unavailable variants are
errors rather than silent fallback. See
[`spec/atlas-api.md`](../../../spec/atlas-api.md) for response semantics.
