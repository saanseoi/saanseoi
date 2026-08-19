# Census and Statistics Department division statistics

The following C&SD datasets are registered as Stats-family sources. They preserve
publisher releases with their published geography cohort and measures; they never write
an API-release-set statistic. Each source release does write structural release-owned
facts to `meta.stats` before publication.

| Dataset                                                          | CSDI identifier(s)                                                                   | Geography / intended use                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Census Subdivided Units by District Council District             | `censtatd_rcd_1635932488538_10765` (2016); `censtatd_rcd_1635933617052_68946` (2021) | Two 18-district census cohorts; subdivided-unit population                  |
| Permanent Living Quarters by Area and Type                       | `censtatd_rcd_1635933883228_46491`                                                   | Area-level housing stock                                                    |
| Permanent Living Quarters by District Council District           | `censtatd_rcd_1635934103275_66203`                                                   | District-level housing stock                                                |
| Population and Household Statistics by District Council District | `censtatd_rcd_1635934545173_69201`                                                   | Annual land-based, non-institutional population and socio-economic measures |
| District Land Area, Population and Density                       | `censtatd_rcd_1635934215448_25451`                                                   | District land area, population and density                                  |
| 2021 Census: Housing Market Areas and Building Groups            | `censtatd_rcd_1728978338390_76872`                                                   | 173 housing market areas and 3,322 building groups                          |
| 2021 Census: New Towns                                           | `censtatd_rcd_1695181913136_27614`                                                   | 13 new towns                                                                |
| 2021 Census: Major Housing Estates                               | `censtatd_rcd_1695182015782_79001`                                                   | 540 major housing estates                                                   |

The 2016 By-census and 2021 Census subdivided-unit district releases are retained as one
logical dataset with two one-off reference-year releases. They also publish the relevant
District Council boundaries. Their geometry profiles remain documented separately in
[`divisionArea.md`](./divisionArea.md): they are authoritative statistical-geography
variants for their respective census cohorts, not an evergreen administrative default.

The fixture records every observed archive slot whose native publisher package is
byte-identical to the 2016 or 2021 cohort. The updater suppresses only those exact no-op
object hashes while continuing to check the CSDI archive catalogue for a changed object.

For the two permanent-living-quarters datasets, the reviewed C&SD source release is
`2023-H2`. The native GML is the primary provenance for layer and statistical-period
semantics; CSDI's `2023-Q4` archive slot records only when that publisher package was
made available through the catalogue. The area layer has `PERIOD=2023`, while the
district layer explicitly retains `YEAR=2023` and `QUARTER=3`; neither value is replaced
with the archive slot.

District Land Area, Population and Density is an exception: its `Density_2022.gml` and
`Density_2024.gml` publisher packages differ, so they are retained as distinct `2022.0`
and `2024.0` source releases rather than archive no-ops.

## Remaining native statistics ingestion

The updater invokes one shared native CSDI statistics importer for the seven remaining
datasets. It accepts only its locally prepared publisher ZIP, verifies the updater
manifest SHA-256, expands only GML members within explicit entry-count and uncompressed-
size limits, requires each configured member, and checks its publisher layer, required
fields and feature count. Complete publisher properties, feature geometry and archive
key/hash are stored in `hkgovCenstatdStatistics`. The canonical path retains those
assertions, then writes one normalised `statsSeries` row for each publisher feature and
reference period, with its dataset, source release, `<layer>:<feature>` identity,
optional reviewed `divisionId`, and geography cohort. Dimensions attach to that series
once, rather than once per measure. `statsObservations` records only the series
reference, exact source property name and literal, decimal value or categorical code,
unit, precision (when known), and status. Measure, dimension, and localised-value
dictionaries remain normalised. The current shard contains the latest version of each
series and observation, composed across source compilations; the history shard retains
superseded values and definitions. A Population and Household compilation can therefore
carry annual observations for 2016–2025 without collapsing them to the compilation
release period.

Before canonical rows are replayed, every publisher measure requires a reviewed entry in
`fixtures/meta/curations/hkgov-censtatd-statistics/`. One manifest per dataset sets a
stable canonical `measureCode`, a reviewed `statisticKind`, and a separate reviewed
`aggregation`, while preserving the publisher `sourceField` in the canonical
observation. `statisticKind` identifies whether the measure is a count, quantity,
proportion, ratio, rate, density, or index; a ratio, rate, proportion, or density may
also identify a canonical `denominatorMeasureCode`. These fields are deliberately
separate from the source value representation and unit. The CLI reads the registered
CSDI Simplified Data Specification through CSDI's static host only to pre-fill a review
candidate. It displays compact metadata with the stable source-release portal URL rather
than the expiring specification link, followed by a `sourceField -> measureCode`
proposal with any compatible previously reviewed unit suggestion and all three locales
inline before acceptance. On rejection, the CSDI English name and description are
editable defaults. Changing either invokes Azure Translator for fresh Chinese defaults;
accepted machine values are stored with `isTranslationVerified=false`, while official
CSDI locale rows remain verified. `--yes` refuses every uncurated field. The importer
retains the exact publisher `Null Option` as the measure's nullable `sourceNullOption`.
It does not replace SaanSeoi's normalised observation status or automatically admit a
unit. When a reviewed code is not yet in `fixtures/meta/units`, the CLI prompts for the
unit's dimension, symbol, English name, and definition, then writes the unit registry
with Azure-generated Traditional and Simplified Chinese names and definitions before it
writes that measure's curation decision. Each completed measure decision is written
immediately to the curation manifest, so an interrupted review can be resumed or
hand-edited without repeating completed measures. The release page presents the
resulting measure dictionary in Stats, while Audit remains for processing decisions and
their evidence.

The curation prompt permits `total` only for counts and quantities. Other statistic
kinds can be direct (`none`) or use a mean, median, minimum, maximum, or percentile, but
a sum would not preserve a proportion, ratio, rate, density, or index.

For an age-group series with the same English description apart from the age group, a
unique prior decision pre-fills statistic kind, aggregation, and denominator measure.
The reviewer can still change every value. Explicit English terms including
`proportion`, `percentage`, and `ratio` determine the initial statistic kind before key-
and unit-based fallbacks.

The 2021 Census Housing Market Area (`HMA_21C`) and Building Group (`BG_21C`) layers
share the same 107 statistical fields. Their four Building Group-only fields are
identifiers, not statistics, so one reviewed measure dictionary applies to both layers.

## Measure naming policy

Use this policy whenever reviewing C&SD measure metadata. The CSDI field description is
evidence and an editable proposal, not the canonical display name.

- `measureCode` is a stable lower-camel-case identifier for the measure's semantic
  subject. Keep it concise and specific enough to distinguish the measure.
- The English `name` is a clear, accessible noun phrase that a reader can understand
  without knowing the metadata model. It identifies the population, category, or
  characteristic being reported.
- The English `description` defines the statistic in full: population scope, age range,
  categories, numerator or denominator where relevant, and any publisher-specific
  qualification. Translate that reviewed English meaning into the Chinese localisations.
- `statisticKind`, `aggregation`, `unitCode`, and `denominatorMeasureCode` are reviewed
  independently. Do not mechanically prefix a name with `Proportion of`,
  `Percentage distribution of`, `Total`, or similar representation language merely
  because it appears in the publisher's field description.
- Retain a statistical term in the name only when it is the established public identity
  of the measure, such as `Sex ratio`, `Population density`, or `Median age`.

For example, use `neverMarriedMalePopulationAged15AndOver` /
`Never-married male population aged 15 and over` for the CSDI field headed “Proportion
of never-married population aged 15 and over by sex - male”. Its description should
state the proportion and its scope; the curation fields record `proportion`, `none`, the
reviewed unit, and a denominator measure when one is canonical and available.

The importer never creates a parallel statistical-geography registry. Area/type maps its
three C&SD source codes to the Overture Hong Kong Island, Kowloon, and New Territories
identities, then publishes only its source-specific `divisionArea` geometry. HMA
continues to fan out into its own `division` and `divisionArea` records for the C&SD
Housing Market Area domain. Building Group points remain source history for a future
buildings projection.

The statistical `division` output is therefore limited to the reviewed 2021 HMA variant
(`hkgov-censtatd-hma`). Area/type is optional source-specific Geographic geometry
selected at the latest compatible cohort and linked to the Overture identity snapshot.
HMA is its domain's primary canonical division input, paired with the required native
`hkgov-censtatd-hma` geometry.

## Source-release statistics and geography audit

Every C&SD statistics source release stores only structural release facts: validated
publisher-feature count and source-layer distribution; canonical-observation count and
distributions by measure, reference period, status and numeric/categorical kind;
unique-measure, unit, statistic-kind, and aggregation distributions; distinct
reference-period count; and canonical dimension/value-definition counts. The processor
never sums, averages or compares publisher values with different units.
`records/count/count` remains the source-directory primary count.

Reviewed canonical geography resolution is an Audit concern rather than a release-stat
dimension. District releases record the approved C&SD-to-canonical district bridge as an
automatic processing action with authority, cohort, domain and source-field evidence. A
missing required district bridge member stops ingestion. Building-group and
major-housing-estate geometries are candidate domains, not failed district links.
Area/type and HMA use reviewed native source-code identities. C&SD new towns are an
existing-domain candidate for review against the Planning new-town domain, not an
assumed match.

If source geometry is suitable for delivery, it is reviewed and published through a
Divisions-domain workflow. Area/type and HMA are the approved exception: their shared
statistics importer executes that source-release fan-out explicitly.

When a comparable earlier source release exists, structural churn is limited to measure
and dimension-definition/coverage changes. It is a quality-control signal, not a claim
that publisher values changed incorrectly. Multi-year compilation periods and numeric
values are not compared as churn, and no baseline produces no churn rows.

## Canonical division links

The reviewed C&SD district-code bridges for the 2016 and 2021 cohorts each contain all
18 District Council districts and resolve through the 2022 HAD bridge to SaanSeoi's
canonical `divisionId`. The importer selects the 2016 bridge for the 2016
subdivided-units release, the 2021 bridge for the 2021 subdivided-units release, and the
2021 bridge for the density, district living-quarters, and Population and Household
datasets. A missing member of one of those bridges stops ingestion; it is never replaced
by a name or spatial-match guess.

Area/type observations resolve through the reviewed mapping to deterministic Overture
area identities; HMA observations use their deterministic C&SD source-code identities.
No name or spatial matching is used. Building-group, new-town, and housing-estate
observations remain without a `divisionId` until their respective geographies are
reviewed and released as Divisions domains, not by assigning an arbitrary district
parent.

## District land area, population and density ingestion

The native CSDI ZIP is the input. Each mapped archive contains one GML layer,
`Density_2022` or `Density_2024`, with 18 District Council district features in
EPSG:2326. The source shard retains C&SD's numeric `DC`, labels, publisher geometry and
complete property set without a canonical division value. The history processor resolves
each `DC` through the reviewed C&SD numeric bridge and the matching reviewed HAD
district code bridge. It writes the resulting canonical `divisionId` and SaanSeoi
`districtCode` only to the Division Statistics history observation.

The dataset fixture selects `map_censtatd_district_code_to_canonical_division` from the
versioned division merge ruleset. It is a versioned description of the deterministic
bridge operation, while any record-specific exception remains a release processing
action with its own evidence.

Each source assertion retains its publisher labels directly as `districtEn` and
`districtZhHant`; the source shard has no locale-keyed child table. Canonical/API
localisation is materialised only when a consumer needs it.

`MYPOPN_LAND` is expressed in thousands by the publisher and is multiplied by 1,000
during canonical ingestion, so `numericValue` is the actual number of people while
`sourceValue` remains the original literal. `valuePrecision` records the greatest
significant decimal count from the original value, and the normalisation is recorded as
one release Audit bulk action with its factor and source/target units. `PERIOD`, land
area (`LA`), and mid-year population density (`POPN_D`) are retained as statistic
assertions. The archive quarter is never a dataset version: the fixture's
`sourceVersion` creates `2022.0` and `2024.0`.

The current CSDI simplified data specification is recorded in the dataset fixture as
`schemaSpecificationURL`. The updater prepares and mirrors the publisher ZIP, then
passes that local prepared ZIP, its managed-asset key and its SHA-256 to the importer.
The importer verifies the local ZIP against that hash before parsing it; it never
reloads the ZIP from object storage. The source assertion retains both archive
references while the target-aware SQL processor uses its local target-database cache to
generate and publish the release for local, preview or production. That processor
materialises release facts and audited processing actions locally, then replays the
exact stored `DB_META` rows to preview or production before publication. It mirrors the
identifier bridges, C&SD density assertions, and division-statistics history required
for this dataset; its console progress identifies the cache and processing stage
currently in progress. Publish through `saanseoi update`, or invoke the importer with
the already-prepared archive:

```sh
bun run dataops -- hkgov-censtatd:district-land-area-population-density ./data/.../source.zip \
  --target preview --source-version 2022 --release-notes-url URL \
  --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

Before an entry advances beyond planned, inspect and record its downloadable artefacts
or API, schema, licence, update cadence, identifiers, publication date, reference
period, measure definition, and geography cohort. A derived rate must identify its
numerator and denominator series and must not replace a publisher-supplied measure.

## Release-note measure mappings

Each C&SD statistics release fixture declares its corresponding manifest under
`fixtures/meta/curations/hkgov-censtatd-statistics/`. The documentation publisher
expands `{{hkgovCenstatdMeasureTable:LOCALE}}` from that JSON at publish time, producing
the reviewed `sourceField | measureCode | name | description` table for each supported
locale. Release notes therefore present exactly the curated offering names and inclusion
criteria that the statistics processor publishes, without a second hand-maintained
Markdown copy.
