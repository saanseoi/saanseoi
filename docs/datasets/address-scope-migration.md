# Address scope migration

The canonical storage contract uses `scope` and nullable `premisesType`. Public and
authored JSON repeat `premisesType` inside each `i18n[locale]` object beside
`premisesName`; no top-level public `premisesType` is exposed. The internal column is
projected into each locale at response time, so this JSON layout requires no database
column move. A known site/complex type also applies when the address identifies a
building or unit within that named premises. Address identity, `parentAddressId`,
geometry, source evidence and publication membership remain independent of scope.

The schema artefacts are generated through `bun run db:migration:generate:current` and
`bun run db:migration:generate:history`:

- CURRENT: `20261022022411_nifty_mystique`.
- HISTORY: `20261022022445_warm_the_professor`, on each retained history shard.

SOURCE and META schemas are not migration targets. Published metadata fixtures need
normal seeding before the API advertises the corresponding field lineage. Address
classifications are not source-publication events, and this migration does not create
releases, snapshots, replacement IDs or research assertions.

## Local rehearsal and application

Pause application writers and ingestion for the selected databases. Rehearse against
disposable populated copies first. `scripts/migrate-address-scope.ts` combines the
generated schema SQL and the data conversion in one SQLite transaction. Do not expose
the new API between a schema-only upgrade and the classification conversion.

Create a separate plan for CURRENT and for every HISTORY shard:

```sh
bun scripts/migrate-address-scope.ts plan current /tmp/current.sqlite /tmp/current-scope-plan.json
bun scripts/migrate-address-scope.ts apply current /tmp/current.sqlite /tmp/current-scope-plan.json /tmp/current-before.sqlite
bun scripts/migrate-address-scope.ts plan history /tmp/history.sqlite /tmp/history-scope-plan.json
bun scripts/migrate-address-scope.ts apply history /tmp/history.sqlite /tmp/history-scope-plan.json /tmp/history-before.sqlite
```

The plan includes exact address/storage IDs, before/after classifications, row and
change counts, a digest of every address field, and a fence for the generated schema
SQL. Its adjacent JSONL manifest contains one classification assertion per retained row.
Keep these files and database backups in ignored local storage; they can contain
internal address references.

The data conversion maps recorded `site` and `complex` classifications to
`scope=premises`, retaining the corresponding `premisesType`. Other classifications
retain their value and receive a null subtype. Tombstones retain null scope and hash.
The runner rejects unknown values and conflicting types, creates a full database backup
without overwriting an existing file, rejects stale content, and verifies all address
fields and counts, foreign keys and SQLite integrity after application. An identical
replay returns zero changes. A failure rolls the schema and data back.

Retained version hashes, source payloads, identities, parentage and other address
content are preserved. They identify the recorded publication evidence; the storage
contract conversion does not reissue that publication. Subsequent canonical ingestion
hashes the new `scope` and `premisesType` contract, so its initial canonical comparison
can produce new content versions even when publisher payloads are unchanged. Source
hashes and source-change detection remain independent.

## Recovery and remote rollout

Before accepting new writes, restore the full `before.sqlite` backup to recover both the
schema and data. After accepting writes, preserve them for reconciliation before
restoring a backup. Do not attempt to reverse the scope collapse by guessing a subtype
for newly authored premises.

The runner is local SQLite tooling. Remote D1 rollout needs an identified CURRENT and
HISTORY shard inventory, paused writers, recovery bookmarks, guarded atomic batches, and
API readback after schema and data conversion. Running only the generated schema
migrations is insufficient for existing `site` and `complex` rows. No remote database
application or deployment is part of this implementation.

The shared authored-content package is `@saanseoi/address` 0.2.1. Consumers such as HYPE
must update their pinned package and API reader together; an older vendor tarball is not
rewritten by this repository change.
