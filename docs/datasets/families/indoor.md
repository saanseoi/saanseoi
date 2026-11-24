# Indoor layouts

Indoor layouts describe levels, spaces, openings, amenities and occupants independently
of the outdoor basemap.

## Source identity

Join occupants to spaces only by the source `unit_id`, and filter by `level_id`. Floor
labels and ordinals are not unique: three separate Kennedy Town entrance areas share the
same ground-floor ordinal. Preserve both English and Chinese source labels.

Occupants remain separate from the physical spaces they occupy. Source occupants are not
SaanSeoi place identities or accepted catalogue links. Preserve missing shop codes and
multiple occupants in one space without inventing subdivisions.

## Geometry and connectivity

Keep source coordinates and level identifiers intact. Paid and unpaid sections come from
explicit source attributes; unknown sections remain unknown. Geometric overlap between
connectors on different levels does not establish a traversable connection or an
escalator's operating direction.

The source does not certify step-free access or current tenants and opening hours.
Before publishing derived data, review the source terms and define an update policy for
occupant data.

See [Lands Department indoor source](../sources/hkgov-landsd/indoor.md) for provenance,
coverage, attribution and source limitations.
