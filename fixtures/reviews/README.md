# Retained review evidence

Review evidence is retained in the dedicated `ss-evidence` R2 bucket. The small
`manifest.json` catalogue belongs in Git. Full investigation reports, predecessor
inventories and generated indexes belong in the archive; their files here form a local
cache. Curated rules and reviewed decisions remain in `fixtures/meta/curations/`.

Each catalogue entry records its repository-relative cache path, source version when
available, evidence kind, exact byte size, SHA-256 checksum and immutable object key.
Objects use `evidence/sha256/{checksum}`. Report digests and acknowledgement authorities
inside the original JSON remain unchanged. Portable provenance uses
`evidence:sha256:{checksum}` identifiers.

## Retention and access

New ALS and Place investigations register themselves in the catalogue. Ingestion
restores a missing catalogued acknowledgement from R2, verifies its exact bytes and then
runs the source-specific evidence checks. Missing or corrupt evidence blocks replay;
restoration never grants a new acknowledgement. A fresh checkout needs Wrangler
credentials with read access to `ss-evidence` to replay retained investigations.

Use these commands from the repository root:

- `bun run evidence:check` validates local payloads against the catalogue.
- `bun run evidence:refresh` catalogues new reports or a new generated index version.
- `bun run evidence:sync` retains and verifies catalogued objects in R2.
- `bun run evidence:restore` restores and verifies all catalogued files.
- `bun run test:evidence` checks archive validation and pushed-commit selection.

Refresh preserves entries whose local files are missing. Refresh and registration also
save exact-byte snapshots under `.local/evidence-archive/sha256/`, so an older catalogue
version can be uploaded after an index changes. This local copy is useful recovery
material; maintain an independent backup of the permanent archive too.

Commit catalogue changes alongside the decisions or implementation that reference them.
A push runs the archive check before the repository checks. It syncs the current
retained files and every catalogue version in the outgoing commit range, including
pushed refs other than the checked-out branch. Existing objects must match; absent
objects are uploaded conditionally and verified. Unavailable credentials, upload
failures, corrupt objects, uncatalogued local files, committed payload JSON or an
uncommitted catalogue when pushing HEAD stop the push. Ref deletions require no archive
sync. The hook never stages or commits changes.

Retain acknowledged and published evidence indefinitely. The archive is separate from
snapshot buckets and must not have automatic expiry or snapshot-cleanup rules. Revisions
create new checksum-addressed objects; removing a catalogue entry does not delete an
archived object. Local cache files may be removed after successful remote retention and
verification.

## Verification receipts

The local initial-retention receipt is
`.local/evidence-archive/initial-retention-receipt.json`. It records the catalogue
checksum, object keys, checksums, sizes and verification time. Initial retention
verifies every downloaded object against its original local bytes before payload JSON is
ignored by Git. The catalogue and this document remain tracked.

## Historical fixture versions

`retired-git-history` entries retain exact historical JSON and JSONL bytes. Each entry
records its original repository path and Git blob ID as well as its SHA-256 checksum and
immutable R2 object key. The cache path identifies that particular version; restoration
does not replace a current curation file with a historical export.

The historical catalogue covers retired division stub areas, hierarchy patches, review
inventories and island areas, together with every retained Place address ledger version.
Authored division geometry and the current small Place decision ledger remain repository
inputs. `bun run evidence:restore` restores the checksum-verified historical cache files
alongside investigation evidence.
