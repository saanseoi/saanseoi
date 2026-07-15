# Division areas and boundaries

The `divisionArea` and `divisionBoundary` resource types are geometry companions to the
`division` API family. They are required members of an exact-cohort divisions API
release set and are stored in separate source, history, and current tables.

Areas associate a Polygon or MultiPolygon with one division. Boundaries associate a
LineString or MultiLineString with two divisions (`leftDivisionId` and
`rightDivisionId`). The API keeps these sparse relationships opt-in: clients request
`include=areas` or `include=boundaries` when they need geometry companions.

Both geometry types retain Overture's land and territorial flags, including conflicting
upstream values. Boundary `perspectives` values are a blocking preflight error because
that field is intentionally dropped from the model. `CN-GD` rows are excluded while
null-country maritime boundaries are retained.
