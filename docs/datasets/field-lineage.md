# API response field lineage

Field lineage defines lineage from the perspective of a selected API release set and
response contract. Dataset codes qualify input scopes; they do not own the response
definition. Review inventories are implementation plans, not published lineage fixtures
or record-level application evidence.

The implementation scope is the resource fields returned by the **base index and detail
endpoints**. Search, changes, geocoding, SOURCE, registry and operational endpoints are
deferred. Their entries remain in the broader inventory as reference material; they are
not prerequisites for completing this pass.

## Runtime implementation and correspondence

The shared runtime contract is `libs/db/src/fieldLineageTypes.ts`. The compiler retains
stage nodes, role-labelled inputs, shared processing documents and exact release
bindings. Publication pins the content-addressed definition and stores the exact binding
in `apiFieldProvenance.binding`. Concrete release and snapshot identities do not enter
the reusable graph hash. Multiple schema versions of one dataset use separate input
scopes. When a dataset supplies multiple resource types, field compilation selects the
mapped resource instead of treating sibling resources as alternative producers. Explicit
companion inputs, such as the Address and Division dependencies of Places, retain their
own resource scopes.

The release-page flow starts with the API response and follows value dependencies back
to the snapshot, field derivation and publisher sources. Transport wrappers and
record-admission checks remain in the retained graph but do not appear as value
transformations. Human operation contracts use a closed taxonomy: copy, calculate,
select, lookup, combine, normalise, assign and link. Titles, descriptions and
conditional choices describe the selected field; executor arguments and raw JSON are not
displayed. Geographic Division rules retain mapping tables, ordered choices and short
derivation sequences. Category and level use the ingestion taxonomy; cartography shares
the producer policy. Public projection and preparation show their own transformations,
with detailed geographic parent eligibility available on expansion. Explicit
field-effect declarations allow unrelated scalar corrections to be bypassed through
their unchanged input. Identity and inventory rewrites remain in the flow.

Source labels include resource type. Exact preprocessing releases are resolved only
through links anchored to the bound publisher release and pinned snapshot, with the
curated build-input rule and exact-reference selection mode. Each field declares which
of those sources contribute to its derivation. Missing pins or human explanations are
reported as unavailable; no current source release is substituted. This view describes
possible processing paths, not a record's executed branch.

`fieldLineageGraph.ts` validates graph closure, hashes, precedence and audit retention.
Automatic conditional nodes retain counts; specific decisions require audit owners,
record keys and output selectors. A `processing-audit` pointer cannot claim replayable
effects. Explicit unresolved operations prevent a partial trace being marked complete.

`fieldLineageSelectors.ts` implements retained mapping and closed-schema adapters,
including JSON Pointer validation and content-hash checks. `fieldLineageStatistics.ts`
expands `attributes.values.{field}` using the selected snapshot record's
`fieldDefinitionHashes` and `fieldSources`, matching the Statistics API's compound
field-definition lookup. It rejects a record outside the binding, missing definitions
and ambiguous source scopes. Expansion creates a reader view, not per-record audit
storage.

Release bindings also pin registered processing manifest hashes and byte lengths.
`readFieldLineageAuditContext` verifies the selected manifest and release identity, then
returns bulk counts, guards and retained curation/patch application references. It does
not infer field winners from counts. Decision pointers address the retained instruction;
no expanded per-record automatic trace or duplicate audit document is written. Missing
manifest bindings remain unavailable, and effect manifests require their own contract.

The operation fixtures in `fixtures/meta/fieldLineage/` specify geometry type decisions,
C&SD value conversion, reviewed SaanSeoi name import, Planning geometry preparation, and
Division/Statistics response projection. Projection rules distinguish profile visibility
from value derivation. Unsupported composition and emission rules remain explicitly
unresolved; they are not inferred from an ordinary field mapping. Correspondence tests
execute the actual geometry and name processors and the C&SD normaliser. Synthetic
authoring contexts test compilation; they are not publication or historical-execution
evidence. Serializer correspondence checks cover field visibility across compact,
default, map and full profiles. The coverage report is generated from actual compiler
output rather than a second set of operation-selection heuristics. Implementation
evidence records source-file hashes; regenerate and check it with
`bun libs/db/scripts/generate-field-lineage.ts` and the `--check` option.

Current-code coverage is measured separately from rule presence. The generated
`correspondence.json` reports compiled field/source plans and graph closure. The static
selector inventory is broader and is not counted as implemented fixtures. Companion
canonical reads delegate to exact upstream snapshot lineage; closure does not imply that
every companion value originates in the same publisher dataset.

Preparation specifications cover SaanSeoi archive field parsing, Overture transport
columns, current Statistics period and publisher-field selection profiles, HAD native
identifiers and Planning New Town identities and names. Statistics definitions retain
the field/measure/localisation fold, numeric classification across publisher rows and
the exact linked measure/field hashing contract. Planning Divisions use their dedicated
materialiser, including planning levels and retained source-release translations.
Geometry references declare their provider-specific native identifier inputs. Simplified
area variants contain a separate coverage-wide display transform with a 10-metre
tolerance and a bounding box recalculated from its result.

Statistics record graphs include native GML intake and collision-qualified feature
identities, retained administrative/New Town bridges, inferred versus reviewed
geography, exact-year versus wildcard area companions, series grouping and record
packing. A packed record keeps the first series in source-reference order as its
record-level source; `fieldSources` retains the contributing series for each value.
Duplicate fields and conflicting geography or Division associations are errors. Dynamic
value selection reads the packed record after these checks. Comparability uses the exact
dataset/field/hash definition selected by the API serializer.

Government area graphs include native/projected geometry handling, cohort filtering,
reviewed identity remapping and the complete normalised coverage consumed by the display
simplifier. Preparation-time and upload-time display transforms are separate operations.
Planning Unit graphs retain grouping keys, deterministic IDs, ancestor order, native
cell references and the source-version-specific union policy. Current New Town producers
supply all three name locales; Planning Unit producers supply no names, so neither
requires translation additions.

Place preparation graphs distinguish publisher normalisation, effective coordinates,
Address2D/3D selection, Division membership and predecessor/base-hash dependencies.
Resolution graphs include automatic candidates, replayable reviewed decisions,
supplementary Address grouping, exact companion inventories and predecessor selection.
Hierarchy classification and effective-name dependencies retain baseline, conditional,
curation and patch operations. ALS Address graphs follow the ordered inventory
mutations, identity consolidation, final surviving-row selection and component
corrections. The Address CSU identifier selector is
`attributes.identifiers.hkgov-dpo.csuId`. See the
[complex producer contracts](field-lineage-producers.md) for implementation paths and
verification boundaries.

Stage closure is a structural check; processor correspondence tests exercise the
associated transformations separately. This scope excludes search, changes, geocoding,
SOURCE and other supplementary response contracts.

`fieldLineageCurrentRules.ts` specifies field-specific transformations and provider
branches. Supplementary Addresses use accepted structured Place Address resolutions;
native C&SD Divisions use their JSON geometry and canonical taxonomy inputs. SOURCE
retention contracts preserve publisher assertions independently of repaired canonical
geometry. `fieldLineageLocales.ts` expands locale keys from the selected snapshot and
rejects records outside that binding.

Division graphs contain distinct baseline, automatic alias, specific curation and patch
candidates. Automatic alias predicates call the same locale normaliser as the processor
and retain counts. Explicit decisions reference shared immutable documents. The patch
candidate consumes the effective lower-layer group and declares only its affected
outputs. Correspondence tests cover every current classification patch, including
nullable levels. `readFieldLineageDecisionEvidence` matches original instruction content
through retained partition pointers; a matching identity alone is insufficient. Its
result remains an instruction application count, not a per-record field-effect log.

The META migration adds a nullable binding column so retained roots are preserved
without invented bindings. New publication writes a validated binding. Expanded v2
readers require it. Applying the migration or republishing data is a separate
operational action; generating migration files does not perform either action.

## Artefacts and regeneration

Runtime contracts, compilers and selector adapters live in
`libs/db/src/fieldLineage*.ts`. Published authoring fixtures live in
`fixtures/meta/fieldLineage/`.

Review tooling lives in `libs/db/scripts/field-lineage/`. Its `inputs/` directory
contains three authored review documents: transformation templates
(`implementation-templates.json`), supplementary response surfaces
(`surface-plans.json`) and symbolic examples (`examples.json`). These inputs are not
publication fixtures.

Generated reports go to ignored `.local/reports/field-lineage/`:

- `response-contracts.json`, `implementation-shapes.json` and
  `serializer-expressions.json` inventory static schemas and implementation syntax.
- `field-plans.json` assigns inventoried selectors to reviewed transformation families.
- `source-fixture-review.json` and `processing-policy-review.json` index declarations.
- `evidence-manifest.json` pins the checkout evidence by SHA-256.
- `correspondence.json` reports synthetic compiler coverage.
- `validation.json` records review coverage, references, example closure and freshness
  checks.

Run from the repository root:

```sh
bun run lineage:review
```

This generates and validates the static inventory and authored review inputs. Compiler
correspondence is a separate check:

```sh
bun libs/db/scripts/generate-field-lineage.ts --check --report
```

These commands do not publish releases or modify databases. If implementation evidence
needs refreshing after an intentional source change, regenerate it and review the
resulting fixture diff:

```sh
bun libs/db/scripts/generate-field-lineage.ts
bun libs/db/scripts/generate-field-lineage.ts --check
```

The fixture generator works independently of the review inventory. Its optional
`--report` flag writes the correspondence report; `--check --report` checks tracked
evidence before writing that local report.

The inventory uses TypeScript's static Zod output types without executing publishers.
Every discovered selector gets a plan marked `planned-not-generated`. Dynamic maps,
opaque values and recursive shapes remain explicit boundaries. Schema presence does not
prove response emission. Successful review validation establishes structural coverage
and evidence freshness, not historical processing or published record outcomes. Test
results and local conversion receipts must be assessed against their exact checkout and
retained backups; they are not permanent coverage guarantees.

## Root ownership and input scopes

The expanded release view has this shape:

```json
{
  "apiReleaseSetId": "<selected-release-set>",
  "definitionId": "<immutable-lineage-definition-hash>",
  "bindings": "<exact-snapshot-source-recipe-asset-and-audit-bindings>",
  "fields": [
    {
      "resourceType": "division",
      "apiField": "attributes.i18n.en.name",
      "provenance": {
        "composition": [],
        "assembly": [],
        "ingestion": [],
        "preparation": []
      }
    }
  ]
}
```

The arrays expand references to shared nodes. The stored definition describes the API
version and response schema, input scopes, rules and field dependencies. It contains no
release IDs or selected record values. `apiFieldProvenance` remains the root pin. An
expanded response resolves scope bindings from the selected release's exact snapshot
membership, recipe inputs, source/resource releases, raw/prepared assets and audits.

Dataset code and schema version belong to each SOURCE/prepared input scope. Canonical
schema versions belong to snapshot scopes; response schema/version belongs to the
definition's API contract. A dataset's schema context must be resolvable before its
field path can be interpreted. Binding roles must distinguish multiple providers,
variants, cohorts and companion snapshots; a resource type alone is insufficient.
Repeated input scopes may name the same dataset with different retained schema versions.
A conflict is incompatible versions within one scope, not merely two versions anywhere
in the response graph. The publication lookup currently builds one schema version per
dataset code; supporting a legitimate multi-version graph requires aligning that lookup
with scoped bindings rather than weakening input validation.

Related resources can come from companion release sets. Statistics registry responses
can span multiple releases selected by one catalogue revision. Division comparisons have
explicit before and after release roots. Operational responses have no dataset release
root and should use response-operation definitions rather than fictitious publisher
provenance.

## Stages describe real dependencies

| Stage       | Typical boundary                 | Required exceptions                                              |
| ----------- | -------------------------------- | ---------------------------------------------------------------- |
| preparation | raw → prepared                   | Acquisition CRS contracts, extracted PDFs, archive builds        |
| ingestion   | prepared/raw → SOURCE            | Preserve original publisher assertions alongside prepared values |
| assembly    | SOURCE/prepared → canonical      | Prepared geometry/components can be consumed directly            |
| composition | canonical/registry/request → API | Request computation, joins, projection and included resources    |

Composition includes response shaping in this field-facing view. Snapshot selection into
an API release remains an explicit selection dependency; it does not become a source
value. The existing processing task stage names need not be renamed to describe these
boundaries.

The stage arrays are views of a dependency graph, not a required linear chain. Assembly
can consume a prepared aggregate while SOURCE retains the original cells. A public
SOURCE response terminates at SOURCE. A response constant has no upstream dataset
stages. A SaanSeoi archive contains already reviewed names: the importer preserves them
and lineage links back to the archive-build definition rather than reapplying curations.

## Precedence, audit categories and execution scope

The universal resolution order is baseline, conditional rule, curation, patch. Later
layers override earlier layers for each declared output. Patches always win over
curations when applicable; fields do not declare a different layer order. Within one
layer and one output, lower priority wins; tied applicable candidates are an error. A
rule that fails a blocking guard is not treated as an absent candidate. Validation
applies to the selected effective output, so a valid override can replace an invalid
unused fallback without validating that fallback as the result.

`audit.category` is rules, curations, translations or patches, independently of
`audit.scope` (bulk or individual). Curation may establish an authored baseline.
Translation may fill an absence or override a value: its predicate and layer determine
which. Provider name normalisation must not inherit a classification patch's precedence
just because both happen inside the same function.

Scope is not precedence. Bulk normalisation can be the baseline. Per-field patches must
declare the output they affect and the audit owner, record keys and retained fixture
pointer needed to find their application. Current `processing-audit` evidence does not
necessarily include replayable before/after effects; only `processing-result` effects
may supply an effect pointer. An aggregate application count is not per-record proof.

Audit retention must not expand the lineage graph into one automatic-rule action per
record. Baseline and conditional code rules retain shared immutable definitions and
aggregate execution/branch counts. Counts describe the declared execution stage and
selection boundary: the existing branch counters count selected branches and changes,
not every true predicate or necessarily the final API winner. An intermediate
transformation subsequently overridden is not falsely reported as the effective final
value. No automatic affected-record lists or copied input/output values are required.

Bulk curations retain their selected reviewed document and aggregate counts. Targeted
curations, authored translations and patches retain their specific decision, record
context, definition and selected fixture-entry pointer. An applied curation remains
auditable if a patch subsequently replaces its output. A lower candidate skipped by
resolution is not described as applied; retained instructions and actual applications
remain distinct. Guard results and run/publication evidence remain required alongside
these categories. Translations follow their operation basis: automatic translation or
locale rules use counts, while individually reviewed translations retain decisions.

For a field explanation, the reader resolves retained rules and release-bound inputs to
determine conditional applicability, then links any specific curation/patch evidence.
That reconstructed applicability is labelled as derived, rather than presented as a
recorded individual automatic action. Missing historical inputs remain an explicit
evidence boundary. Audit storage does not gain per-record automatic-rule traces merely
to support the explanation.

Ordered operations are represented by separate intermediate nodes. Alias augmentation is
a merge/set operation, not a replacement of the primary name. Street lifecycle replay is
an ordered event fold with a retained ordering and event-kind policy, not a competition
among every notice for the highest priority. Field rules can select that fold as their
baseline and apply explicit targeted corrections around its outputs.

Division normalisation and ancestry lookup select classification patches ahead of
curated classifications and apply name patches after ordinary name curation. A patch
with a null level retains that null; it does not fall through to a curated level. Only
declared patch outputs gain this precedence. Alias additions merge with the remaining
aliases; a patch primary name replaces the curated primary name.

## Release-pinned dynamic selectors

`FieldPlan.dynamicSelectors` names the parameter, input scope and domain role for each
dynamic path segment. `ReleaseBinding.scopes[].selectorDomains` pins the exact domain
hash. A retained `SelectorDomain` records the allowed output keys, exact input paths and
pointers into the retained schema or mapping evidence. Those evidence hashes must also
be pinned in that release scope. The reusable graph has no current-mapping lookup and no
dataset owner at its root.

For Statistics, the selected mapping maps `MYPOPN_LAND` to `populationMidYear`.
Expansion produces `attributes.values.populationMidYear` and binds its input to
`MYPOPN_LAND`; the transformation node still supplies the conditional scaling and
suppression rules. A later mapping may map that publisher key differently without
changing an older release's interpretation. Locale and SOURCE selectors use the same
contract with domains derived from retained locale definitions and source schemas.
Nested maps declare multiple parameters and scoped domains; joins or dependent key sets
require their own retained relationship policy, rather than an unqualified Cartesian
expansion.

`libs/db/src/fieldLineageSelectors.ts` implements selector expansion. Mapping/schema
adapters validate evidence pointers and retain immutable domains. Open-ended source
properties remain explicit boundaries unless retained evidence supplies an enumerable
domain. A schema's `additionalProperties` is not a list of observed keys. Publication
and readers must not substitute current authored fixtures for absent release evidence.

## Capability assessment across response fields

| Surface/fields                         | Actual processing variety                                                                                                                                                             | Required representation                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Division class, level, category, codes | Publisher taxonomy, authored identities, curated classifications, taxonomy-derived level/category, reviewed code assignment                                                           | Provider/schema dispatch, policy lookups, baseline curation, field-specific overrides                                   |
| Division localised names               | Mixed publisher name shapes, locale inference/fallback, reviewed primary names, aliases, name rules, translations, compact/full projection                                            | Locale selector, ordered candidates, separate primary/alias outputs, upstream archive lineage, audit links              |
| Division hierarchy                     | Correlated ancestry branches, category projections, ancestor names, reviewed membership and containment, internal-field removal                                                       | Ordered paths, joins, correlated alternatives, explicit exclusions                                                      |
| Division points and coverage extents   | Label points, selected polygons, authored/group shapes, native areas/boundaries, cell repairs/unions, C&SD coverage simplification, recomputed extents                                | Spatial resolvers, intermediate nodes, many-to-one grouping, variant/source-version predicates, validation              |
| Geometry type/flags                    | Provider flag constants; both effective flags true → mixed; otherwise native land/maritime class; unsupported result errors                                                           | Inputs labelled value versus condition, provider predicates, effective-output validation                                |
| Division/geometry provenance           | Canonical identity, selected snapshot, source references, identifiers and processing timestamps                                                                                       | Generated values, exact registry bindings, evidence expansion, profile visibility                                       |
| Address localisations/components       | ALS reconstructed prepared components, reviewed corrections, building number ranges, block/phase parsing, formatted text; compact formatted-address-only output                       | Component-specific nodes, locale keys, prepared-input edges, reviewed guards                                            |
| Address structure/relationships        | Identity continuity, parent/granularity reconstruction, Division membership, selected snapshot dataset, Address3D coverage/owner state                                                | Joins, discriminated union, cardinality, identity/ownership policy, null/absence distinction                            |
| Address3D units and localisations      | Collection count, stable unit IDs, floor/unit references/types/portions, locale-and-unit keyed expressions                                                                            | Two-level mappings, unit selectors, ownership and count nodes                                                           |
| Place names/referenceName              | Publisher names/brands/freeform address, locale inference and reviewed translations, English/Traditional Chinese reference-name combination                                           | Per-field source mapping, translation evidence, composition-stage computation                                           |
| Place taxonomy/content                 | Versioned categories, alternate/hierarchical taxonomy, contact normalisation, lifecycle months/status, confidence; Point from lng/lat                                                 | Schema/vocabulary pins, profile predicates, generated geometry; confidence retained as a data field                     |
| Place Address links                    | Multilingual matching, qualification removal, reviewed identity decisions, supplementary Addresses and 3D membership                                                                  | Matching predicates/parameters, audit guards, companion snapshots, cardinality                                          |
| Statistics values                      | Dynamic source fields → curated field keys; exact decimal scaling; suppression/unavailability/literal codes; duplicate-field rejection                                                | Dynamic field selector, retained field-definition mapping, decimal/string operations, conditional branches, guards      |
| Statistics mappings                    | Retained field/measure definitions: units, dimensions, periodicity, kind, aggregation, denominator, comparability and locale descriptions                                             | Registry definition scopes and hashes; recorded translation origin rather than inferred verification                    |
| Statistics periods/geography           | Dataset-specific period parsing and geography dimensions; canonical identity bridge; selected related Division geometry                                                               | Dataset branches, temporal fields, joins and companion release bindings                                                 |
| Statistics geography/series endpoints  | Request selection and reshaping to geography/time-keyed values, uniqueness/comparability guards, direct district-code fallback where canonical code joins are incomplete              | Request-stage nodes, map key derivation, guarded fallback; do not assume endpoints sum or recompute ratios              |
| Streets                                | PDF extraction, reviewed baseline IDs, notices, intentions/no-ops, deletion/restoration, partial rename, text corrections, translations, lifecycle versions/history and evidence URLs | Ordered event fold, identity splits, partial effects, asset/notice joins; preserve the deferred SOURCE payload boundary |
| Geocoding                              | Text scores, distances, ranking, spatial membership, alternative correlated paths, ambiguity and coverage; request-profile projection and included resource deduplication             | Request/spatial predicates, multiple releases, ordering, graph traversal and reuse of included-resource lineage         |
| Division search                        | Selected inventory/name index, query matching and locale-specific names/taxonomy                                                                                                      | Index-build policy plus request-time selection and match nodes                                                          |
| Division changes                       | Two release definitions, canonicalised hashes, before/after paths, geometry membership and transitive descendant impact                                                               | Two release roots, set versus sequence semantics, hashing and graph traversal                                           |
| Identity bridge                        | Canonical identifiers projected to namespace mappings; Planning subunits use composite TPU-subunit identity                                                                           | Many-to-many mapping, namespace policy, release-scoped filters                                                          |
| SOURCE records/schema/streams          | Publisher assertions, schema/locator projection, optional source geometry, dataset-specific exclusions; JSON and NDJSON                                                               | SOURCE terminal, wildcard selectors expanded from pinned source schemas, explicit projection omissions                  |
| Registry/inventories                   | META tables and retained definitions, cross-release catalogues and inventory/geometry variant defaults; loose schemas                                                                 | Registry scopes, implementation return-shape inventory and exact selected definition bindings                           |
| Documents/errors/links                 | Protocol constants, request URLs/selectors, pagination counts/cursors, catalogue selection, publication readiness and validation                                                      | Request/registry/runtime inputs; no invented raw provenance for these fields                                            |
| Assets/styles/docs/health              | Stored bytes/style JSON, generated OpenAPI/docs, runtime probes, external subscription results                                                                                        | Asset/operation contracts outside dataset lineage; field selectors only where structured response fields exist          |

`field-plans.json` assigns each inventoried selector to these reviewed implementation
families, including nested properties, relationship linkage and dynamic map boundaries.
`implementation-templates.json` supplies code anchors and stage-specific implementation
instructions. A union's included resource must use its own discriminator and lineage;
the parent endpoint's family does not own its child values.

## Illustrative example contracts

The retained statistics metadata maps `MYPOPN_LAND` to `populationMidYear`, not
`mid_year_population`. Numeric values are decimal strings, not floating point numbers;
non-numeric publisher sentinels have their own output branches.

Planning repair applicability is the implemented validity predicate, not a hard-coded
list of six cells inferred from a comment. The 2021 aggregate strategy is also a
retained source-version condition. Mirrored SHP acquisition and publisher GeoJSON
acquisition have different CRS contracts and must select the correct acquisition branch.

The relevant Planning dataset fixture is resolved from the selected release's metadata;
example scope labels do not invent a provider dataset code. SOURCE preserves publisher
evidence while assembly can consume a prepared aggregate. A schema must permit both
without relabelling prepared content as original SOURCE evidence.

## Fixture generation contract

1. Select the API response version/schema and exact release/catalogue context. Expand
   the mounted operation's output shapes, request profiles, locale selectors and union
   resource discriminators. Distinguish schema declarations from actual serializer
   outputs; resolve differences explicitly.
2. Instantiate each field plan using the reviewed template. Expand SOURCE wildcards
   through the pinned source schema and Statistics mappings through retained field
   definitions. Registry endpoints need their reader-derived fields too.
3. Resolve scoped inputs from captured ingestion policies, snapshot recipes, composition
   membership, preparation manifests and upstream archive-build lineage. Missing
   historical preparation evidence stays `unknown-upstream`; current code is not proof
   of a historical recipe.
4. Retain shared nodes once. Their immutable definitions include conditions, candidate
   order, transformation parameters, output selectors, joins, grouping, absent/error
   policies and schema context. Resolver references identify the retained processing
   document, operation, rule and branch. A code path or broad normaliser ID alone is
   insufficient to explain a field.
5. Enforce the universal layer order and verify affected executor paths agree. Retain
   guards and distinguish invalid input from no applicable candidate. Compute field
   dependency closure across all stages and upstream graphs.
6. Bind patch/curation evidence through the registered audit root and selected fixture
   entry, using record identity and output selector. Resolve guards and outcomes; do not
   infer a per-record application from bulk counts or silently reapply an instruction.
7. Hash the reusable definition; pin it at the API release root. Expand it for readers
   using exact release bindings. Retained definitions do not duplicate record values,
   audit actions or global per-record selection traces.

Generation readiness requires full selector coverage, valid graph edges and schemas,
resolvable immutable references, explicit dynamic-map policies, deterministic ordering,
and executable predicates that agree with the real executor. Representative acceptance
checks must cover baseline, conditional override, curated baseline/override, audited
patch, translation, absent/null/empty, conflict/guard failure, profile/locale
visibility, source-schema changes, historical replay, joins, unions, sequential
transforms, multi-release requests and SOURCE-only responses. Existing audit gates
remain mandatory.

These artefacts explain rules; they do not promise replay of historical code. Exact
record explanations additionally need the pinned input context and recorded exception
evidence. Resolver-backed branches must retain a readable field-specific specification
and the same immutable parameters/predicate used by execution, rather than claiming that
a generic resolver name provides the answer.

## Immutable R2 storage

`fieldLineageDefinitions` is a small catalogue: `id`, `schemaVersion`, `manifestHash`
and `manifestByteLength`. The logical definition ID hashes the complete reconstructed
graph; the manifest hash identifies its physical storage. Release pins and exact
bindings remain in `apiFieldProvenance`.

The manifest and bounded JSON collection chunks use the existing
`provenance/v1/sha256/<digest>.json` object keys and retention helpers. Collections
include nodes, fields, scopes and retained rule documents. Chunk boundaries preserve
array order and object keys. Shared chunks can serve several definitions. Each object
stays within the provenance store's per-object limit; an oversized individual member is
rejected before a release can be pinned.

Publication retains and verifies all chunks and the manifest before the atomic DB
publication. Reads check object lengths, hashes, collection identities and the
reconstructed definition hash. A missing or corrupt object fails resolution. A failed
publication can leave unreferenced immutable objects; it cannot create a successful
release pin to an unretained graph. Deferred publication does not retain a graph.

Registry field listings return catalogue metadata and release bindings. Field details
load the graph from R2. Graph traversal and field selection take place in TypeScript;
SQL does not filter the JSON body. The existing bounded provenance reader caches shared
objects during reconstruction.

Local R2 and its META catalogue must be retained and restored together.

## Field provenance presentation

The provenance view starts at the API response and follows value dependencies backwards
through snapshot fields to pinned source inputs. Resolution groups appear as conditional
branches in precedence order. Shared dependencies are referenced once. Selection inputs,
join keys, guards and retained evidence remain supporting detail rather than extra value
steps. The view describes possible processing paths; it does not identify an executed
branch for an individual response record.

Operation documents can retain a versioned `explanation` using a typed derivation
vocabulary: field reads, literals, JSON encoding/decoding, bounding-box calculation,
geometry collections, ordered conditions and missing-result fallbacks. The graph
validator checks this vocabulary. The UI renders its structure without interpreting
expression strings. Implementation anchors and source hashes remain attached to the
retained rule.

Curated Division dependencies project the consumed archive fields through the record
envelope. Record-wide validation is supporting evidence. Division has no bbox;
DivisionArea and DivisionBoundary bounds derive from their selected geometry.
Preprocessing source cards show retained record-selection rules alongside the exact
release pins. They describe possible selections, not a historical execution.

Geometry lineage uses declarative tables for coverage type, flags, bounding coordinates
and bordering Division identities. Boundary identities retain the publisher's pair
order. Government area preparation distinguishes HAD, C&SD and New Town geometry; the
`:simplified` variant explains coverage-wide simplification at 10 metres and bounds
recalculation. SaanSeoi preparation distinguishes territorial unions, coastline land
intersections, selected island polygons, reviewed replacements and whole-island group
unions. Relevant Overture and Protomaps area release pins accompany these recipes. These
are possible construction paths, not per-record execution traces.

Cross-field value dependencies use navigable references to the same resource and
variant. A bbox trace explains bounds and source-record selection; its geometry
calculation belongs to the linked geometry field. Category and display settings
similarly link to class. Retained `fieldDependencies` declare public-field dependencies
where a producer consumes a coverage rather than a single field node. Unavailable or
ambiguous targets retain their full graph traversal.

Conditional diagrams give each fallback its own condition and result. Source cards
retain structured selection tables separately from the value calculation.

Division class lineage presents one first-match table: SaanSeoi correction, explicit
class assignment, selected individual-island size, then publisher subtype/class rules.
Island groups use explicit class assignments. Publisher mapping branches are shared by
the processor, inventory and audit. Level does not determine class; an unresolved class
blocks ingestion. Hierarchy expectations validate classification without overwriting it.
Source selection distinguishes independent cases, ordered actions and conditions that
must all match. Hierarchy lineage links to the assembled SaanSeoi DivisionArea geometry,
including authored polygons, with representative points used only when no area exists.
