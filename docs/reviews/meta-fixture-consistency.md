# Metadata fixture consistency review

Reviewed the local working tree on 11 September 2026. This is a code and fixture audit,
not verification of deployed databases or publisher licence terms. No registry data or
published release was changed.

## Fixes completed

Statistics and Streets schema descriptors and the two Planning ruleset descriptors are
registered. Planning datasets select their matching domain rulesets, which reference
existing processing declarations. The Streets ruleset is a release descriptor with no
source operations; this does not add Streets processing-rule coverage.

Places major-version aliases and all four implemented Streets routes have endpoint
metadata, checked against the registered route definitions. All eight C&SD Statistics
datasets have English, Traditional Chinese and Simplified Chinese names/descriptions.
Unit locale keys use lowercase tags, and registry sync removes undeclared locale keys.

The findings below record the audit baseline. Semantic curation-path validation,
consolidating inline Places rule descriptions and connecting schema descriptors to
public contract definitions remain separate work.

## Findings

### 1. Release schema and ruleset identities are not a closed catalogue

`apiFields` references `sv-statistics-v1`, but `schemaVersions` contains only Address,
Division and Place descriptors. Planning mappings reference
`rs-division-hkgov-pland-pu-merge-v1` and `rs-division-hkgov-pland-new-town-merge-v1`,
neither of which exists in `rulesetVersions`. Streets has neither a schema descriptor
nor a merge ruleset fixture.

These do not currently prevent release creation: `ensureDraftReleaseSetForRelease` in
`libs/core/src/lib/db/metaRegistry.ts` constructs default schema/ruleset strings from
resource and domain names. The registry loader resolves datasets' selected rulesets, but
does not validate every release-set ruleset label against the same catalogue.
Consequently, release metadata and captured dataset processing rules can use different
notions of a ruleset identity. The version-management command discovers only files, so
missing descriptors cannot participate in that workflow.

Define whether a release-set ruleset is a composition policy or a processing ruleset.
Give those concepts distinct names if they differ; otherwise register and validate all
referenced identities. Schema descriptors should reference the authoritative public
contract or its hash. The existing three descriptors contain identifiers and notes, not
field definitions, and are not loaded by the main metadata registry loader.

Evidence: `libs/core/src/lib/db/metaRegistry.ts` around lines 4096–4107;
`libs/db/src/registry/meta.ts`; `apps/harbour-cli/src/lib/commands/version.ts`;
`fixtures/meta/schemaVersions/`; Planning and Statistics API-field fixtures.

### 2. Endpoint catalogue omits implemented routes

Places declares four `/places/v0.1` endpoints, but the route implementation also
registers four `/places/v0` aliases. Their operation IDs are `listPlacesV0`,
`getPlaceByIdV0`, `listPlacesByH3CellV0` and `searchPlacesV0`.

Streets has a current API version and composition, but no endpoint fixture. Its four
literal route operations cover detail, changelog, version list and version detail.
Address and Division endpoint fixtures already catalogue major and minor aliases. This
makes endpoint discovery inconsistent across families.

Generate endpoint metadata from registered route definitions, or test exact parity
against them. Avoid maintaining another independent list manually. The current audit
compared literal operation declarations and variant identifiers; it did not enumerate
all dynamically generated OpenAPI operations at runtime.

Evidence: `fixtures/meta/apiEndpoints/api-places-v0.1.json`;
`apps/atlas-api/src/routes/places/v0/places.ts`;
`apps/atlas-api/src/routes/streets/v0/streets.ts`.

### 3. Rule pins do not validate API-field input semantics

The integration does resolve processing-rule IDs against the definitions captured by
selected resource releases. It checks missing definitions and conflicting definitions,
and retains rule, ruleset and definition hashes. Changes to referenced processing-rule
content affect resolved ruleset hashes. Dataset operation selection is validated.

However, processing declarations use coarse string inputs/outputs such as
`publisher-places`, `als-curations` and `prepared-addresses`. API fields use a separate
origin/path model. No check proves that an API input path is an actual member consumed
by the referenced rule, or that the rule produces the declared API field.

The camelCase curation-context map validates context names and spelling, not payload
shape. For example, `alsCurations.identity` is accepted without a schema establishing an
`identity` member in the ALS curation context. Renaming the context did not resolve that
underlying uncertainty.

Define actual processing context shapes and bind API inputs to those definitions. Keep
API provenance as references; do not duplicate executable merge behaviour inside
API-field fixtures. Until that exists, report rule-pin validation and semantic mapping
validation separately.

Evidence: `libs/db/src/apiFieldInputs.ts`, `libs/db/src/apiFieldCurationContexts.ts`,
`libs/core/src/lib/db/metaRegistry.ts` around line 4849;
`fixtures/meta/processing-rules/address-curation.json` and `place-normalisation.json`.

### 4. Places ruleset retains two declaration formats

Six Places operations remain inline records with `sourceFieldPath`, `targetFieldPath`,
`condition`, explanatory `mappings` and localised descriptions. Three other operations
reference `processing-rules` fixtures. Address selection/review and localisation
behaviour is consequently described in more than one place.

Some inline paths are comma-separated strings or internal table paths rather than the
API-field input model. Separate audit outcome codes from processing-rule definitions:
several outcomes may reference one rule without repeating its policy description. The
existing repeated Division translation references can legitimately represent separate
audit outcomes; repetition of a reference is not itself duplicated behaviour.

Evidence: `fixtures/meta/rulesetVersions/rs-place-merge-v1.json`;
`libs/db/src/registry/meta.ts` function `resolveMergeRulesetDefinitions`.

### 5. Localisation metadata is inconsistent and incomplete

All 14 unit definitions use `zh-Hant`/`zh-Hans`, while the registry locale type and
other fixture families use `zh-hant`/`zh-hans`. Unit seeding writes the supplied casing
directly. Both spellings are valid language tags, but inconsistent database keys require
an explicit normalisation policy. This audit did not establish a current failing unit
translation endpoint.

All eight C&SD Statistics dataset fixtures provide only English metadata. The general
publisher and API-domain metadata has the three expected locales. Statistics dataset
names therefore have less translation coverage than the surrounding catalogue.

Normalise locale keys at the metadata boundary and validate them. Add reviewed Chinese
metadata rather than generating unreviewed translations of dataset names.

Evidence: `fixtures/meta/units/standard.json`, C&SD Statistics dataset fixtures,
`libs/db/src/registry/meta.ts` unit translation seeding.

## Coverage by fixture family

| Family           | Files | Result                                                                                                                                                                                                                         |
| ---------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| apiCompositions  |     5 | Current API families and domains align with mapping filenames. Multiple domains/variants are intentional. Associated release schema/ruleset labels need catalogue validation.                                                  |
| apiEndpoints     |     4 | Missing Places major aliases and the Streets family.                                                                                                                                                                           |
| apiVersions      |     5 | One current version per family; endpoint/schema coverage is uneven. No duplicate version code found. Publication dates were not checked against deployed history.                                                              |
| dataLicenses     |     4 | All dataset licence references resolve. Preserve external licence identifiers such as SPDX-style codes. Legal suitability was not independently researched.                                                                    |
| dataPublishers   |     9 | Dataset publisher and parent references resolve; no parent cycles. No structural redundancy found.                                                                                                                             |
| datasets         |    24 | Publisher/licence references and selected operation references resolve. Eight Statistics datasets lack Chinese metadata. Seven Streets datasets declare no merge rules; this is a coverage gap, not a missing referenced rule. |
| dataShards       |     4 | 16 shard entries; database IDs are unique and all appear in the API Wrangler configuration. Environment-specific IDs are intentional. No cloud-state verification performed.                                                   |
| divisionCodes    |     3 | 21 Geographic, 173 HMA and 13 New Town assignments; no duplicate codes within a domain. Curated domain scope is intentional; this does not prove every live entity is assigned a code.                                         |
| rulesetVersions  |     6 | Selected dataset operations resolve. Missing release-level identities and mixed declaration formats remain.                                                                                                                    |
| schemaVersions   |     3 | Lightweight descriptors, incomplete for active families, disconnected from main registry loading.                                                                                                                              |
| units            |     1 | 14 definitions; every unitCode found in curation JSON resolves. Locale casing differs.                                                                                                                                         |
| processing-rules |    23 | Implementation files and symbol names exist by static inspection; dependency resolution and API-field pin tests pass. Input/output semantic validation remains incomplete.                                                     |

## Redundancy and conventions

- Keep publisher identity, licence identity, dataset selection, API composition and
  API-field mapping separate: these describe different relationships.
- Keep processing definitions in `processing-rules`; let datasets select ruleset
  operations and let API fields reference captured rule identities.
- Preserve immutable release captures even though they repeat fixture-derived content.
  They are reproducibility evidence, not redundant live configuration.
- Do not blanket-convert stable identifiers to camelCase. Property paths and identifiers
  serve different purposes; external licence codes and existing rule IDs are examples.
- Dataset filenames do not consistently mirror their `code`, whereas newer API-field
  filenames now encode identity explicitly. This is a discoverability issue rather than
  a runtime lookup failure: the loader uses fixture content.
- Generic registry loading verifies hashes but largely casts parsed JSON to TypeScript
  types. Hash correctness does not validate unknown properties, missing translations or
  cross-family completeness. Add structural and reference validation at this boundary.

## Verification and recommended order

The focused registry, transform, API-field and public-schema suites passed: 61 tests
across five files. Additional read-only checks covered publisher ancestry, dataset
publisher/licence links, curation unit references, shard identifiers, Division code
uniqueness and processing implementation references. No deployed ingestion was run.

First close the release schema/ruleset identity gap and verify real curation input
shapes. Then derive/test endpoint catalogue parity and consolidate inline Places rule
descriptions. Finally normalise locale keys and complete reviewed dataset translations.
