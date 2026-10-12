# Base index/detail complex producer contracts

These contracts concern the current base index/detail resource fields. Authoring modules
in `libs/db/src/fieldLineage*Preparation.ts`, `fieldLineagePlaceResolution.ts`,
`fieldLineageCompanionProducers.ts` and `fieldLineageDivisionDependencies.ts` describe
the current processors. The generated correspondence report measures field/source plan
closure. Closure requires explicit producers or typed external reads, rather than an
operation name alone. See [field lineage](field-lineage.md#artefacts-and-regeneration)
for the report workflow.

## Place

| Value                               | Producer and selection                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normalised Place                    | `normaliseOverturePlaceInternal`: require identity and Point coordinates; normalise publisher names, taxonomy, address text and scalar fields. `stagePlaces` checks address cardinality and excludes CN/MO address countries. |
| Localised values and reference name | `mergePlaceI18n` supplies publisher locale rows; the reference-name composer consumes those rows. The upload does not call the standalone translation resolver.                                                               |
| Access hint                         | `buildPlaceSql` writes `localised.accessHint ?? null`. The current normaliser supplies no hint. Address matching does not manufacture one.                                                                                    |
| Geometry                            | `stageEnrichedPlaces` takes `resolution.lng ?? place.lng` and `resolution.lat ?? place.lat` independently. `buildPlaceSql` materialises these coordinates. Publisher bbox remains a separate value.                           |
| Address2D                           | Select the accepted resolution identity from the official or supplementary address inventory according to its tier. Missing materialised targets and unresolved review are errors.                                            |
| Address snapshot                    | With no Address2D identity, store null. When predecessor Address2D identity and Address dependency hash match, preserve its snapshot reference; otherwise use the selected companion snapshot.                                |
| Address3D                           | Match one distinct explicit floor/flat pair against the selected Address and then its parent collection. Require exactly one matching unit and valid coverage. Supplementary Addresses do not enter this matcher.             |
| Division membership                 | Resolve effective coordinates against the exact selected Division/DivisionArea inventories, with the accepted Address as fallback. Retain both snapshot identities and association evidence.                                  |
| Sources                             | Merge publisher sources and Division association; preserve predecessor sources when base content is unchanged and predecessor sources are present.                                                                            |
| Base hash                           | Hash effective coordinates, publisher base attributes, Address dependency hash, Address2D/3D references, sorted unique Division identities and association evidence. Locale content has separate hashes.                      |
| First-seen month                    | Select the exact predecessor identity's string firstSeenMonth, otherwise the source-version month.                                                                                                                            |

The producer graphs implement these selection and transformation contracts:

- `resolution`: `prepareSupplementaryAddressesLocked` loads the active policy, default
  and explicit decisions, and the entry ledger. It constructs official bilingual Address
  definitions and point geometry from the selected prepared publication.
  `createSupplementaryAddressAnalyserInternal` checks exact observation decisions,
  replayable decisions, prior relationships and reproducible accepted entries before
  scoring new candidates. Identity, source release, address fingerprint, previous link
  and target availability are guards. Explicit coordinate overrides belong to those
  retained decisions. Automatic branches retain counts; specific decisions are
  instruction-linked curation candidates. Earlier reviewed decisions used during replay
  are retained separately.
- Official Address, Division, DivisionArea and Address3D inventories: declare their
  selected snapshot dependencies and prepared receipt scopes explicitly. They are
  canonical companion reads, not raw Overture columns or an unqualified latest snapshot.
- Supplementary Addresses: `buildSupplementaryAddressRows` groups accepted resolutions
  by addressId, sorts by placeId, rejects conflicting structured values or ALS bases,
  and requires any declared base in the selected official inventory. Copy Division
  fields from that base; geometry and parentAddressId are null. Retain each contributing
  Place occurrence and its acceptance mode. This consumes the resolution, not the
  enriched Place, so it must not create a dependency cycle.
- Predecessor content: `loadCurrentPlaceHistory` replays exact retained versions and
  validates serving-scope membership. The analyser's prior-link selection is different:
  it selects the latest lastSeenMonth/createdAt not after the incoming source month,
  excluding the incoming release. These selections have distinct contracts.
- Address dependency hashing and Division association: declare the exact companion
  projections and snapshot selection consumed by each hash and association operation.

## Division hierarchy

`effectiveClass` and `effectiveLevel` have distinct baseline, curation and patch
candidates, using the existing field override compiler. Patches retain individual
instruction references and win over curations, including a null replacement level.

`effectiveI18n` composes normalised names, conditional aliases, explicit names and
patches in precedence order. The latter is an inventory transform:
`buildDivisionHierarchyLookup` checks unique identities, applies exclusions and
effective classification/names, and adds missing Hong Kong area/city rows. Upload
preparation then merges resolved translations into lookup names. Its input cannot be
represented by one publisher row. Translation resolution uses parent context and
supplemental-row ordering; the final hierarchy uses that lookup while preserving
correlated ancestry paths.

## ALS Address

`normaliseHkgovAlsFeature` produces a baseline, not the final prepared row. Its official
English/Chinese JSON preserves publisher content while flattened components can undergo
premise-structure and Roman-numeral normalisation. Identity uses corrected
CSU/GeoAddress, route, premise components and coordinates. The canonical identifier key
is `ALS:CsuId`.

`prepareHkgovAlsAddressParquetInternal` in `hkgovAls.ts` then performs these producer
phases:

1. Apply reviewed backfills, school/house/street/estate corrections, promotions,
   consolidations, retentions and hierarchy rules. Some operations add or suppress rows.
2. Consolidate equivalent premises, resolve identity drift against retained history and
   decisions, assign canonical identities, and coalesce reviewed aliases. Require unique
   identities after each relevant fold.
3. Prepare Address3D collections, remove alias owners, apply estate/locality components,
   restore reviewed gaps, and establish nested premises.
4. Suppress unnamed premises, backfill coordinates, finish retentions, reapply hierarchy
   rules and resolve membership against the selected Division inventory.

Each output selects the surviving final row, including synthetic rows. Closing a
flattened component at its initial publisher property would miss later producers. Retain
the applicable instruction document and selector for each reviewed correction; retain
definitions/counts for conditional rules. The source-version guards, identity remapping
and row-level selection belong in the graph alongside value transformations.

## Verification boundary

The focused tests cover graph closure, immutable dependency selection, patch precedence,
retained instruction lookup, ALS mutation ordering and instruction-source
correspondence. Processor tests exercise Place normalisation, matching, supplementary
materialisation, content hashing, coordinate enrichment, Address3D matching and
predecessor handling, plus Division and ALS normalisation/curation behaviour.

The companion scopes delegate to the exact upstream snapshot and its lineage. They do
not claim to inline another release's entire producer graph. Missing bound dependencies
fail resolution without substituting current data. Structural completeness and test
results do not establish that a release has been published or that every historical
record has been replayed.

The ALS instruction-type catalogue is derived from direct curation/patch JSON imports in
the DPO modules. `fieldLineageProducer.test.ts` compares the checked-in catalogue with
those imports and the declared transform sequence with the executor. Changes to those
imports or processor order require updating the catalogue or specifications.

## Native HMA and Lands Department domains

The native domain fixtures include every base response attribute and relationship,
including selected snapshot identity and persisted version timestamps. The schema
coverage test checks these independently of the authored field count.

C&SD HMA correlates property and geometry parsers for HMA_21C by member ordinal,
requires valid HMA codes and derives stable canonical IDs. Building Groups remain
source-only. Division names retain publisher fallback rules; the dedicated normaliser
sets housing-market-area classification, nullable level and empty ancestry. Area
normalisation sets both government flags true, producing the canonical mixed type.

Lands Department joins GEO_PLACE_NAME and PLACE_NAME on GEO_NAME_ID, retains native HK80
points and projects canonical geometry. Settlement eligibility retains conditional rule
counts. Official labels precede aliases. Canonical Divisions have settlement
classification and level 5; publisher PLACE_TYPE does not override that taxonomy.

Both name paths include source-release translation resolution, exact retained
translation instructions, merge conditions and API locale fallback rules. Existing
publisher locales are preserved. Operational timestamps are read from the selected
persisted content version, with insert/conflict handling described separately from
publisher fields.
