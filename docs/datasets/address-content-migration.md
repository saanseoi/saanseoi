# Address content boundary and prerelease maintenance

See the [LLM rollout guide](../operations/address-content-rollout-llm.md) for the review
packet, approval boundary, execution sequence and rollback requirements.

Addresses retain names, expressions, component designators and scope. Physical
parentage, premises organisation and premises purpose belong to future building/place
entities. Canonical CURRENT/HISTORY address rows and public/authored JSON omit
`parentAddressId`, `premisesType` and `premisesKind`. Explicit source curation retains
these assertions. `libs/db/src/premises.ts` retains the agreed vocabulary outside the
address package.

## Evidence and publication identity

Keep every source curation fixture, release bound, reason, component fingerprint and
prepared membership manifest. Membership `parentId` remains review evidence, not an
Address relationship. The migration archive retains every removed value with its address
and storage-scope/snapshot ID. Full database backups preserve the remaining context. Do
not infer building identities from these archived IDs.

Address3D `unresolvedSectionIds` remain explicit collection membership evidence. Readers
resolve shared coverage from these lists and reject ambiguous collections; `shared`
coverage keeps membership unresolved. No address-parent column is needed. Existing
curation checks still validate collection identities, units and explicit section lists.

## Storage audit

Semantic duplication in API responses does not justify duplication in storage. Premises
fields have no place in address storage. `blockType` remains alongside the translated
source block expression: it describes the source designation and is not guaranteed to be
identical across locales. Unit/floor type codes are already stored once per unit;
localised expressions are stored separately. No further field is moved speculatively.

## Database review on 22 October 2026

| Production database | Address rows | Parent links | Tombstones |
| ------------------- | -----------: | -----------: | ---------: |
| CURRENT             |       186186 |         3220 |          — |
| HISTORY HK BEFORE   |       185642 |         2289 |       1128 |
| HISTORY HK 2025     |        12426 |          243 |       1864 |
| HISTORY HK 2026     |       186455 |         3590 |       8002 |

CURRENT has two storage scopes and four collections with explicit section membership.
The reviewed live schema uses `granularity`; pending scope/type migrations must be
accounted for. Read-only parentage exports are retained under the ignored local
`.local/address-content/production-review/` directory. These counts are review
observations, not a live migration receipt.

## In-place hash rewrite

Use `scripts/migrate-address-content.ts` on a SQLite export or local database:

```sh
bun scripts/migrate-address-content.ts plan history history.sqlite plan.json
bun scripts/migrate-address-content.ts apply history history.sqlite plan.json backup.sqlite evidence.json
```

Use `current` for CURRENT. The planner selects the generated scope, kind and removal
migrations required by the observed schema. It hashes migration bytes, curation files
and all address rows; apply rejects changed plans or database content. It requires new
backup and archive paths and applies the rewrite atomically.

HISTORY upserts receive hashes from the same canonical hash builder used by ingestion.
Tombstones retain null hashes. CURRENT has no stored address version hash: its
comparison hash is recomputed from the canonical row and locale components when read.
Locale content/hashes are unchanged by removal of base fields. Equal resulting hashes in
two snapshots do not cause either event to be deleted. Address IDs, snapshot IDs,
timestamps, operation flags and publication membership remain unchanged; no release or
revision is created. `historyEvents` is a view over the inline events and reflects
rewritten hashes.

Generated DROP migrations alone are insufficient: they neither archive evidence nor
recalculate hashes. Use the data-maintenance workflow with the generated schema SQL.

## Live activation boundary

The checked-in runner operates on SQLite files, not remote D1. Live activation requires
a coordinated maintenance deployment across CURRENT and every retained HISTORY shard:
freeze ingestion and cleanup, record D1 recovery bookmarks and full exports, rehearse
the exact exports, archive parentage/classifications, apply guarded schema/hash writes,
and deploy matching readers and ingestion code before resuming service. Inventory every
retained shard through META, including any shard not in current app bindings.

Invalidate retained resolved/staged Address artefacts and Place dependency/enrichment
caches that embed the old columns or hashes. Regenerate derived delivery artefacts from
the rewritten canonical events without creating publication IDs. Preserve publisher
source captures, review fixtures and their source hashes. Refresh served response
caches; search text is unchanged, but its publication selection must still resolve
correctly.

The implementation tests exercise generated migrations, archived evidence, stale-plan
rejection, unchanged identities and null tombstones. They are not a full
production-export rehearsal. No live database writes or deployments form part of the
review above.
