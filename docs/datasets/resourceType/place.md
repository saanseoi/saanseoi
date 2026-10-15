# Place resource

The `place` resource is the canonical API representation of an Overture point of
interest. Its snapshot stores the point, publisher categories and contact data,
localised names and an optional ALS address link. Supported nullable scalar Division IDs
are canonical base content in CURRENT and HISTORY. `placesCells` is a current-only
spatial projection.

Place snapshots are immutable once published. A later Overture release creates a new
snapshot and only creates history versions for changed place content, localisation, or
the recorded address reference. The source table includes the publisher payload and
source version for audit and rollback. Publisher address components remain in the source
record's `properties`; the public Place object exposes localised `freeformAddress`
values through PlaceI18n, not an `addresses` field.

PlaceI18n provenance distinguishes provided, inferred, AI-translated, and human-verified
fields. The raw publisher value and locale evidence are retained for audit; the public
projection exposes only the trust-oriented provenance flags. Dataset-scoped translation
fixtures are optional and never translate brands. `referenceName` is derived at response
time and is not a synthetic locale or stable ID.

Place scalar memberships resolve from the effective point and pinned DivisionArea
polygons, with compatible Address fallback. SAR, city and island-group ancestors are
excluded. Exact levels, locale names and independently inherited logical revision
pointers use shared content-addressed `placeDivisionDefinitions` sets, selected by
`divisionDefinitionSetId`. New base versions retain their set in the HISTORY shard.
Historical reads and rollback use this evidence independently of live serving scopes.
Locale search text retains its own original dependency versions for fresh and
incremental FTS.

## ZH-HANT

PlaceI18n 會保存本地化名稱及 `freeformAddress`。公開 Place 不提供
`addresses`；來源完整地址仍保留在 source
record。來源值、腳本證據及提供、推斷、機器翻譯和人工驗證狀態均可供審核；公開回應只提供判斷可信程度所需的來源旗標。`referenceName`
是回應時的顯示投影，不是語言列或穩定識別碼。

## ZH-HANS

PlaceI18n 会保存本地化名称及 `freeformAddress`。公开 Place 不提供
`addresses`；源完整地址仍保留在 source
record。源值、脚本证据及提供、推断、机器翻译和人工验证状态均可供审核；公开回应只提供判断可信程度所需的来源标记。`referenceName`
是响应时的显示投影，不是语言列或稳定标识码。
