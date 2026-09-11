# Division hierarchy materialisation

## v1

### EN

Ingestion materialises `hierarchies.administrative`, `hierarchies.locality` and
`hierarchies.full` as arrays of paths. Each entry is `{ id, name, class }`; paths
exclude the division itself and the country referent. Administrative paths contain SAR →
area → district. Locality paths contain the nearest locality and up to three hood
ancestors; a hood need not belong to a locality. Full paths combine the correlated
administrative and locality ancestry, omitting the locality only when its class is
`city`.

Multiple district or hood branches remain separate paths. Ingestion does not form a
Cartesian product of unrelated branches. The SAR → area → district guard validates each
evidenced path. Missing or conflicting required district ancestry blocks ingestion.

Names come from canonical translations during ingestion. The shared display-name helper
trims Traditional Chinese (`zh-hant`) and English (`en`), joins distinct values with one
space, uses the sole available value, or returns null when neither exists. Stored paths
and labels are returned directly by the API; loading does not reconstruct them.
`include=hierarchy` optionally includes distinct ancestor resources, including cities.

The complete source file and supplemental identities supply the ancestor lookup. Source
locality ancestors require a resolvable class. Original source hierarchies remain in
`rawProperties`.

### ZH-HANT

匯入時會將 `hierarchies.administrative`、`hierarchies.locality` 及 `hierarchies.full`
儲存為路徑陣列。每個項目為 `{ id, name, class }`，不包含自身或國家參照點。行政路徑為 SAR
→ area →
district；聚落路徑包含最近的聚落及最多三個 hood 祖先，也容許沒有聚落的 hood。完整路徑保留相關分支，只在聚落 class 為
`city` 時省略該聚落。

跨行政區或 hood 的分支分開保存，不會任意交叉組合。每條路徑均通過行政層級驗證。名稱在匯入時以去除首尾空白的
`zh-hant` 及 `en`
組合，中間加一個空格；相同字串只顯示一次，只有一種語言則使用該值，兩者皆無則為 null。API 直接回傳已儲存的路徑，不在載入時重建。`include=hierarchy`
可附帶祖先資源，包括城市。原始層級保留於 `rawProperties`。

### ZH-HANS

导入时会将 `hierarchies.administrative`、`hierarchies.locality` 及 `hierarchies.full`
储存为路径数组。每个项目为 `{ id, name, class }`，不包含自身或国家参照点。行政路径为 SAR
→ area →
district；聚落路径包含最近的聚落及最多三个 hood 祖先，也允许没有聚落的 hood。完整路径保留相关分支，只在聚落 class 为
`city` 时省略该聚落。

跨行政区或 hood 的分支分开保存，不会任意交叉组合。每条路径均通过行政层级验证。名称在导入时以去除首尾空白的
`zh-hant` 及 `en`
组合，中间加一个空格；相同字符串只显示一次，只有一种语言则使用该值，两者皆无则为 null。API 直接返回已储存的路径，不在加载时重建。`include=hierarchy`
可附带祖先资源，包括城市。原始层级保留于 `rawProperties`。

## Published search

Latest-release Division search indexes localised names, aliases, name-rule values and
curated codes. Stored ancestor names participate only when the request sets
`ancestors=true`; all correlated hierarchy paths are retained. Finalisation compares the
stored projection after the upload sequence, so unchanged snapshot promotion writes only
its scope mapping. See [Division text search](../../families/divisions.md#text-search).
