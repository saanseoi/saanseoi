# division type and level

Reviewed Overture classification patches are selected from
`fixtures/meta/patches/overture-division-classification.json`. They are independently
reviewed QA patches, not the result of a curation guard triggering. Each source ID,
admin level, class and subtype must match its fixture before the canonical replacement
is used. This includes the level-4 `macrohood` for Lok Ma Chau Loop and level-5
`neighbourhood` classifications for Sai Wan Ho, Kornhill, Shau Kei Wan, So Kon Po,
Braemar Hill and Tin Wan. Aldrich Bay already arrives as Overture `neighborhood` and
normalises to the same canonical classification without a patch. Both direct
normalisation and hierarchy lookup execute the same registered guarded rule. The
[processing audit](../../processing-provenance.md) retains the fixture and individual
decision; bulk normalisation retains declarations and counts.

Source Divisions retain publisher attributes in `properties`, alongside source identity,
original `sourceGeometry`, `sources` and release history. Names, admin level, subtype,
class, Wikidata, hierarchies and cartography have no duplicate source columns; canonical
history/current tables own the normalised projection.

Supplemental division fixtures belong to canonical snapshots and do not create publisher
source rows. Source resolutions reference only actual retained publisher assertions,
following the [source record storage contract](../../source-records.md).

Canonical Division ingestion records its exact source-selection recipe and run under the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

Canonical Division ingestion seals comparison results and completion counts with its SQL
delivery plan. Local and remote retries reuse those outputs without rereading partially
updated source versions or repeating record normalisation. See the
[Divisions family](../../families/divisions.md) for delivery and publication boundaries.

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
`bb5c7e0a-fd09-5416-8bb8-9593c90280fb`.

Lok Ma Chau Loop is a reviewed level-4 macrohood. Technology and science parks may be
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

Ancestor hierarchy names retain source localisations when translation fixtures add
missing locales. An empty translation result preserves every source name used for Hong
Kong Area assignment and hierarchy validation.

Waterfall Bay (瀑布灣) is a reviewed SaanSeoi supplemental neighbourhood at level 5,
retained in the Hong Kong Overture division import with explicit SaanSeoi provenance.
Its provisional administrative ancestry is Southern District, Hong Kong Island and Hong
Kong SAR. Its point and boundary await geometry review.

Telegraph Bay (鋼綫灣) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original microhood subtype remains in source provenance.

Sandy Bay (沙灣) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original microhood subtype remains in source provenance.

West Kowloon (西九龍) uses a guarded level-4 macrohood patch in the Overture division
import; its original neighbourhood subtype remains in source provenance.

Prince Edward (太子) is a reviewed SaanSeoi supplemental neighbourhood at level 5,
retained in the Hong Kong Overture import with explicit SaanSeoi provenance. Its
provisional administrative ancestry is Yau Tsim Mong District, Kowloon and Hong Kong
SAR. Its point and boundary await geometry review.

Jordan (佐敦) is a reviewed SaanSeoi supplemental neighbourhood at level 5, retained in
the Hong Kong Overture import with explicit SaanSeoi provenance and Yau Tsim Mong
District, Kowloon and Hong Kong SAR ancestry. Its point and boundary await geometry
review.

Austin (柯士甸) is a reviewed SaanSeoi supplemental neighbourhood at level 5, retained
in the Hong Kong Overture import with explicit SaanSeoi provenance and Yau Tsim Mong
District, Kowloon and Hong Kong SAR ancestry. Its point and boundary await geometry
review.

Shek Kip Mei (石硤尾) uses a guarded level-5 neighbourhood patch, retaining its Overture
macrohood subtype in source provenance. Lei Cheng Uk (李鄭屋) is a reviewed SaanSeoi
supplemental level-5 neighbourhood with provisional Sham Shui Po District, Kowloon and
Hong Kong SAR ancestry. Its point and boundary await geometry review.

Kowloon City (九龍城) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

Ma Tau Chung (馬頭涌) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

B Block (前座) is excluded by a guarded Overture division patch because it represents a
building block. The publisher source assertion remains retained.

San Po Kong (新蒲崗) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original macrohood subtype remains in source provenance.

East Tsim Sha Tsui (尖沙咀東) is a reviewed neighbourhood at level 5. The classification
patch preserves the Overture microhood assertion in source storage; the curated assembly
also applies it to an existing native projection.

The reviewed coverage excludes Kap Ma Kum Tong (蛤䗫擒塘 / 蛤蟆擒塘) through
`overture-division-exclusions.json`. North Rock is excluded through the supplemental
SaanSeoi island curation and shared reviewed-coverage exclusion fixture.
