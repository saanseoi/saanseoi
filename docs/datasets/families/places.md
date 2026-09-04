# Places dataset family

The Places API family publishes Overture `place` records for the selected region. Each
Overture release is processed as a complete replacement snapshot and retains the raw
publisher assertion in the source database.

Places has two required reference members:

- the default canonical address snapshot;
- the Overture canonical division snapshot.

Reference members use `latest_at_or_before_or_earliest_after_cohort`. This is
intentional: Overture releases are monthly, while the authoritative ALS address dataset
is released irregularly. A Places release therefore records the newest published
compatible reference snapshot available at its cohort, falling forward only when no
earlier snapshot exists. The selected snapshot IDs are recorded as lookup provenance and
are used by both publication and replay.

The normal upload lifecycle is shared with the other API families:

```sh
./bin/saanseoi upload <place-parquet> --type place --theme places \
  --source overture --source-version YYYY-MM-DD.0 --cohort-key YYYY-MM-DD.0
```

`update --api-family places` discovers and uploads new Overture releases using the same
staged, resumable release lifecycle. The Places initialiser replays the retained
Overture release list in cohort order, defers each API release set, and reconciles the
completed family at the end:

```sh
./bin/saanseoi init:places:overture --target local
```

Canonical place rows are indexed at H3 resolutions 5, 7, and 9. Search uses the
rebuildable `placesFts` index. `placesDivision` and `placesCells` are current-only
projections and are rebuilt for the active Place snapshot; they are not copied into
history. The division projection is derived from the selected address snapshot's
`divisionSnapshotId` and division IDs.

Place history records the address snapshot and address ID selected for each version.
Historical reads must follow that recorded address snapshot into historical addresses
and then use the address entry's division IDs. They must not join a historical Place to
the latest address or division projection. Place history uses the source payload plus
the resolved address reference as its version boundary; unchanged places do not create a
new history version.

To remove the bounded Overture Places initialisation from a target, use the
family-specific reset command. It reports its release-owned rows first and keeps a
dry-run and confirmation boundary:

```sh
./bin/saanseoi reset:places:overture --target local --dry-run
```

The generic `rollback:release` command remains available for an individual latest
published Places release.
