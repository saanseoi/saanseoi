# Place resource

The `place` resource is the canonical API representation of an Overture point of
interest. Its snapshot stores the point, publisher categories and contact data,
localised names, and an optional ALS address link. `placesDivision` and `placesCells`
are current-storage materialisations: they are rebuildable projections for the active
Place snapshot, not historical tables.

Place snapshots are immutable once published. A later Overture release creates a new
snapshot and only creates history versions for changed place content, localisation, or
the recorded address reference. The source table retains the publisher payload and
source version for audit and rollback.

The current `placesDivision` projection is derived from the accepted ALS address row's
`divisionSnapshotId` and division IDs. It must never be used to answer a historical
Place query. Historical traversal is instead:

```text
historical Place -> recorded address snapshot and address ID
                 -> historical address entry -> division IDs
```

This keeps each historical release tied to the address snapshot selected by its
reference policy. A newer address snapshot is used only when that adoption is explicitly
recorded in a later Place revision.
