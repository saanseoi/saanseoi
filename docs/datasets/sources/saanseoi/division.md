# SaanSeoi Division statistics

The names fixture sets the complete bilingual village names for Sha Ha (沙下村), Fui Yiu
Ha (灰窰下村) and Tui Min Hoi (對面海村), with ` Village` appended to each English place
name. Their standalone `Village` and `村` alternatives are removed during assembly,
while unsuffixed source alternatives are retained.

Spatial hierarchy assembly keeps both parent intersections and any positive-area
remainder outside those parents. The remainder retains its existing ancestry and is
checked against subsequent tiers. This preserves paths for portions outside a partially
covering macrohood without inventing combinations of unrelated ancestors.
`fullContainment` measures each ancestor against the whole division; it is annotated
after paths are resolved and does not create branches.

Expanded representative-point audit cards show a marker on the SaanSeoi basemap beside
the retained coordinates. The preview loads only while the card is expanded.

The Division resource of `ds-hk-saanseoi-division` publishes statistics during both
local SQL ingestion and direct ingestion. Statistics belong to the source resource
release.

Change counts compare retained source records with the preceding release using the
public source-field projection shared with the Changes endpoint. Acquisition timestamps,
internal containment geometry evidence and internal name variants do not define a
displayed change. Public names, identifiers, hierarchy paths, containment flags and
geometry remain part of the comparison. Internal evidence stays in retained storage.

Division Type and Level charts split records into added, changed, removed and unchanged.
Current records use their current class and level; removed records use their previous
classification. The count at the end of each bar is the current population, while the
coloured bar also includes removed records. Landforms with a null level appear as **Not
applicable**. The first release treats all records as added.

District coverage includes the district's own record and every record naming it in an
administrative hierarchy path. Repeated paths do not duplicate a record within a
district. A record spanning multiple districts contributes once to each, so district
counts need not sum to the overall record count. The map uses the latest published,
ready SaanSeoi district land polygons on both source and API Stats pages. MapLibre
simplifies this display layer with a one-pixel tile tolerance; retained source geometry
is unchanged. Territorial polygons and non-district divisions are excluded.

Record Types reports source divisions and the number of locale entries with a non-empty
name, labelled Divisions and Divisions I18n. These are source-content counts rather than
counts of assembled API records.

## Local backfill

Run the shared calculator against explicit local SQLite files:

```fish
bun apps/harbour-cli/scripts/repair-local-saanseoi-division-stats.ts META.sqlite SOURCE.sqlite
```

Supply every retained source shard containing SaanSeoi Division history. The command
defaults to a dry run and checks for ambiguous source identities and missing retained
releases. Add `--apply` to back up the existing statistics beside the metadata database
and transactionally replace only source-owned changes, records and localised-record
statistics for published SaanSeoi Division releases. Completeness, quality, geometry
resources and API release-set statistics remain independently owned.

## Preparation audit

Audit groups start collapsed. Search stays below the release navigation while scrolling.
Automatic update outcomes show retained affected records, including accepted and
proposed values. Counts without retained record evidence are labelled explicitly.
Preparation retains update events alongside their aggregate policy counts.

Preprocessing changes retain one audit record per output Division. Where the same ID
exists in a pinned Overture input, Before fields and names use that normalised source
record; Before hierarchy preserves the publisher’s native paths. Retained comparison
evidence identifies its exact source release and the output’s contributing source
records; the visible comparison focuses on Before and After values. Divisions without a
same-ID Overture input have no single-record Before baseline. These comparisons are
recorded automatically, not individually reviewed or verified before ingestion. They do
not represent a complete source-to-source merge comparison.

Existing local evidence can be supplemented with
`scripts/backfill-preprocessing-context.ts` using its frozen archive and hash-verified
source pins. Original fixtures remain intact; the supplement retains source context
separately and backs up the local registration.

Curations are grouped by purpose: additions, map bounds, classifications, hierarchy,
exclusions, island decisions, source matches, names, representative points and boundary
selection. Each row displays Traditional Chinese and English names when recorded. Search
includes these names as well as record IDs. File metadata and general policy settings
are separate from the count of individual curations.

Preparation retains a companion name index from its pinned source ingredients and final
names, including excluded identities. It supports readable audit labels without changing
the frozen curation documents. For an existing local edition, the name index can be
reconstructed from its exact preparation archive and hash-verified pinned sources with
`scripts/backfill-curation-names.ts`; the default is a dry run and `--apply` retains a
rollback record before registering the supplemented audit.

Drawn and withheld boundaries have map previews of their retained geometry. These are
Division Area inputs: a withheld drawing is not a published boundary. Map bounds are
viewing rectangles; representative points are label locations; boundary selections
choose source shapes and record alternatives. General geometry file information is not
an individual curation. Obsolete local-review wording is omitted from presentation
without rewriting immutable evidence.

The preparation summary owns input/output counts and the complete before/after view.
Fixture lists sit under Curations, Patches or Rules. Curations distinguish authored
choices from decisions triggered by a guard. Identity instructions belong to Division;
boundary drawings, selections and geometry decisions belong to DivisionArea. Island
actions are Division curations. The shared preparation summary appears once above both
resources. Rule results sit inside their rule card and start collapsed. Independent
classification, name, point and bounds corrections are Patches.

One additions file and one exclusions file hold both authored instructions (`entries`)
and guard-triggered decisions (`releaseEntries`). The distinct collections keep the
required evidence explicit: a manual instruction does not pretend to have a guard
fingerprint. Exclusion entries use `scopes` to target the final `result`, `overture`
inputs, or `landsd` inputs. A shared identity has one entry with multiple scopes.
`divisionId` identifies the target; a LandsD target can additionally supply
`sourceRecordId`. Island geometry decisions remain separate from identity exclusions.

Manual additions and exclusions accept optional inclusive `appliesFrom` and exclusive
`appliesUntil` release versions. Unbounded entries apply to every edition. Bounded
instructions require an explicit target release. Guard-triggered additions, exclusions
and name decisions require `appliesFrom`, a reason and a review containing the guard,
field, before/proposed values and fingerprint; `appliesUntil` is optional. Name
decisions also select `keep` or `accept`. Applicability never bypasses the exact
fingerprint check.

The audit labels original places “Additions” and reviewed disappeared records “Removed
upstream, but retained”. Confirmed upstream removals and rejected new records have
separate labels. Retained points support a map loaded only when the record expands.
Missing-name restoration and name-pattern exclusions have rule widgets with result
lists. Ordinary upstream additions appear in release changes, not editorial audit
results. Name alias rules record suffix matches separately from newly added aliases.

Preparation saves guards for unique output identities, at least one non-empty name per
division, ancestor references, valid active boundary drawings and core points covered by
those drawings, as well as the source-update guard. The hierarchy guard checks SAR →
Area → District in both administrative and full paths and requires their administrative
ancestry to agree. Counts identify the records actually checked. Ambiguous identity
matches, missing pinned inputs and missing selected source geometry stop preparation
before a completed audit is available; a completed audit does not invent individual
results for these earlier failures.

`scripts/backfill-name-alias-audit.ts` reconstructs alias results and rechecks these
invariants from a frozen archive only when its definitions and changes match the
registered audit. It labels reconstructed evidence, retains a replacement immutable
audit, and saves rollback SQL and the previous delivery receipt. Failed checks are
retained as failures; this does not ingest records or bypass ingestion guards. The
default is a dry run; `--apply` registers the result in the local development registry.

The preparation audit retains level and type classification and locale inference
mappings for the Overture ingredient normalisation used in the edition’s before/after
comparison. Counts cover identities retained in the final edition. Editorial overrides
remain in the separate reviewed preparation evidence.

Locale normalisation compares the final reviewed names with those normalised ingredient
names. Each target locale records present and missing names; changed counts include
additions, replacements and removals. These counts do not represent API locale fallback.
Simplified Chinese names require explicit publisher evidence.

The area hierarchy card counts retained Overture identities assigned an administrative
area absent from their publisher ancestry. A blocking guard checks every applicable
final administrative path against Hong Kong SAR → recognised Area → District, checking
each division once even when it spans multiple districts. A district without its
required ancestry fails the guard.

For an existing local edition, reconstruct the audit from its original ZIP and
registered preparation evidence:

```fish
bun scripts/backfill-curated-preparation-audit.ts META.sqlite ARCHIVE.zip OUTPUT_DIRECTORY
```

The dry run verifies the frozen evidence against the registered audit and replays pinned
Overture inputs, checking normalised names and classifications against retained before
values. Add `--apply` to retain and verify the object graph in local R2, replace only
the matching preparation-audit reference, and update its local delivery receipt. The
output directory retains the counts, old and new references, rollback SQL and previous
delivery receipt. Source records, archive assets and ingestion audits remain unchanged.

Rejected island source geometries require a boundary patch that resolves to an emitted,
non-empty, valid polygon for an output division. The `rejected-island-boundaries` guard
accepts drawings and explicit replacement-source corrections, using retained output
geometry and its patch provenance. A source selection or withheld drawing alone does not
satisfy the guard. Completed identity decisions to exclude, merge, reclassify or retain
no geometry are outside this shape-replacement check. The audit groups both patch kinds
under Boundaries and labels them Drawn geometry or Replacement source geometry; expanded
source patches show the resolved polygon.

The Division guard `prepared-island-group-members` requires every output island group to
have at least one resolved member. Members must be unique output islands, not missing
IDs, non-island divisions or the group itself. Preparation retains the resolved
membership used to construct group geometry; seed lists alone do not satisfy this check.
