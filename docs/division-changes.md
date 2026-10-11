# Division changes

```http
GET /divisions/v1/changes?fromApiReleaseSet=<required>&toApiReleaseSet=<optional>
```

Compare effective Hong Kong geographic division definitions by stable division ID.
Selectors accept published release-set codes or IDs. `fromApiReleaseSet` is required.
Omitting `toApiReleaseSet` resolves the latest published geographic release selected by
the current catalogue. The response returns both resolved IDs and codes.

## Example queries

These release codes must be published and retained in the selected environment.

1. Compare June's definitions with the latest published release:

   ```http
   GET /divisions/v1/changes?fromApiReleaseSet=data-hk-divisions-2026-06-17.0
   ```

2. Compare two specific releases:

   ```http
   GET /divisions/v1/changes?fromApiReleaseSet=data-hk-divisions-2026-06-17.0&toApiReleaseSet=data-hk-divisions-2026-07-22.0
   ```

3. Include before/after membership geometry:

   ```http
   GET /divisions/v1/changes?fromApiReleaseSet=data-hk-divisions-2026-06-17.0&toApiReleaseSet=data-hk-divisions-2026-07-22.0&include=geometry
   ```

4. Request ten changes per page, then follow `links.next`:

   ```http
   GET /divisions/v1/changes?fromApiReleaseSet=data-hk-divisions-2026-06-17.0&toApiReleaseSet=data-hk-divisions-2026-07-22.0&page[limit]=10
   ```

5. Compare in reverse for a rollback:

   ```http
   GET /divisions/v1/changes?fromApiReleaseSet=data-hk-divisions-2026-07-22.0&toApiReleaseSet=data-hk-divisions-2026-06-17.0
   ```

## Representation

The default response contains additions, deletions and revisions, with changed fields,
membership impact, before/after metadata and immutable definition links. Polygons are
available on demand; `include=geometry` embeds them in the change response.

Each change contains:

| Field                          | Meaning                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `id`                           | SHA-256 identity of the comparison, stable division ID and before/after content hashes |
| `divisionId`                   | Stable division identity                                                               |
| `type`                         | `addition`, `deletion` or `revision`                                                   |
| `changedFields`                | Fields whose effective values differ                                                   |
| `canAffectGeocodingMembership` | Whether consumers may need to recompute memberships                                    |
| `before`, `after`              | Definition references; null for an addition's before or deletion's after               |
| `affectedDescendantIds`        | Potentially affected descendants in each release                                       |

Definition references contain the release ID and code, division ID, `definitionHash`,
`attributes`, a `record` URL and a `geometry` URL when an authoritative polygon exists.
The geometry URL identifies the `membershipGeometry` member of the definition document.
Attributes include all served locales, category, class, level, hierarchy branches and
descriptive metadata. This lets consumers refresh labels without another request.

The definition URL has this form:

```http
GET /divisions/v1/changes/definitions/{id}?apiReleaseSet=<id>&definitionHash=<sha256>
```

It returns the exact definition and its authoritative polygons, or `503` if that content
is unavailable. The hash covers definition content, excluding storage scopes and
timestamps. The endpoint never substitutes a newer record or geometry. Deleted
identities remain retrievable through their source release while history is retained.

## Change semantics

| Changed field                                                                             | Can affect geocoding membership?                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `membershipGeometry`                                                                      | Yes: expansion, contraction, movement or coverage changes                      |
| `hierarchies`                                                                             | Yes: ordered ancestor IDs/classes and alternative branches in every projection |
| `category`, `class`, `level`                                                              | Yes: classification and branch selection inputs                                |
| `names`, `hierarchyNames`                                                                 | No: refresh labels; forward name-search results can change                     |
| `divisionCode`, `identifiers`, `wikidataId`, `geometry`, `bbox`, `cartography`, `sources` | No: descriptive metadata and label/display geometry                            |

Additions and deletions always have potential membership impact, including identities
without their own polygons that participate in descendant ancestry. A true revision
requires different effective content. A release switch, storage timestamp, snapshot ID
or geometry row ID alone does not create a revision. Object-key order and alternative
branch order do not matter; vertex order and order within a hierarchy path do matter.
Coordinate equality is structural, not a topological polygon-equivalence test.

Membership geometry follows the [geocoding contract](geocoding.md): the geographic
`saanseoi` association scoped by cohort. Label points and other area/boundary variants
do not substitute for authoritative membership polygons. An empty polygon array means no
authoritative geometry is available for that division, not a known empty territory.
`meta.coverage` reports division and polygon-coverage counts on each side. The
checked-in saanseoi inventory currently has no operational containment coverage.

Saanseoi polygons are fixture-backed and are not retained in database snapshot journals.
Content hashes protect definition links and pagination against fixture replacement:
unavailable old content produces an explicit error. Retain an exported definition if it
must remain available independently of service retention. Database identities and names
use the selected snapshot journals and owning history shards.

## Ancestor dependencies

The feed uses explicit dependencies rather than fabricating revisions for unchanged
descendants. For each membership-impacting change, `affectedDescendantIds.before` and
`.after` list the transitive reverse references through every stored full and category
hierarchy branch. Traversal includes suppressed ancestors and guards against cycles.
References to a missing ancestor also establish a dependency when that ancestor is added
or deleted. The changed division itself is excluded from its descendant lists.

These lists are conservative candidates for recomputation, not proof that every
descendant's membership changed at every coordinate. Consumers should process the
changed division and the union of both descendant lists. Actual changes to materialised
descendant paths also appear as ordinary revisions.

## Pagination and errors

`page[limit]` defaults to 25 and accepts 1–100. Changes sort by stable division ID using
code-unit order. Follow `links.next` or pass `meta.nextCursor` as `page[cursor]`,
keeping `fromApiReleaseSet`. The cursor pins both release IDs, the full comparison
fingerprint and the last division ID. Omitting the target on later pages uses the
cursor's target; publishing a newer release cannot change the comparison. A supplied
target must match the cursor. Returned self, first and next URLs pin both IDs and the
fingerprint.

`meta.comparisonId` fingerprints the resolved release pair and all effective definition
hashes. Change IDs are independent of page size and geometry inclusion. The service
reconstructs and fingerprints both definition inventories per page; it does not maintain
a mutable global comparison cache.

| Status | Error                                                           | Meaning                                                                                              |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 409    | `incompatible_release_sets`                                     | Unsupported family, region or domain, or different schema/ruleset versions                           |
| 422    | `validation_error`, `invalid_cursor`, `cursor_release_mismatch` | Missing/invalid query or a cursor for another comparison                                             |
| 503    | `release_set_unavailable`                                       | Unpublished/unknown release, missing snapshots, unavailable history/shards or publication transition |
| 503    | `comparison_unavailable`, `definition_unavailable`              | The exact content fingerprint cannot be reproduced                                                   |

Both releases must use the Hong Kong geographic `api-divisions-v0.1` dataset contract.
Published archived release sets can be selected outside the current catalogue. Draft
release sets are rejected. Equal source and target releases return no changes; reverse
comparisons are supported, with additions and deletions relative to the supplied order.
