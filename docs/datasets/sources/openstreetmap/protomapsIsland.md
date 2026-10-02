# Protomaps island source evidence

The Protomaps source table omits `sourceLocator`; its release archive and
`sourceRecordId` identify the retained publisher feature.

Protomaps island inputs are retained independently of LandsD naming evidence and
SaanSeoi curation decisions. The source ledger `protomapsIslandFeatures` retains native
OSM identities, publisher tags, available locale-tagged names, source geometry and
acquisition locators. It also retains unnamed coastline land components. A source
feature is not a canonical island.

The September baseline uses the retained `refresh-hk-2026-09-01.osm.pbf` and the
coastline land file identified by the basemap release manifest. Preparation verifies the
coastline checksum and records the manifest and regional PBF hashes. The manifest also
identifies the archived upstream OSM PBF and its checksum.

## Prepare and ingest

Preparation reads the source inputs, never the combined island review fixture:

```sh
bun apps/harbour-dataops/src/cli.ts protomaps-islands:prepare --manifest .local/tiles/data/hk/hongkong-2026-09-01.json --source-version 2026-09-01.1 --out-dir .local/protomaps-islands/2026-09-01.1
bun apps/harbour-dataops/src/cli.ts protomaps-islands:ingest .local/protomaps-islands/2026-09-01.1/dr-hk-protomaps-island-2026-09-01.1.zip --target local
```

The deterministic ZIP contains the input manifest, source records and extraction
metadata. The native importer retains the archive and processing audit, writes the
source ledger, and publishes the ingredient release without creating a canonical
Division or DivisionArea snapshot. The full Divisions initialiser ingests the pinned
archive before publishing curated SaanSeoi releases that cite its geometry.

OSM island, islet and archipelago features retain native type/ID identities, including
point labels. Coastline components have deterministic geometry-content IDs because the
polygonised source has no native feature ID. Coastline components are candidates:
mainland fragments and duplicate representations are resolved by assembly, not silently
removed from the source.

`properties.tags` retains publisher tags. `properties.names` is keyed by the exact
locale suffix of each `name:*` tag. Untagged `name` remains a publisher tag; preparation
does not infer its language. Missing names remain missing. No LandsD label, curated name
or canonical division ID enters the source ledger.

The September `2026-09-01.1` extraction contains 764 OSM features (760 polygon features
and four points) and 907 coastline land components. 295 features carry explicit
locale-tagged names. These source counts are distinct from the curated island count.

## SaanSeoi assembly

`saanseoi-divisions:assemble` combines pinned source releases with curated identity,
name, hierarchy and geometry decisions. Full LandsD Place Names evidence supplies
terrain names as well as settlements. The assembly retains exact Protomaps geometry
references where polygon coordinates agree, and preserves reviewed drawing provenance
where they do not. It does not automatically assign a LandsD name to the nearest unnamed
polygon.

The assembled Division and DivisionArea archives enter ordinary SaanSeoi ingestion.

The retained `coastline-land` components also serve as the pinned land mask for SaanSeoi
SAR, Area and District geometry. Assembly intersects each Overture-derived territory
with this mask and records the contributing coastline component IDs and Protomaps
release on the land-clipped result. Named island polygons are not substituted for the
coastline mask, and disconnected components are retained.

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
`OSM:a31915135` archipelago MultiPolygon from `2026-09-01.1`. Their selected polygons
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
