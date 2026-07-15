# Division areas and boundaries

The `divisionArea` and `divisionBoundary` resource types are geometry companions to the
`division` API family. They are required members of an exact-cohort divisions API
release set and are stored in separate source, history, and current tables.

The primary `division` snapshot must be published first for a cohort. Areas and
boundaries may then be uploaded in either order; each geometry upload is rejected unless
the exact-cohort division snapshot is available. Publishing either geometry dataset
without its counterpart leaves the API release set as a draft. The release set becomes
current when the division, area, and boundary snapshots for the cohort are all present.

Areas associate a Polygon or MultiPolygon with one division. Boundaries associate a
LineString or MultiLineString with two divisions (`leftDivisionId` and
`rightDivisionId`). The API keeps these sparse relationships opt-in: clients request
`include=areas` or `include=boundaries` when they need geometry companions.

Both geometry types retain Overture's land and territorial flags, including conflicting
upstream values. Boundary `perspectives` values are a blocking preflight error because
that field is intentionally dropped from the model. `CN-GD` rows are excluded while
null-country maritime boundaries are retained.
