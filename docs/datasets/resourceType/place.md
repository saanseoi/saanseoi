# Place resource

The `place` resource is the canonical API representation of an Overture point of
interest. Its snapshot stores the point, publisher categories and contact data,
localised names, and an optional ALS address link. `placesDivision` and `placesCells`
are current-storage materialisations: they are rebuildable projections for the active
Place snapshot, not historical tables.

Place snapshots are immutable once published. A later Overture release creates a new
snapshot and only creates history versions for changed place content, localisation, or
the recorded address reference. The source table retains the publisher payload and
source version for audit and rollback. Publisher address components remain in the source
record's `rawProperties`; the public Place object exposes localised `freeformAddress`
values through PlaceI18n, not an `addresses` field.

PlaceI18n provenance distinguishes provided, inferred, AI-translated, and human-verified
fields. The raw publisher value and locale evidence are retained for audit.
Dataset-scoped translation fixtures are optional and never translate brands.
`referenceName` is derived at response time and is not a synthetic locale or stable ID.

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

## ZH-HANT

PlaceI18n 會保存本地化名稱及 `freeformAddress`。公開 Place 不提供
`addresses`；來源完整地址仍保留在 source
assertion。來源值、腳本證據及提供、推斷、機器翻譯和人工驗證狀態均可供審核。`referenceName`
是回應時的顯示投影，不是語言列或穩定識別碼。

## ZH-HANS

PlaceI18n 会保存本地化名称及 `freeformAddress`。公开 Place 不提供
`addresses`；源完整地址仍保留在 source
assertion。源值、脚本证据及提供、推断、机器翻译和人工验证状态均可供审核。
`referenceName` 是响应时的显示投影，不是语言列或稳定标识码。
