# Places scalar Division conversion handoff

## Objective and authority

Implement the user's requested conversion from `placesDivision` membership rows to
scalar Division IDs on Places, matching Address2D's supported columns. The user
explicitly does not require Place references to SARs, cities or island groups. Do not
add `sarId`, `cityId` or `islandGroupId` columns. Preserve supported geographic
filtering, exact historical dependency evidence, independent localisation history and
incremental search.

This handoff authorises implementation and relevant verification. It does not authorise
resetting populated databases, reingestion, deployment, remote publication or committing
other threads' changes.

## Starting checkout and parallel work

Start from commit `9cf36450d` on branch `places-consistency`. Its checkout is
`/tmp/saanseoi-places-consistency`; the shared main checkout is
`/home/io/code/saanseoi`. Read each checkout's live git status and applicable
`AGENTS.md` before changing anything. Use a separate worktree based on `9cf36450d` for
parallel work. Do not move or reset the other checkout's branch or index.

The originating thread is independently simplifying brand identifiers to
`identifiers: { wikidata: { brandId: "Q123" } }`. Leave brand identifiers, Point
geometry, bbox normalisation, observation-month semantics and unrelated
localisation/statistics work outside this task. Both tasks may touch shared Places
files: keep edits narrowly scoped, inspect the final patch, and resolve overlapping
hunks without replacing entire files. Commit only this task's changes.

The starting commit already stores GeoJSON Points and canonical bbox tuples, removes
`lastSeenMonth` from CURRENT Places, and shares exact Division names/levels in
`placeDivisionDefinitions`, keyed by `(divisionSnapshotId, divisionId)`. Current API
observation months derive from completed publication cohorts. HISTORY's recorded
observation month is content-version metadata, not a deletion marker. Preserve explicit
history deletion events and publication membership for removals.

## Required membership shape

Use these nullable scalar columns on the Place base, with matching canonical history
content where appropriate:

| Place column      | Division class                          |
| ----------------- | --------------------------------------- |
| `countryId`       | `country`                               |
| `areaId`          | `area`                                  |
| `districtId`      | `district`                              |
| `townId`          | `town`                                  |
| `ruralAreaId`     | `rural_area`                            |
| `macrohoodId`     | `macrohood`                             |
| `neighbourhoodId` | `neighbourhood`                         |
| `villageId`       | `village`                               |
| `microhoodId`     | `microhood`                             |
| `hamletId`        | `hamlet`                                |
| `landformId`      | `major_island`, `minor_island`, `islet` |

Reuse `divisionFields`, `DivisionReferences` and the `references` result from
`apps/harbour-cli/src/lib/pipeline/divisions/divisionMembership.ts`. That resolver also
returns `divisionIds` and evidence containing additional ancestors: do not persist or
expose the excluded classes through that alternate output. Do not change shared Address
membership semantics merely to restrict Place output.

Preserve polygon precedence, boundary/overlap ambiguity, compatible Address fallback,
district-constrained name matching and agreement across canonical ancestry paths.
Ambiguous classes remain null; never select the first candidate. Landform membership
must retain the resolver's most-specific unambiguous result.

## Exact definitions and write economy

Remove the per-Place-per-Division `placesDivision` table and its producers/consumers. Do
not recreate it under another name or add a compatibility view.

Keep exact names and levels shared rather than embedding them in every Place. A live
Division serving scope cannot substitute for the logical revision selected by a Place
publication. Retain `placeDivisionDefinitions` or an equally explicit shared definition
contract, and provide the scalar Place memberships with sufficient revision evidence.

Choose and document the simplest representation that preserves exact definitions and
independent pointer reuse. Consider a shared content-addressed definition set referenced
by one Place column if that avoids repeated per-field revision metadata. Do not assume
one latest Division snapshot is correct for every inherited dependency. Avoid forcing
all Places to update when an equivalent Division release is reissued. Prove that changes
to selected names/levels affect only the relevant Places and search documents.

Keep `searchDependencyText` on locale rows and use it for both fresh and incremental
FTS. Removing excluded memberships must also remove their contributions from newly
prepared Place Division search text and relationships. This does not remove those
entities from the Divisions dataset itself. Preserve existing historical evidence
faithfully; define how public Place projections filter excluded classes when replaying
older evidence.

## Producer and consumer audit

Trace each path rather than changing the schema alone. Start with:

- `libs/db/src/schema/shared.ts`, CURRENT/HISTORY Places schemas, exports and reset SQL.
- Places preparation, materialisation hashes, SQL writes, baseline loading and exact
  resolved-delivery validation under `apps/harbour-cli/src/lib/pipeline/places/`.
- `placeSearchDependencies.ts`, `placeHistoryBaseline.ts` and
  `resolvedPlaceDelivery.ts`.
- Current/history Place readers, relationships and geographic predicates in
  `apps/atlas-api/src/db/places.ts` and `placesHistory.ts`.
- `services/places.ts`, public schemas, field provenance fixtures and lineage rules.
- Rollback reconstruction, its retained definition checks, capture policies, database
  mirror profiles, cleanup/reset ownership and foreign-key checks.
- Address-free Places: their scalar memberships must still resolve spatially.

Maintain `filter[division]`, geographic code filters, counts and pagination before
projection. Derive public relationship IDs from supported scalar columns. Preserve
locale-specific relationship names using exact shared definitions. Verify indexed access
for common filters instead of replacing reverse-index reads with an unmeasured
whole-table scan. Do not add eleven speculative indexes without measuring queries.

Check broad code-filter behaviour explicitly: excluding direct SAR/city/island-group
memberships must not silently break supported region or code selection. A code such as
`HKSAR` may need to resolve through supported descendants or the region contract. Either
preserve the documented behaviour through that resolution or identify the concrete
contract decision before removing it.

## Migrations and documentation

Generate migrations with `bun run db:migration:generate:current` and
`bun run db:migration:generate:history`; do not handcraft them. Inspect every generated
SQL operation and snapshot parent. Earlier migrations contain independent ancestry and
schema-retirement work: do not absorb or repair it incidentally. If the generator tries
to recreate unrelated tables, establish the intended baseline before continuing.

Validate fresh CURRENT and HISTORY databases in isolation. Do not apply drop-column or
table-removal migrations to the populated local database. Do not backfill it. Update
reset scripts, dataset family/source instructions, `/guides/create-a-map` references and
`docs/guides/create-a-map-coverage.md` for any affected public contract. Rehash changed
fixtures and run `bun run format:markdown` after Markdown edits.

## Acceptance evidence

- All supported scalar classes round-trip through ingestion, CURRENT, HISTORY, public
  responses and rollback; SAR, city and island-group Place memberships are excluded.
- Spatial membership works without an Address, and ambiguous peers remain unassigned.
- Scalar ID filters and geographic codes preserve correct counts and pagination.
- Two Places sharing memberships/definitions reuse shared definition storage.
- A month-only reissue causes zero canonical, localisation, membership or FTS mutations.
- A membership edit changes the relevant base and search projection; an unrelated
  Division edit leaves unaffected Places untouched.
- Exact historical names and independent locale versions survive newer live Division
  publications, retirement of serving scopes and rollback across history shards.
- Rollback delivery includes shared definitions, survives interruption and lost local
  acknowledgements, and preserves unrelated scopes and rowids.
- Fresh FTS and incremental FTS produce the same documents from retained dependencies.
- Migration replay and foreign-key checks pass on isolated fresh databases; no runtime
  schema, mutation policy or reset script still depends on `placesDivision`.

Run focused tests for these properties, API/CLI type checks and affected public contract
and lineage tests. Report unrelated baseline failures separately. Deliver a task-scoped
commit with its exact paths, verification results and any unresolved contract decision.
