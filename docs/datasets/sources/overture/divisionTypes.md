# Canonical division classes

Overture retains its publisher inventory and geometry independently of SaanSeoi
editorial decisions. Canonical normalisation maps publisher level, class and category
into the shared Division schema, normalises locale tags and splits recognisable
bilingual names. It does not apply SaanSeoi identity-specific names, classifications,
translations, exclusions, hierarchy corrections or constructed area geometry.

SaanSeoi preparation owns editorial patches and curated source selection. It writes
final names, taxonomy, hierarchy and geometry into the published SaanSeoi archive;
canonical materialisation reads that prepared contract.

The `division-normalisation.json` processing fixture owns subtype/class mappings,
hierarchy classifications, ordered level tokens, curated Hong Kong area identity
recognition and fallbacks. The normaliser consumes these parameters directly.
Level-token order and substring matching are significant; review both when editing
taxonomy policy.

The retained declaration includes the executor's ordered condition trees and stable
branch IDs. Level-token branches distinguish subtype, class and administrative-level
matches. Locality mappings are counted separately for level and class; class fallback
does not count its supporting level lookup a second time. Bulk matched counts count only
selected branches, and changed counts compare canonical results with raw source `level`
and `class` values. Unselected branches retain zeroes. Missing historical conditions or
counts remain **not recorded**.

Local division ingestion reports provenance retention and delivery after SQL generation.
Shared audit fixtures use a bounded cache of verified JSON objects during verification;
each individual curation pointer is checked before the audit manifest is retained.

## v1

### EN

SaanSeoi stores division `category`, `class` and `level` independently of the
publisher's `subtype` and `class`. `filter[class]` selects a canonical class;
`filter[category]` selects administrative, locality, hood or landform divisions. A level
alone does not identify a class.

| category       | class         | level |
| -------------- | ------------- | ----- |
| administrative | sar           | 0     |
| administrative | area          | 1     |
| administrative | district      | 2     |
| locality       | city          | 1     |
| locality       | town          | 3     |
| locality       | village       | 5     |
| locality       | hamlet        | 6     |
| hood           | macrohood     | 4     |
| hood           | neighbourhood | 5     |
| hood           | microhood     | 6     |
| landform       | major_island  | null  |
| landform       | minor_island  | null  |
| landform       | islet         | null  |
| landform       | island_group  | null  |

The country referent is a separate administrative level-0 anchor. Planning and
statistical classes have no geographic category (`null`). Cities retain their source
UUIDs. Administrative areas have separate identities, even when their geometry equals a
city. Kowloon city retains `17009785-57fd-4e5b-af86-2d27352e4718`; Kowloon area uses
`ss-bb5c7e0a-fd09-5416-8bb8-9593c90280fb`.

Lok Ma Chau Loop is a curated level-4 macrohood. Technology and science parks may be
hoods without a locality ancestor. Source classification assertions remain in
`properties`.

### ZH-HANT

SaanSeoi 區劃使用 `category`、`class` 及 `level`，與來源的 `subtype` 和 `class`
分開保存。`filter[class]` 選取標準類別；`filter[category]`
選取行政、聚落或社區區劃。層級本身不能決定類別。

| category       | class         | level |
| -------------- | ------------- | ----- |
| administrative | sar           | 0     |
| administrative | area          | 1     |
| administrative | district      | 2     |
| locality       | city          | 1     |
| locality       | town          | 3     |
| locality       | village       | 5     |
| locality       | hamlet        | 6     |
| hood           | macrohood     | 4     |
| hood           | neighbourhood | 5     |
| hood           | microhood     | 6     |
| landform       | major_island  | null  |
| landform       | minor_island  | null  |
| landform       | islet         | null  |
| landform       | island_group  | null  |

國家參照點是獨立的行政 level-0 記錄。規劃及統計類別的地理 category 為
`null`。城市保留來源 UUID；行政大區使用獨立識別碼，即使兩者幾何相同。落馬洲河套地區是經審核的 level-4
macrohood。科技園及科學園等 hood 不一定有聚落祖先。來源分類保留於 `properties`。

### ZH-HANS

SaanSeoi 区划使用 `category`、`class` 及 `level`，与来源的 `subtype` 和 `class`
分开保存。`filter[class]` 选取标准类别；`filter[category]`
选取行政、聚落或社区区划。层级本身不能决定类别。

| category       | class         | level |
| -------------- | ------------- | ----- |
| administrative | sar           | 0     |
| administrative | area          | 1     |
| administrative | district      | 2     |
| locality       | city          | 1     |
| locality       | town          | 3     |
| locality       | village       | 5     |
| locality       | hamlet        | 6     |
| hood           | macrohood     | 4     |
| hood           | neighbourhood | 5     |
| hood           | microhood     | 6     |
| landform       | major_island  | null  |
| landform       | minor_island  | null  |
| landform       | islet         | null  |
| landform       | island_group  | null  |

国家参照点是独立的行政 level-0 记录。规划及统计类别的地理 category 为
`null`。城市保留来源 UUID；行政大区使用独立标识码，即使两者几何相同。落马洲河套地区是经审核的 level-4
macrohood。科技园及科学园等 hood 不一定有聚落祖先。来源分类保留于 `properties`。

## Source release change counts

The persisted source-release change statistics compare retained publisher division
records with the preceding release across all retained source shards. They include
publisher records excluded from canonical divisions and exclude synthetic supplemental
divisions. Added and removed counts follow publisher record identity; changed counts
compare retained properties and geometry, ignoring observation timestamps and publisher
version labels. A different storage hash alone does not constitute a content change.

The Changes and Stats tabs read these saved counts. API release-set statistics describe
canonical output separately.
