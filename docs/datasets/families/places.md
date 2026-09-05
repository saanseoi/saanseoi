# Places dataset family

The Places API family publishes Overture `place` records for the selected region. Each
Overture release is processed as a complete replacement snapshot and includes the raw
publisher source record in the source database.

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
staged, resumable release lifecycle. The Places initialiser replays the stored Overture
release list in cohort order, defers each API release set, and reconciles the completed
family at the end:

```sh
./bin/saanseoi init:places:overture --target local
```

The initialiser uses the upstream Places schema at each release boundary. The
2025-09-24.0 payload predates `basic_category` and `taxonomy`; `basic_category` is
present from 2025-10-22.0, and `taxonomy` is present from 2025-12-17.0. These are
source-schema transitions only; the canonical Places shape remains stable.

Publisher address data is included in the source record. Public Places expose localised
`freeformAddress` through PlaceI18n rather than an `addresses` field; the Overture
source record exposes `address.freeform`, `address.locality`, `address.country`,
`address.region`, and `address.postcode` as observational values. They must not be used
as authoritative inputs for canonical address or division relationships. Places with
`CN` or `MO` address country codes are excluded from the Hong Kong projection;
missing-country Places remain included. Both are recorded as review actions in the
release audit. Ingestion stops with a warning when a Place has more than one publisher
address, pending a reconsideration of the Place-to-address implementation.

Overture Division and Place IDs are checked against the Overture GERS Registry by the
local cache command. The command reports the exact GERS-backed and unmatched cohorts
used by the source files; UUID format alone is not accepted as evidence of GERS
membership.

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

Place localisation resolves explicit language and script evidence independently for
names, brand names, and free-form addresses. Missing locale information is inferred;
script conflicts are audited through release actions, and mixed-script source values
remain intact. Translation is optional and uses the dataset-scoped
`ds-hk-overture-place` fixture in batches of 50 only when an existing target PlaceI18n
row is missing a translatable field. Brand names are never translated.

To remove the bounded Overture Places initialisation from a target, use the
family-specific reset command. It reports its release-owned rows first and keeps a
dry-run and confirmation boundary:

```sh
./bin/saanseoi reset:places:overture --target local --dry-run
```

The generic `rollback:release` command remains available for an individual latest
published Places release.

## ZH-HANT

Places 的本地化會獨立處理名稱、品牌名稱及自由格式地址，並保留來源值及腳本衝突證據。公開 Place 使用 PlaceI18n 的
`freeformAddress`，不提供
`addresses`。翻譯是可選的，只在已有目標列時填補名稱或地址，品牌不會翻譯；`referenceName`
是不計入語言覆蓋率的衍生投影。

## ZH-HANS

Places 的本地化会独立处理名称、品牌名称及自由格式地址，并保留源值及脚本冲突证据。公开 Place 使用 PlaceI18n 的
`freeformAddress`，不提供
`addresses`。翻译是可选的，只在已有目标列时填补名称或地址，品牌不会翻译；`referenceName`
是不计入语言覆盖率的派生投影。
