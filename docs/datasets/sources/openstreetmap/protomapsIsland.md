# Protomaps island source evidence

The Protomaps source table omits `sourceLocator`; its release archive and
`sourceRecordId` identify the retained publisher feature.

Protomaps island inputs are retained independently of LandsD naming evidence and
SaanSeoi curation decisions. The source ledger `protomapsIslandFeatures` retains native
OSM identities, publisher tags, available locale-tagged names, source geometry and
acquisition locators. Full coastline polygons, including mainland, are retained once as
shared source evidence. Island membership references detached polygon components; it
does not copy their geometry. A source feature is not a canonical island.

The September baseline uses the retained `refresh-hk-2026-09-01.osm.pbf` and the
coastline land file identified by the basemap release manifest. Preparation verifies the
coastline and regional land-border checksums and records the manifest and regional PBF
hashes. The manifest also identifies the archived upstream OSM PBF and its checksum.

## Prepare and ingest

Preparation reads the source inputs, never the combined island review fixture:

```sh
bun apps/harbour-dataops/src/cli.ts protomaps-islands:prepare --manifest .local/tiles/data/hk/hongkong-2026-09-01.json --source-version 2026-09-01.3 --out-dir .local/protomaps-islands/2026-09-01.3
bun apps/harbour-dataops/src/cli.ts protomaps-islands:ingest .local/protomaps-islands/2026-09-01.3/dr-hk-protomaps-island-2026-09-01.3.zip --target local
```

The deterministic ZIP uses `schemaVersion: 2`. It contains the input manifest, shared
`records.json`, extraction metadata and `island-selections.json`. The selection file
contains source record IDs and, for coastline features, ordered component indexes. It
contains no geometry. Each complete coastline polygon appears once in the shared
records; native OSM features remain distinct publisher assertions. Publish each archive
as a distinct immutable extraction revision. The native importer retains the archive and
processing audit, writes the source ledger, and publishes the ingredient release without
creating a canonical Division or DivisionArea snapshot. The full Divisions initialiser
ingests the pinned archive before publishing curated SaanSeoi releases that cite its
geometry.

OSM island, islet and archipelago features retain native type/ID identities, including
point labels. Coastline components have deterministic geometry-content IDs because the
polygonised source has no native feature ID. Island membership excludes polygon
components that share a line segment with the regional land border. A point contact
alone does not exclude an island. Mixed MultiPolygons retain their complete source
geometry; island references select only detached components. Resolution preserves every
selected coordinate and hole. Source IDs identify the complete original geometry.
Missing or invalid land-border evidence prevents preparation.

`properties.tags` retains publisher tags. `properties.names` is keyed by the exact
locale suffix of each `name:*` tag. Untagged `name` remains a publisher tag; preparation
does not infer its language. Missing names remain missing. No LandsD label, curated name
or canonical division ID enters the source ledger.

The September `2026-09-01.3` extraction contains 764 OSM features (760 polygon features
and four points) and 907 full coastline records, stored once. Island membership selects
all 764 OSM features and 906 detached coastline records; the mainland has no island
membership. 295 OSM features carry explicit locale-tagged names. These source counts are
distinct from the curated island count.

## SaanSeoi assembly

`saanseoi-divisions:assemble` combines pinned source releases with curated identity,
name, hierarchy and geometry decisions. Full LandsD Place Names evidence supplies
terrain names as well as settlements. The assembly retains exact Protomaps geometry
references where polygon coordinates agree, and preserves reviewed drawing provenance
where they do not. It does not automatically assign a LandsD name to the nearest unnamed
polygon.

The assembled Division and DivisionArea archives enter ordinary SaanSeoi ingestion.

SaanSeoi SAR, Area and District geometry reads the full coastline land-mask view from
the same pinned archive, including mainland. Island review and assembly read the
island-selection view. Both resolve the same retained source records. Administrative
assembly intersects each Overture-derived territory with the full mask and records its
contributing coastline component IDs and release. Named island polygons are not
substituted for the full coastline mask. Neither input view publishes a canonical API
snapshot; only the assembled SaanSeoi outputs enter API composition.

Protomaps island releases declare only the `divisionArea` resource. This resource
retains native geometry and naming evidence, including point labels; it does not publish
a canonical Division inventory. Parent source publication requires that resource to be
published. SaanSeoi assembly produces the resolved divisions.

The release archive is resolved through META. Native OSM IDs and coastline hashes are
already `sourceRecordId`, so these rows need no acquisition locator. SOURCE retention is
independent of the curated output count: raw unnamed features and land components are
valid source evidence even when they produce no named division.

### Yim Tin Tsai geometry selection

The Sai Kung island `LANDSD:PLACE_NAME:2820` uses the named basemap polygon whose
coordinate centre lies within 500 metres of its LandsD point. Exactly one candidate must
satisfy this constraint. The same-named island near Tai Po is a separate geometry
candidate and must not supply this island outline. The constraint is stored in
`division-geometry-selections.json` and applies to assembly and the local review map.

### Detached island coverage

Waglan Island selects the complete named `OSM:a25867861` MultiPolygon, including its
southern component and detached rocks. The South Ninepin islets Tai Pai, Yi Pai and Sam
Pai retain separate identities backed by `OSM:a217838696`, `OSM:a217838700` and
`OSM:a217838710`. They are distinct from the same-named LandsD islands farther north. An
unnamed source islet east of South Ninepin remains outside the named inventory.

In the local editor, reviewed island outlines use saved geometry in preference to source
geometry and remain visible independently of the Landforms level toggle. Source
reference areas controls the reference layer; it does not control drawings.

### Island-group peripheral membership

Group membership uses the fixed envelope of `island-groups.json` seed polygons, with
whole-island containment and explicit membership overrides. Ninepin seeds include Sai
Chau Mei, Tai Chau Mei, Hok Tsai Pai, Hok Tsai Chau, Fo Siu Pai and Wang Pai alongside
the three main islands. Soko seeds include Ma Chau, Cheung Muk Tau, Tau Lo Chau, Ko Pai,
Siu Ko Pai and Tsim Shek Pai alongside Tai A Chau and Siu A Chau. The pinned review
inputs derive 22 Ninepin and 14 Soko member records; these are identity counts, not
independent physical-island counts.

Ung Kong retains Basalt Island, Bluff Island and Wang Chau as its seed envelope.
Explicit members Kong Tau Pai
(`LANDSD:PLACE_NAME:732`), 四排尾 (`BASEMAP:ISLAND:20237d751b5fe16d`) and Kam Chung Ngam
(`BASEMAP:ISLAND:ad777e9a7bc9fd4c`) are supported by the retained Protomaps
`OSM:a31915135` archipelago MultiPolygon from `2026-09-01.3`. Their selected polygons
have more than 80% area overlap with that source geometry. Explicit membership keeps
nearby Town Island outside the group without enlarging the automatic envelope. The
resulting Ung Kong union has 14 member records. No source names, reviewed identities or
member polygons are merged or modified by these membership rules.

Research references, checked 30 September 2026:

- [Hong Kong UNESCO Global Geopark: Sai Kung boat tour](https://www.geopark.gov.hk/en/discover/attractions/sai-kung-boat-tour)
  identifies Ung Kong and Ninepin as separate geosite groups; its tourism description is
  not treated as an exhaustive list of small-islet membership.
- [Ninepin Group island list](https://en.wikipedia.org/wiki/Ninepin_Group) corroborates
  peripheral Sai Chau Mei, Hok Tsai Pai and Tai Chau Mei. Its aggregate island count is
  not a target for inventing unnamed identities.
- [Soko Islands island list](https://en.wikipedia.org/wiki/Soko_Islands) corroborates Ma
  Chau, Cheung Muk Tau, Ko Pai and Tau Lo Chau. Source polygons and retained identity
  records determine the geometry, rather than names alone.

## Processing policy ownership

The local review editor clips administrative territories against the full `land-mask`
view of its pinned Protomaps archive, including mainland coastline polygons. Its island
inventory uses the separate island-selection view of that same archive.

Protomaps ingestion declares OSM island/islet extraction, coastline geometry selection
and native SOURCE import into `protomapsIslandFeatures`. These rules preserve source
assertions and geometry without materialising canonical Divisions. Reviewed island
selection and SaanSeoi Division/DivisionArea materialisation are captured by SaanSeoi
snapshot recipes, including the registered curated assembler.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Archive ownership

Original publisher inputs use `releaseSourceArchive` assets owned by their source
release. Resource-specific source exports use Parquet `resourceSourceArchive` assets
owned by their resource release. Each archive has a downloadable manifest recording its
original filename and packaging.

## Release inspection and verification

Each published Protomaps resource release registers its SOURCE shard in META. The public
source catalogue serves its retained schema, samples and record comparisons from
`protomapsIslandFeatures`, without requiring a canonical API snapshot. Release
statistics count retained source records and compare their contents and geometry with
the preceding published release. The first retained release is the comparison baseline.
These counts do not represent distinct islands: OSM features and coastline records can
describe the same land, and the coastline includes mainland.

Native import SQL checks that each accepted record's expected version is present and
valid for the release after writing it. The check executes on both the planning cache
and the target source shard before a successful audit is retained and the release is
published. A missing or expired version fails ingestion. Existing audit entries named
`native-source-row-count` record successful SQL delivery only; they do not represent
this independent verification.

Release-note fixtures live under `fixtures/meta/releases/ds-hk-protomaps-island/`.
