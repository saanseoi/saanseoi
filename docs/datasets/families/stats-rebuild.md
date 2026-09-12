# Preparing packed Statistics from retained observations

The offline preparation tool converts retained canonical observations into complete
geography/period packs, immutable definition versions and sparse snapshot changes. It
preserves reviewed values and labels, exact reference periods, source assertions and
existing publication selections. It opens every input SQLite database read-only and
writes into a new directory.

## Inputs

Supply complete, mutually consistent retained databases in a JSON manifest. Prefer
immutable backup copies. Paths in this manifest are absolute:

```json
{
  "meta": "/retained/meta.sqlite",
  "current": "/retained/current.sqlite",
  "history": [
    {
      "bindingName": "DB_HISTORY_HK_BEFORE",
      "path": "/retained/history-before.sqlite"
    },
    {
      "bindingName": "DB_HISTORY_HK_2025",
      "path": "/retained/history-2025.sqlite"
    }
  ],
  "source": ["/retained/source-before.sqlite", "/retained/source-2025.sqlite"]
}
```

Include every history shard referenced by the retained Statistics snapshots. Retain the
metadata parent chains, snapshot sources and shard assignments. Building Group identity
requires the exact retained publisher properties: the tool reads the parent Housing
Market Area from that source profile and rejects missing or ambiguous evidence. It does
not derive a parent from a Building Group code.

Retained publisher profiles use version-only `validFromRelease` and `validToRelease`
boundaries. The reader compares these with the selected release's `sourceVersion`,
preserving complete annual, half-year and other publisher version identifiers.

The tool accepts dimension-level canonical observations, including observations whose
schema has gained empty packed-definition columns. It uses each source release's
selected retained dictionary definitions; superseded local processing assertions are
archived separately. It rejects missing snapshots, ambiguous definitions, unknown source
geographies, current values absent from history and dimension-value labels without an
explicit version linkage.

## Prepare and inspect

```fish
bun apps/harbour-cli/scripts/prepareStatisticsRebuild.ts \
  /retained/statistics-inputs.json \
  /tmp/statistics-packed-preparation
```

The output directory must not exist. A failed preparation leaves its diagnostic files
without a `READY` marker; use a new directory after resolving the failure.

Successful preparation produces:

- `report.json`, with input counts, packed counts, sparse changes and each snapshot's
  selected resource count.
- `*.stats.sqlite`, queryable verification databases containing the prepared Statistics
  content. These are not complete replacements for shared current/history databases.
- `*.stats.sql`, transactional Statistics content replacement SQL. History also updates
  the affected `sourceResolutions` targets while retaining their source hashes,
  decisions and other entity links.
- `*.clear-before-migration.sql`, preparation SQL for working copies before the normal
  generated schema migrations.
- `retained-legacy-statistics.ndjson`, preserving every supplied history observation and
  dictionary assertion, including unselected processing versions.
- `legacy-observation-map.ndjson`, linking original observation IDs and hashes to their
  packed IDs and contributing fields.

Current contains only the latest **already-published** snapshot for each dataset and
exact period. Prepared or deferred snapshots remain in history. A preparation can
therefore contain populated history and empty current when the supplied metadata has no
published Stats release sets. Preparation never publishes a release.

## Rebuild working copies

Keep the retained input databases and preparation artefacts together. On disposable
working copies of each shared current/history database:

1. Apply that database's `*.clear-before-migration.sql`.
2. Apply the project's generated migrations through the normal migration workflow.
3. Apply its `*.stats.sql` replacement file.
4. Check the counts against `report.json`, inspect representative current and older
   revision responses, and verify that unrelated resource tables retain their data.

The preparation step avoids collisions when release-scoped dictionary assertions share
the same content hash: the packed schema keys dictionaries by identity and immutable
definition version. Applying that tighter schema directly to duplicate assertions can
fail before any data is repacked.

The replacement SQL touches Statistics content, Statistics journal entries and the
specific source-resolution rows it rebuilds. It does not replace source databases,
snapshot metadata or other resource families. After installing a reviewed rebuild,
refresh Statistics API presentation counts with the existing statistics backfill
command. Use normal publication/reconciliation for prepared snapshots; do not create
current selections by hand.
