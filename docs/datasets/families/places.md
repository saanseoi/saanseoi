# Places dataset family

The Places API family publishes Overture `place` records for the selected region. Each
Overture release is processed as a complete replacement snapshot and includes the raw
publisher source record in the source database.

Places has three required reference members:

- the default canonical address snapshot;
- the cohort's Overture Places supplementary address snapshot
  (`address/overture-places`);
- the Overture canonical division snapshot.

The official reference members use `latest_at_or_before_or_earliest_after_cohort`. This
is intentional: Overture releases are monthly, while the authoritative ALS address
dataset is released irregularly. A Places release therefore records the newest published
compatible reference snapshot available at its cohort, falling forward only when no
earlier snapshot exists. The selected snapshot IDs are recorded as lookup provenance and
are used by both publication and replay.

The supplementary member uses `exact_ref` and is produced within Places ingestion. The
Overture Places dataset declares both resource types and retains one publisher source
release for the Place and Address resource releases. Address output includes its number
lookup and full-text index. Once the data imports succeed, ingestion publishes an
Address release set in the `saanseoi` domain with the selected ALS and supplementary
snapshots; the shared source release is finalised only after both outputs succeed. The
Address list and search endpoints expose `filter[dataset]` while preserving the combined
default. Address analysis and curation finish before supplementary Address rows, then
Place rows, are materialised. Canonical ALS matches create no supplementary rows.
Accepted partial matches retain Overture provenance and may derive division IDs from a
recorded ALS base; curated rows without a base have no division IDs. Shared normalised
2D identities share an Address ID across Places. Unit and floor observations remain
source evidence. Review-required candidates stop ingestion before Place writes,
including with `--yes`. Unmatched Places remain available through H3 cells and search.
See the
[source policy](../sources/overture/places.md#matching-policy-and-review-operation) for
thresholds, identity decisions and retry behaviour.

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
as authoritative inputs for canonical address or division relationships. Street-only
evidence, including a contradictory building number without matching premise evidence,
remains unlinked and is delayed rather than entering identity review. Places with `CN`
or `MO` address country codes are excluded from the Hong Kong projection;
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

The Places collection endpoint is `GET /places/v0.1/{region}`. It uses the shared
JSON:API list shape with release-set selection, `page[limit]` and `page[offset]`,
permalinks, and `basicCategory`, `taxonomyPrimary`, `operatingStatus`, and Division
filters. The `compact`, `default`, `map`, and `full` profiles progressively add ordinary
place details, point geometry, and audit/provenance fields. H3 cell memberships remain
current indexing projections rather than canonical Place attributes; use `by-cell` for
that map lookup.

Place history records the address snapshot and address ID selected for each version.
Historical reads must follow that recorded address snapshot into historical addresses
and then use the address entry's division IDs. They must not join a historical Place to
the latest address or division projection. Place history uses the source payload plus
the resolved address reference as its version boundary; unchanged places do not create a
new history version.

Place localisation resolves explicit language and script evidence independently for
names, brand names, and free-form addresses. Missing locale information is inferred;
script conflicts are audited through release actions, and mixed-script source values
remain intact. Machine translation of Place names and free-form addresses is disabled;
missing PlaceI18n values remain missing.

Place-to-address matching uses the selected ALS snapshot's English and Traditional
Chinese address definitions as per-snapshot indexes. Exact canonical building, estate,
block, and phase components are recognised alongside a street and its adjacent
building-number expression. A match is accepted only when that evidence selects one
canonical address. English suffix abbreviations are expanded only into the full-name
matching form used by the reference definition; this does not rewrite the publisher text
or establish a separate canonical spelling policy. Common Chinese number forms are also
normalised.

The parser reports recognised canonical components, the street, building-number
expression, residual 2D text, and whether the observation is a premise candidate,
street-only, or unrecognised. Shop, unit, room, floor, and similar fragments are
stripped from the 2D candidate and retained as typed prospective address3d parts using
the canonical unit/floor expression, reference, and type vocabulary. They do not create
address3d rows yet. Ambiguous ALS matches remain unresolved. Locality, venue, and
street-only source values remain unlinked and are retained in the source Place record.

The parser can accept bilingual canonical Streets definitions as a separate reference
vocabulary. Places ingestion currently derives its street vocabulary from the selected
ALS definitions because the Places composition does not declare a Streets member. A
staged LandsD baseline is not a published lookup dependency and must not be read
directly during publication.

A parsed premise candidate which has no ALS match is not promoted into the official ALS
source. The Overture Places supplementary Address source retains its Overture Place,
source-release, selected candidate evidence, and confidence provenance. Policies,
reviewed aliases, and human identity decisions are version controlled; deterministic
accepted entries are regenerated into a target-specific `.local` ledger. Weaker partial
matches stop in the address identity-drift review workflow, while candidates without
meaningful premise evidence remain for later processing. A partial canonical name is
premise evidence only when the same candidate also matches the canonical street, unless
an explicit reviewed alias applies. The required matcher tiers, curation artefacts,
provenance, materialisation order, and publication stops are specified in the
[Overture Places source instructions](../sources/overture/places.md#supplementary-address-materialisation).

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
`addresses`。地點名稱、品牌及自由格式地址均不使用機器翻譯；`referenceName`
是不計入語言覆蓋率的衍生投影。

Places collection endpoint 為
`GET /places/v0.1/{region}`，使用共用 JSON:API 清單格式、release-set 選擇、`page[limit]`、`page[offset]`、permalink，以及
`basicCategory`、 `taxonomyPrimary`、`operatingStatus`
和 Division 篩選。`compact`、`default`、`map` 和 `full`
profile 依序加入一般地點資料、點幾何和審核／來源欄位。H3 儲存格成員仍是 current 索引投影，不是 canonical
Place 屬性；地圖查詢請使用 `by-cell`。

## ZH-HANS

Places 的本地化会独立处理名称、品牌名称及自由格式地址，并保留源值及脚本冲突证据。公开 Place 使用 PlaceI18n 的
`freeformAddress`，不提供
`addresses`。地点名称、品牌及自由格式地址均不使用机器翻译；`referenceName`
是不计入语言覆盖率的派生投影。

Places collection endpoint 为
`GET /places/v0.1/{region}`，使用共用 JSON:API 列表格式、release-set 选择、`page[limit]`、`page[offset]`、permalink，以及
`basicCategory`、 `taxonomyPrimary`、`operatingStatus`
和 Division 筛选。`compact`、`default`、`map` 和 `full`
profile 依次加入一般地点资料、点几何和审核／来源字段。H3 单元格成员仍是 current 索引投影，不是 canonical
Place 属性；地图查询请使用 `by-cell`。
