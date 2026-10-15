# Places scalar Division verification

Implementation starts at `9cf36450d` in the isolated `places-scalar-divisions` worktree.
Both original checkouts and indexes remain outside this task's commit.

## Storage and public contract

Places persist the eleven supported nullable scalar IDs and a `divisionDefinitionSetId`.
Shared content-addressed definition sets map selected IDs to exact logical revision
pointers, levels and locale names. Equivalent definitions inherit pointers
independently; unrelated definitions do not participate in a Place's content hash. Empty
sets have a shared content address. New base versions retain sets in their HISTORY
shard; rollback checks content addresses and conflicting copies. Shared sets are
retained across serving-scope retirement and travel in sealed rollback payloads before
referencing rows.

Place preparation consumes `divisionFields`, `DivisionReferences` and the resolver's
`references`. Additional SAR, city and island-group ancestor output cannot enter scalar
storage, relationships or newly prepared Division search text. Older embedded evidence
remains immutable; public replay filters recorded IDs through the exact historical
Division classes. Mixed older/scalar history replays each subset through its own
retained contract. Each independently versioned locale validates against its original
base's exact definitions and Address identity. Fresh and incremental FTS use retained
`searchDependencyText`.

`filter[division]` selects supported scalar memberships before counts and pagination.
Code filters keep descendant resolution; `HKSAR` retains its region-wide contract.
Direct excluded-class IDs have no Place memberships. Included Divisions resolve their
retained logical revisions; equivalent selections deduplicate JSON:API identities.
Conflicting definitions for one included identity fail readiness rather than choosing an
arbitrary revision. No unresolved code-filter decision remains.

## Evidence

- The broad affected run passed 808 tests across 125 files, including all API tests,
  Places normalisation/preparation/materialisation/history/search, scalar membership,
  rollback reconstruction/delivery, reset ownership, cache profiles, cleanup and
  lineage.
- Added focused coverage checks all eleven scalar fields through CURRENT, HISTORY,
  public readers and cross-shard rollback; older locale evidence survives a newer base.
  It also covers mixed older/scalar content, address-free polygons, excluded ancestors,
  independent revision reuse and shared storage.
- Compiler delivery coverage proves a month-only reissue produces zero canonical,
  localisation or FTS mutations. A selected definition edit updates one Place and its
  English search document while preserving an unrelated Place and FTS rowids.
- Places rollback delivery includes shared definitions, resumes interruption and lost
  local acknowledgements, passes foreign-key checks and preserves unrelated scopes.
- API and CLI TypeScript checks, Biome, Markdown formatting and lineage compilation
  pass. The lineage compiler reports all 1,030 authored field-source plans complete.
  Final projection and mixed-history checks passed another 21 focused tests after the
  last changes.
- Fresh SQLite replay passed all 8 CURRENT and 11 HISTORY migrations with
  `integrity_check=ok`, no foreign-key violations, no excluded scalar columns and no
  `placesDivision` runtime table. Both migration-family lint commands pass.
- Generated CURRENT parent: `3de2d896-a2d5-4344-8e80-f331b05d53db`. Generated HISTORY
  parent: `a6341190-d708-43ac-813d-4820d41aef26`. SQL operations were inspected.
  Generation temporarily used the already-retired Division Statistics baseline; its
  unrelated source exports and retirement work are unchanged. No unrelated tables are
  recreated by these migrations.

The 140,000-row synthetic filter measurement used
`SELECT id FROM places WHERE scopeId=? AND scalarId=? ORDER BY id`, with 140 matching
rows per field. Before indexes, each query read its entire scope through the primary
index. All eleven measured filters use covering `(scopeId, scalarId, id)` indexes; API
query-plan tests check all eleven union branches. The union is nested in groups of five
for the runtime compound-select limit.

| Field             | Before (ms) | After (ms) |
| ----------------- | ----------: | ---------: |
| `countryId`       |      14.928 |      0.029 |
| `areaId`          |      13.953 |      0.028 |
| `districtId`      |      13.831 |      0.028 |
| `townId`          |      13.756 |      0.031 |
| `ruralAreaId`     |      13.934 |      0.032 |
| `macrohoodId`     |       14.24 |       0.03 |
| `neighbourhoodId` |      14.424 |      0.029 |
| `villageId`       |      14.111 |       0.03 |
| `microhoodId`     |       13.99 |      0.031 |
| `hamletId`        |      14.173 |       0.03 |
| `landformId`      |      14.363 |      0.031 |

These measurements justify the filter indexes; they do not claim production latency. No
populated database was migrated, reset or backfilled. No reingestion, deployment or
publication was performed. No unrelated baseline failures remain in the selected checks.
The migration generator still requires the existing independent schema-retirement
baseline to be accounted for when generating future migrations.

## Exact task paths

```text
apps/atlas-api/src/db/indexStrategy.test.ts
apps/atlas-api/src/db/places.ts
apps/atlas-api/src/db/placesHistory.test.ts
apps/atlas-api/src/db/placesHistory.ts
apps/atlas-api/src/routes/places/v0/places.contract.test.ts
apps/atlas-api/src/schema/places.ts
apps/atlas-api/src/services/places.ts
apps/atlas-app/src/routes/guides/create-a-map/createAMapLlmReferenceInstructions.ts
apps/harbour-cli/src/lib/api/apiReleaseSetStats.ts
apps/harbour-cli/src/lib/commands/reconstructRollback.ts
apps/harbour-cli/src/lib/commands/resetDivisions.ts
apps/harbour-cli/src/lib/commands/resetPlaces.test.ts
apps/harbour-cli/src/lib/commands/resetPlaces.ts
apps/harbour-cli/src/lib/commands/resetStats.test.ts
apps/harbour-cli/src/lib/commands/resetStats.ts
apps/harbour-cli/src/lib/commands/rollback/placeDivisionLinks.ts
apps/harbour-cli/src/lib/commands/rollback/places.test.ts
apps/harbour-cli/src/lib/commands/rollback/places.ts
apps/harbour-cli/src/lib/commands/rollback/projection.ts
apps/harbour-cli/src/lib/commands/rollbackDelivery.test.ts
apps/harbour-cli/src/lib/commands/rollbackVerification.ts
apps/harbour-cli/src/lib/dbCache/localDbCache.test.ts
apps/harbour-cli/src/lib/dbCache/localDbCacheProfiles.ts
apps/harbour-cli/src/lib/pipeline/places/placeCurrentWriteEconomy.test.ts
apps/harbour-cli/src/lib/pipeline/places/placeDependencyView.test.ts
apps/harbour-cli/src/lib/pipeline/places/placeDivisionDefinitions.test.ts
apps/harbour-cli/src/lib/pipeline/places/placeDivisionDefinitions.ts
apps/harbour-cli/src/lib/pipeline/places/placeHistory.test.ts
apps/harbour-cli/src/lib/pipeline/places/placeHistoryBaseline.ts
apps/harbour-cli/src/lib/pipeline/places/placeSearchDependencies.ts
apps/harbour-cli/src/lib/pipeline/places/placeSearchReplay.test.ts
apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUpload.test.ts
apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadImport.ts
apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadPreparation.ts
apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadRows.ts
apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadTypes.ts
apps/harbour-cli/src/lib/pipeline/places/resolvedPlaceDelivery.test.ts
apps/harbour-cli/src/lib/pipeline/places/resolvedPlaceDelivery.ts
apps/harbour-cli/src/lib/pipeline/places/resolvedPlaceValidation.ts
apps/harbour-workers/src/lib/services/snapshotCleanup.test.ts
apps/harbour-workers/src/lib/services/snapshotCleanup.ts
docs/datasets/families/places.md
docs/datasets/resourceType/division.md
docs/datasets/resourceType/place.md
docs/datasets/sources/overture/places.md
docs/guides/create-a-map-coverage.md
docs/reviews/places-scalar-division-verification.md
fixtures/meta/apiFields/api-places-v0.1@overture-v1.json
fixtures/meta/fieldLineage/implementation-evidence.json
libs/core/src/pipeline/rollback.test.ts
libs/core/src/pipeline/rollback.ts
libs/core/src/pipeline/services/places/place.ts
libs/db/migrations/current/20261015030749_thankful_rocket_racer/migration.sql
libs/db/migrations/current/20261015030749_thankful_rocket_racer/snapshot.json
libs/db/migrations/history/20261015030548_motionless_nocturne/migration.sql
libs/db/migrations/history/20261015030548_motionless_nocturne/snapshot.json
libs/db/scripts/sql/drop-all-db.sql
libs/db/scripts/sql/drop-current-db.sql
libs/db/scripts/sql/drop-history-db.sql
libs/db/src/fieldLineageCompanionProducers.ts
libs/db/src/fieldLineageComposition.ts
libs/db/src/fieldLineageCurrentRules.ts
libs/db/src/fieldLineagePlacePreparation.ts
libs/db/src/index.ts
libs/db/src/schema/current/migrationSchema.ts
libs/db/src/schema/current/places.ts
libs/db/src/schema/history/places.ts
libs/db/src/schema/shared.ts
```
