# division type and level

Reviewed Overture classification patches are selected from
`fixtures/meta/patches/overture-division-classification.json`. They are independently
reviewed QA patches, not the result of a curation guard triggering. Each source ID,
admin level, class and subtype must match its fixture before the canonical replacement
is used. This includes the level-4 `macrohood` for Lok Ma Chau Loop and level-5
`neighbourhood` classifications for Sai Wan Ho, Kornhill, Shau Kei Wan, So Kon Po,
Braemar Hill and Tin Wan, and level-6 `microhood` classifications for Caroline Hill Kwun
Chung and Gun Club Hill. Mid-Levels West and Tai Hang Mid-Levels are promoted from
source microhoods to level-5 `neighbourhood` classifications. Sham Wan is demoted from
the source macrohood to a level-6 `microhood`; Brick Hill is demoted from the source
neighbourhood to a level-6 `microhood`. Tai Shue Wan is reclassified from the source
macrohood to a level-6 `hamlet` locality. Wan Chai South and Wan Chai North are promoted
from source microhoods to level-5 `neighbourhood` classifications. Tamar, Fort Street
Area, Lok Kang Po and Mount Butler are demoted to level-6 `microhood` classifications.
Culture Plaza, the microhood Happy Valley and the neighbourhood Chai Wan are excluded
from the reviewed hierarchy by guarded source assertions. Shouson Hill is demoted from
the source macrohood to a level-5 `neighbourhood`, as is Wong Nai Chung Gap. Aldrich Bay
already arrives as Overture `neighborhood` and normalises to the same canonical
classification without a patch. Both direct normalisation and hierarchy lookup execute
the same registered guarded rule. The [processing audit](../../processing-provenance.md)
retains the fixture and individual decision; bulk normalisation retains declarations and
counts.

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

Lan Kwai Fong (蘭桂坊) is a reviewed SaanSeoi supplemental level-6 microhood with
Central and Western District, Hong Kong Island and Hong Kong SAR ancestry. Its
representative point is retained while its boundary awaits geometry review.

Thirty Houses (卅間, also 三十間 and 30 Houses) is a reviewed SaanSeoi supplemental
level-6 microhood in Sheung Wan. Its representative point and Wikidata identity are
retained while its boundary awaits geometry review.

Tai Tam Gap (大潭峽) is a reviewed SaanSeoi supplemental level-5 neighbourhood. Its
mountain-pass point and Wikidata identity are retained with provisional Eastern
District, Hong Kong Island and Hong Kong SAR ancestry while its boundary awaits geometry
review.

Tai Tam Tau (大潭頭) is a reviewed SaanSeoi supplemental level-6 microhood beside Bluff
Head. Its mapped cape point and provisional Southern District, Hong Kong Island and Hong
Kong SAR ancestry are retained while its boundary awaits geometry review.

Cape Collinson (歌連臣角) is a reviewed SaanSeoi supplemental level-5 neighbourhood. Its
mapped locality point and provisional Eastern District, Hong Kong Island and Hong Kong
SAR ancestry are retained while its boundary awaits geometry review.

Sandy Bay Gap (沙灣坳) is a reviewed SaanSeoi supplemental level-6 microhood. Its mapped
mountain-pass point and provisional Central and Western District, Hong Kong Island and
Hong Kong SAR ancestry are retained while its boundary awaits geometry review.

Chung Hom Kok (舂坎角) and Ma Hang (馬坑) use guarded level-5 neighbourhood patches in
the Overture division import, retaining their publisher microhood classifications in
source provenance.

Bluff Head (黃麻角) uses a guarded level-5 neighbourhood patch in the Overture division
import, retaining its publisher microhood classification in source provenance.

Tai Long Wan (大浪灣) uses a guarded level-4 macrohood patch, while Cape D’Aguilar
(鶴咀) uses a guarded level-5 neighbourhood patch. Hok Tsui Tsuen (鶴咀村) uses its
existing Overture identity with a guarded level-6 hamlet classification and retains “Hok
Tsui Village” as an English alias. Publisher classifications and names remain in source
provenance.

Hok Tsui Lower Village (鶴咀村, source spelling 鶴咀下村) is a distinct reviewed
SaanSeoi supplemental level-6 hamlet. Its mapped locality point and provisional Southern
District, Hong Kong Island and Hong Kong SAR ancestry are retained while its boundary
awaits geometry review.

Tai Tam Tuk (大潭篤) uses a guarded level-5 neighbourhood patch in the Overture division
import, retaining its publisher microhood classification in source provenance. Tai Tam
Tuk Village (大潭篤村) remains a distinct level-6 hamlet.

Tai Hang Mid-Levels (大坑半山), Mid-Levels Central (中半山) and Happy Valley Mid-Levels
(跑馬地半山) use guarded level-5 neighbourhood patches in the Overture division import,
retaining their publisher microhood classifications in source provenance.

Un Chau (元洲) uses a guarded level-6 microhood patch in the Overture division import,
retaining its publisher neighbourhood classification in source provenance.

King's Park (京士柏) uses a guarded level-5 neighbourhood patch in the Overture division
import, retaining its publisher macrohood classification in source provenance.

Hung Hom Bay (紅磡灣) uses a guarded level-5 neighbourhood patch in the Overture
division import, retaining its publisher microhood classification in source provenance.

Kai Tak City Centre (啟德城中心) uses a guarded level-5 neighbourhood patch. Kai Tak
Runway Precinct (啟德跑道區) and Kai Tak South Apron (啟德南停機坪區) use reviewed
English names and remain level-6 microhoods. Their original Overture classifications and
names remain in source provenance. Kai Tak Sports Park (啟德體育園), Kai Tak Metro Park
(啟德都會公園) and Kai Tak Cruise Terminal (啟德郵輪碼頭) are reviewed supplemental
level-6 microhood markers under the Kai Tak macrohood; their boundaries await geometry
review. Kai Tak North (啟德北) is excluded from the reviewed hierarchy by a guarded
Overture division patch. The publisher source assertion remains retained.

Ma Tau Wai (馬頭圍), Ma Tau Kok (馬頭角) and Tai Wo Ping (大窩坪) use guarded level-5
neighbourhood patches in the Overture division import, retaining their publisher
macrohood classifications in source provenance. Kau Pui Lung (靠背壟) uses a guarded
level-6 microhood patch, retaining its publisher neighbourhood classification.

The level-6 Tsim Sha Tsui (尖沙咀) microhood is excluded as a duplicate of the retained
level-4 Tsim Sha Tsui macrohood. The publisher assertion remains in source storage.

Kau Pui Shek (靠背石) is excluded from current geographic coverage because it is a
historic locality. Its guarded publisher assertion remains in source storage.

Avenue of Comic Stars (香港漫畫星光大道), Sculpture Walk (雕塑廊), New Asia College Mall
(小百萬大道) and both source identities for The University Mall (百萬大道) are excluded
as visitor-attraction or campus-walkway POIs rather than geographic divisions. Publisher
assertions remain in source storage.

East Point (東角) is retained as English and Traditional Chinese alternate names of
Causeway Bay (銅鑼灣). The distinct East Point neighbourhood assertion is excluded from
canonical coverage. The level-6 Tai Hang (大坑) microhood is excluded as a duplicate of
the retained level-5 Tai Hang neighbourhood. Publisher assertions remain in source
storage.

Kowloon City (九龍城) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

Ma Tau Chung (馬頭涌) uses a guarded level-5 neighbourhood patch in the Overture
division import; its original macrohood subtype remains in source provenance.

B Block (前座) is excluded by a guarded Overture division patch because it represents a
building block. The publisher source assertion remains retained.

South Bay Garden (南灣花園) is excluded by a guarded Overture division patch because it
is a residential development rather than a geographic division. The publisher source
assertion remains retained.

Shek Pai Wan (石排灣) is excluded from the reviewed hierarchy by a guarded Overture
division patch. The publisher source assertion remains retained.

Level-6 squares, plazas, promenades and East Wing Forecourt are excluded by guarded
Overture division patches because they are named places rather than geographic
divisions. Matching uses the retained multilingual names so records labelled as 廣場 are
covered even when their English name uses terms such as courtyard, forum or
amphitheatre. Publisher assertions remain in source storage.

San Po Kong (新蒲崗) uses a guarded level-5 neighbourhood patch in the Overture division
import; its original macrohood subtype remains in source provenance.

East Tsim Sha Tsui (尖沙咀東) is a reviewed neighbourhood at level 5. The classification
patch preserves the Overture microhood assertion in source storage; the curated assembly
also applies it to an existing native projection.

The reviewed coverage excludes Kap Ma Kum Tong (蛤䗫擒塘 / 蛤蟆擒塘) through
`overture-division-exclusions.json`. North Rock is excluded through the supplemental
SaanSeoi island curation and shared reviewed-coverage exclusion fixture.

Overture macrohoods that represent whole islands or island groups are excluded from
canonical coverage by guarded source assertions: High Island (糧船灣), Po Toi Islands
(蒲台群島), Soko Islands (索罟群島), Lamma Island (南丫島), Stonecutters Island
(昂船洲), and the duplicate Lantau (大嶼山) macrohood. Their landform identities remain
available; separate named settlement divisions, including Cheung Chau and Ap Lei Chau,
are retained.

Wang Tau Hom (橫頭磡) uses a guarded level-5 neighbourhood patch in the Overture
division import, retaining its publisher macrohood classification in source provenance.

Chuk Yuen and Chuk Un, with the Traditional Chinese name 竹園, are reviewed aliases of
Wong Tai Sin (黃大仙). The duplicate Chuk Yuen marker is excluded from canonical
coverage through a guarded Overture source assertion.

Chuk Yuen United Village (竹園聯合村) is excluded from current canonical coverage
because the settlement has been demolished; its guarded Overture assertion remains in
source provenance.

Ngau Chi Wan Village (牛池灣村) is excluded from current canonical coverage through a
guarded Overture source assertion.

Nga Tsin Wai (衙前圍) is excluded from current canonical coverage through a guarded
Overture source assertion.

Tung Tau (東頭) is excluded from current canonical coverage through a guarded Overture
source assertion.

Fung Wong New Village (鳳凰新村) uses a guarded level-6 microhood patch in the Overture
division import, retaining its publisher neighbourhood classification in source
provenance.

Ping Shek (坪石) uses a guarded level-6 microhood patch in the Overture division import,
retaining its publisher macrohood classification in source provenance.

Kai Tak Grid Neighbourhood (啟德坊) uses a guarded level-6 microhood patch in the
Overture division import, retaining its publisher neighbourhood classification in source
provenance.

Sheung Yuen Leng (上元嶺) is a reviewed level-5 neighbourhood and Ha Yuen Leng (下元嶺)
is a reviewed level-6 microhood, both under Wong Tai Sin District. Their OSM locality
points are retained while their boundaries await local review.

Lai Chi Kok Hill (荔枝角山) is excluded from current canonical coverage through a
guarded Overture source assertion. Lai Wan (荔灣) remains a level-6 microhood, using its
reviewed English name while retaining the Overture source name in provenance.

Kowloon Bay Business Area (九龍灣商貿區) uses a guarded level-5 neighbourhood patch in
the Overture division import, retaining its publisher microhood classification in source
provenance.

Ngau Tau Kok Industrial Area (牛頭角工業區) is excluded from current canonical coverage
through a guarded Overture source assertion.

Lower Ngau Tau Kok (牛頭角下) and Upper Ngau Tau Kok (牛頭角上) are housing estates, not
geographic divisions, and are excluded from current canonical coverage through guarded
Overture source assertions.

Yue Man Square (裕民坊) and Lok Wah Shan (樂華山) are excluded from current canonical
coverage as a square and housing estate respectively, through guarded Overture source
assertions. Cha Liu Au (茶寮坳) is supplied as a reviewed level-4 macrohood addition
under Kwun Tong District. Ping Shan (平山) is supplied as a reviewed level-5
neighbourhood addition under the same district. Jordan Valley (佐敦谷) is a reviewed
level-5 neighbourhood, while Sai Tso Wan (晒草灣) and Cha Kwo Ling (茶果嶺) are reviewed
level-5 neighbourhoods. Crocodile Hill (鱷魚山) is a reviewed level-6 microhood. Tai Chi
Area (太極區) is excluded as a square. The eastern duplicate of Ma Wan Tsuen (馬環村) is
excluded while the western locality record remains canonical. Che Ting Tsuen (輋頂村) is
excluded because surrounding villages have subsumed it. Lei Yue Mun Villages (鯉魚門村)
is retained as an alias of Lei Yue Mun (鯉魚門), without its own canonical division.

Exclusion guards for Che Ting Tsuen, eastern Ma Wan Tsuen and Chuk Yuen United Village
require the publisher subtype `locality` and class `hamlet`. Ngau Chi Wan Village
requires subtype `locality` and class `village`. These expectations apply to the
retained Overture cohorts from September 2025 through August 2026.
