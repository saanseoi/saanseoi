# Initial D1 bootstrap

`scripts/d1-bootstrap.py` prepares an SQL bundle for every configured D1 binding:
metadata, current, and all source and history shards. It uses Python 3.11 or newer and
the installed Wrangler CLI. Preparation does not contact or modify production.

D1 [enforces foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
An [SQL import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
can use `PRAGMA defer_foreign_keys=ON` to defer validation until its transaction
finishes. The bundle creates all tables and indexes before inserting data. It has no
explicit `BEGIN` or `COMMIT`, and never switches foreign-key enforcement off. Each
complete shard is one import file; do not split it into independent imports.

Final inserts and indexes incur D1 writes. Local preparation avoids remote ingestion
churn. Very large cells require bounded assembly statements, which add some writes. It
is not a free SQLite-file restore or a Time Travel restore.

## Ingest locally with production R2

Choose the object destination before starting a fresh local ingestion:

```fish
saanseoi init --target local --r2 production
# Or the minimal initialisation:
saanseoi init:minimal --target local --r2 production
```

`--target` selects D1 and API processing; `--r2` independently selects object storage
for local runs. The choice is inherited by nested initialisers. Source archives,
evidence assets, asset manifests and provenance objects are retained in production
`R2_ASSETS`, resolved from the production Wrangler configuration. Asset registrations,
release links and provenance registrations remain in local D1. Stored managed-asset URLs
use the production API host and become available after the database cutover. Local
object copies also remain available for local API/provenance validation.

Remote R2 uploads require Node.js 22.18 or newer on `PATH`. A persistent Node subprocess
handles Wrangler R2 operations while ingestion runs in Bun. Connection startup has a
45-second deadline and each object operation has a 120-second deadline; progress and
errors identify the operation and object key.

The uploader uses Wrangler authentication and an R2-only remote binding, with no
production D1 binding. Configure `CLOUDFLARE_API_TOKEN` with the required R2 access and
`CLOUDFLARE_ACCOUNT_ID`, or use an authenticated Wrangler session. Matching objects are
verified by SHA-256 and size and reused. Missing objects are created conditionally;
conflicting contents stop the run instead of overwriting an object. Local resets remove
local data but leave shared production R2 objects intact.

The selected R2 mode is recorded beside local D1 persistence. Continuation must use the
same mode, including `--r2 production` on subsequent top-level invocations. A populated
local run without a recorded mode is treated as using local R2. Changing its mode is
rejected because completed releases may skip the upload phases. Such runs need the
explicit artefact transfer described below, or a separately prepared fresh local
database set; this option does not retroactively transfer old artefacts.

## Prepare destinations

Run these commands from the repository root in fish. Set `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` for the intended account before executing remote commands.

```fish
set -gx WRANGLER_LOG_PATH /tmp/ss-bootstrap-wrangler
python3 scripts/d1-bootstrap.py plan --output .local/d1-bootstrap/targets --label initial
cat .local/d1-bootstrap/targets/create.fish
```

The plan contains eight creation commands with distinct bootstrap database names, plus
`targets.json`. Review the plan, then create the new empty destinations:

```fish
fish .local/d1-bootstrap/targets/create.fish
```

Copy each returned database UUID into its matching `database_id` in
`.local/d1-bootstrap/targets/targets.json`. The exporter rejects missing, duplicate or
malformed IDs and mismatched binding sets. Creation commands disable automatic Worker
configuration updates. Do not run migrations on these destinations: the bundle contains
their schema and migration ledger.

Existing populated production databases are unsuitable for this workflow. The import
commands check every destination before uploading anything, and each SQL file also
refuses existing application tables. There is no reset or overwrite flag.

## Finish local ingestion and seal the bundle

Allow the intended local ingestion to finish and resolve incomplete releases, source
releases, snapshots and release sets through their owning workflows. Do not change their
statuses manually to pass the readiness check.

```fish
python3 scripts/d1-bootstrap.py status
```

Stop local ingestion and Workers before preparation. Preparation takes write
reservations on every local database while making WAL-safe SQLite backups, so a
concurrent writer would fail. `--writers-stopped` acknowledges this requirement. The
source databases receive no data changes. Allow disk space for all SQL exports, the
retained SQLite copy of every shard and a temporary restored copy of the largest shard.

```fish
python3 scripts/d1-bootstrap.py prepare \
  --writers-stopped \
  --target-config .local/d1-bootstrap/targets/targets.json \
  --output .local/d1-bootstrap/initial
```

Preparation refuses incomplete metadata, pending SQL delivery ownership, missing shards,
nonempty staging tables, SQLite integrity failures and foreign-key violations. Current
publication records must be complete, and Address rows must belong to a prepared scope
with nonempty display content. Each ALS scope requires its acknowledged
`address-membership/<scopeId>/<snapshotId>.json` beside the local database set; its IDs
must match the current Address projection. It preserves row IDs, autoincrement
high-water marks, persistent tables, indexes, triggers, views and migration rows. Empty
staging tables and SQL delivery receipts are omitted. Triggers are installed after data
to avoid replaying their side effects. Oversized payloads are assembled using statements
smaller than 90,000 bytes.

The exported metadata uses production database names and IDs while retaining internal
shard IDs referenced by release and snapshot assignments. Each SQL file is restored into
a fresh SQLite database with foreign keys enabled; integrity and table counts must pass
before the manifest is sealed. The bundle also retains each cleaned `<binding>.sqlite`
file, its checksum and the acknowledged Address membership files. These SQLite files
seed the subsequent production mirror; they are not uploaded directly to D1. Keep the
complete bundle, including SQL, SQLite files, membership files and manifest, together.
This is local SQLite validation, not evidence that a large import has succeeded on D1.
D1's import-file, database-size and row-size limits still apply.

A failed preparation leaves an unsealed directory for diagnosis. Use a new output
directory after resolving the failure; do not import its partial files.

## Prepare artefacts and publication checks

SQL does not copy R2. The manifest lists `rawObjectKeys` from release metadata to aid
archive checks; this is not an exhaustive inventory of nested evidence assets, asset
manifests or generated files. Inspect those references too. Local asset URLs and any
environment-specific URLs require review before switching production traffic.

For an individual known asset key, these commands download the local object and prepare
its upload to the production asset bucket. Use unique local filenames for each object
and verify its content hash against the retained asset manifest. Check for an existing
remote object before writing to an existing bucket; use a separate bootstrap bucket
where production objects could conflict.

```fish
set asset_key 'REPLACE_WITH_VERIFIED_OBJECT_KEY'
bunx wrangler r2 object get "ss-assets-preview/$asset_key" --local \
  --persist-to .local/d1/dev --file /tmp/bootstrap-asset
sha256sum /tmp/bootstrap-asset
# Execute after checking the destination and the expected content hash:
bunx wrangler r2 object put "ss-assets-prod/$asset_key" --remote \
  --file /tmp/bootstrap-asset
bunx wrangler r2 object get "ss-assets-prod/$asset_key" --remote \
  --file /tmp/bootstrap-asset-remote
cmp /tmp/bootstrap-asset /tmp/bootstrap-asset-remote
```

Preserve the original content type and custom metadata when copying assets. These
individual-object commands do not automate a complete R2 transfer. Database bundle
manifests retain `publicationReady: false` because SQL integrity alone cannot prove
artefact availability or correct cross-shard API behaviour.

## Import and verify all shards

Generate the reviewed import script from the sealed manifest:

```fish
python3 scripts/d1-bootstrap.py commands --output .local/d1-bootstrap/initial \
  > .local/d1-bootstrap/import.fish
cat .local/d1-bootstrap/import.fish
```

Keep writers away from the destination set for the entire import. The generated script
checks SQL checksums and pinned target mappings, verifies that all targets are empty,
imports source/history shards followed by current and metadata, and checks table counts,
foreign keys and SQLite integrity after each import. A successful `check-import` records
the binding's sealed SQL checksum in `verified-imports.json`. These checks establish
counts and structural integrity, not a full remote row-by-row content hash comparison.

```fish
fish .local/d1-bootstrap/import.fish
```

The script stops at the first failure. Retain Wrangler's output and import status. Do
not rerun the complete script over successfully imported shards: empty-target checks
deliberately reject them. After a lost acknowledgement, inspect the D1 import status and
run the generated verification command for that shard before considering any retry. This
workflow does not provide automatic import resume. Retain `verified-imports.json` with
the bundle; do not create or edit verification entries manually.

For an additional offline restore check:

```fish
python3 scripts/d1-bootstrap.py verify --output .local/d1-bootstrap/initial
```

## Seed the acknowledged production mirror

After every generated remote verification passes, configure the production D1 binding
IDs to match the sealed destination set. Keep the local SQLite bundle unchanged and run:

```fish
python3 scripts/d1-bootstrap.py seed-mirror \
  --output .local/d1-bootstrap/initial
```

The default destination is `.local/harbour-sql/db-cache/production`. `--cache-dir` can
select a different new directory; subsequent ingestion must use that same mirror. The
command verifies bundle SQL/SQLite/membership checksums, configured destination IDs and
every shard's entry in `verified-imports.json`. It copies the retained files into a
temporary sibling directory, writes the cache manifest and atomically installs the
completed directory. An existing destination is rejected; there is no replacement or
reset flag. This step makes no remote export and does not deploy Worker bindings.

The verified initial database set and this mirror form the baseline for subsequent
resolved family uploads. The manifest pins the complete binding set and its destination
database identities. Retain both the mirror and its acknowledged membership history. All
later writers use the same local controller and prepare candidates on separate copies;
only acknowledged delivery advances the mirror. Places can replay exact historical
Address dependencies in its disposable preparation view.

The isolated bootstrap-to-Places integration fixture exports and verifies a complete
database set, seeds its mirror and compiles a locale-only delta. It checks that the base
Place and publisher assertion remain untouched and that preparation preserves both the
imported mirror and the original local database until replay. This is offline evidence;
production imports still require their actual destination verification receipts.

## Verify the API and switch bindings

Before changing live Worker bindings, point an isolated API environment at the new
complete database set and prepared R2 bucket. Verify published release sets and
snapshots, their source/history assignments, representative records from each family,
provenance assets and history queries. Only then update the production bindings for all
database consumers and the required R2 binding together. Deploying those consumers is a
separate publication step; the bootstrap tool does not perform it. Multiple D1 databases
do not offer one atomic import or atomic binding cutover.
