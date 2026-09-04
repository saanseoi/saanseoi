# Place resource

The `place` resource is the canonical API representation of an Overture point of
interest. Its snapshot stores the point, publisher categories and contact data,
localised names, optional ALS address links, and canonical Overture division links.
`placesDivision` and `placesCells` are snapshot-scoped relationship and lookup tables.

Place snapshots are immutable once published. A later Overture release creates a new
snapshot and only creates history versions for changed place content, localisation, or
resolved reference relationships. The source table retains the publisher payload and
source version for audit and rollback.
