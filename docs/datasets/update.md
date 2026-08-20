# Dataset update checks

For the complete source-addition workflow, including the DataOps and upload hand-offs,
see the [dataset pipeline](pipeline.md).

`saanseoi update` checks every dataset fixture in `fixtures/meta/datasets` against its
registered upstream source adapter. It prints the latest upstream version when one is
available and records the source cursor and last check time in
`.local/harbour/update-state.json`.

Use `--dataset CODE[,CODE...]` to narrow the check. New downloadable artefacts are
offered interactively; `--download` downloads them without asking. Downloads are written
below `data/`, which is intentionally ignored by Git.

```sh
saanseoi update
saanseoi update --dataset ds-hk-overture-division --download
```

Each dataset is checked sequentially with a compact spinner row. Overture is checked
through its STAC catalog. For a new release, the command runs
`../overturist/overturist.ts get` with the stable Hong Kong division id and the dataset
theme, staging the result before copying it to
`data/overture/{release}/divisions/China/Hong Kong`. That retained Parquet is the source
artefact for the SaanSeoi release: it is copied to managed R2 storage with a
source-release-specific filename, checksum and manifest, then made available through the
Atlas asset endpoint.

CSDI datasets are different: `saanseoi update` reads every linked CSDI catalogue's
`Archived Dataset` list and selects the publisher's native delivery
(`sourceFormat: true`) for every available quarter. It never uses CSDI's converted
GeoJSON file API or WFS output as an input. The native archive and its manifest are
mirrored to the selected target's immutable storage; `--target local` uses the local
Wrangler R2 state, while `preview` and `production` use their respective remote R2
buckets. For example:

```sh
saanseoi update --dataset ds-hk-hkgov-hyd-street --target preview
```

Every CSDI source object is retained as an immutable ZIP in R2. Publisher ZIPs are
copied byte-for-byte; a non-ZIP delivery is losslessly wrapped in a ZIP. The paired
manifest records the source URL, CSDI release slot, original filename and digest,
archive digest, package contents, and—when native parsing succeeds—schema and semantic
fingerprints. The source ZIP is content-addressed at the publisher-dataset level, so an
identical delivery in more than one CSDI archive slot is registered only once; each slot
retains its own provenance manifest. The immutable objects use this layout:

```text
by-source/hk/hkgov-csdi/{dataset-id}/
  {source-sha256}-source.zip       # shared by identical archive slots
  {manifest-sha256}-manifest.json  # records the individual archive slot
```

The catalogue URL's final hash is a CSDI object identifier, not an asserted digest of
the response bytes. Local download and prepared-archive paths include that identifier,
so a revised object in the same quarter cannot reuse stale cached bytes. SaanSeoi
calculates the publisher-byte and prepared-archive SHA-256 values separately and records
them in the manifest. Downloads are restricted to CSDI's official HTTPS archive origin,
including after redirects, and use time and compressed-size limits. ZIP metadata is
validated for safe member names, entry count, expanded size, per-entry size and
compression ratio before publisher members are decompressed.

Each retained source object is registered as a managed source asset and Atlas API serves
its public download at `/v0/assets/{asset-id}`; there is no public R2 bucket listing.
Archives and retained source Parquet are publisher evidence, while SaanSeoi's
database-backed datasets are the product. Processing intermediates remain local-only and
transient. Schema fingerprints are retained in release ingest metadata.

Mirroring an archive does not itself publish a SaanSeoi dataset release. The source
release policy is to compare native schema and semantic fingerprints in release order:
an initial baseline or any geometry, attribute, feature, or schema change warrants a
back-dated SaanSeoi release and notes; an identical redelivery remains provenance only.
CSDI archive quarters are provenance slots, not dataset versions by default. The updater
displays a fixture's explicit source version when one is configured, and otherwise
leaves the version blank. A dataset with the explicit `quarterly` version policy is the
exception: its archive quarter establishes the release base as `vYYYY-Qn.0`; a changed
publisher object in that same quarter increments the correction suffix (`vYYYY-Qn.1`,
then `.2`, and so on).

The C&SD District Land Area, Population and Density dataset has an additional local
ingestion stage after its mapped archive is available. It prepares the native
`Density_2022.gml` or `Density_2024.gml`, writes the raw publisher assertion to the
source shard, and writes the canonical Division Statistics observation to the history
shard. Its source version remains the `PERIOD` reference year; the CSDI archive quarter
is provenance only. Run either explicit release with:

```sh
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2022
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2024
```

Dataset fixtures retain `schemaSpecificationURL` when the publisher provides a source
schema. A missing value is explicit (`null`) rather than an inferred schema claim. CSDI
simplified data specifications are publisher references, separate from SaanSeoi's own
source-schema version labels.

The update report collapses already-current CSDI archive slots into one row per source
release. The updater still retains and checks state for every archive slot; a newly
changed publisher object remains visible as an actionable update.

The LandsD street-name backfill is staged maintainer-only DataOps work. Preserve and
parse the baseline, LandsD notices from 22 January 2016 onward, and the official
e-Gazette notices from 19 May 2000 through 21 January 2016 separately. Then assemble the
three stages once into the immutable street snapshot:

```bash
bun run dataops -- hkgov-landsd-streets:baseline --target local|preview|production
bun run dataops -- hkgov-landsd-streets:landsd-notices --target local|preview|production
bun run dataops -- hkgov-landsd-streets:official-egazette --target local|preview|production
bun run dataops -- hkgov-landsd-streets:assemble --target local|preview|production
```

The stage artefacts and the final assembly must use the same target because their
managed evidence-asset IDs are target-specific. The assembler is the only command that
publishes a street release, snapshot revision, and cursor update. Later
`saanseoi update --download` runs read the Government Notices table and write only
notice rows not present in the saved source cursor, together with generated Markdown
notes and local WebP plan conversions. `lastUpdated` in the dataset fixture is the
checked-in bootstrap baseline; the live cursor belongs in the ignored update-state file.

For a remote target, the latest published LandsD source version is also a chronological
high-water mark. A partial or stale local notice-ID cursor cannot enqueue notices at or
before that release: the updater refreshes its cursor from the publisher pages and
offers only later publication-date batches. When more than one later batch exists, each
successful ingest becomes the comparison baseline for the next one; the confirmation
prompt names its position in that sequence and the preceding target version. The target
is authoritative, so a cursor advanced while updating another environment never hides a
later batch from the selected target.

When `--target` is supplied, the updater first queries that SaanSeoi environment's
`/v1/reports/releases` endpoint for each dataset. The returned latest release is used as
the comparison baseline, so `NEW` and `SAME` describe what that target already knows
rather than only what is present in the local checkout. Each row finishes with `-`, `x`,
or `✓`, the status gutter, and the latest source version reported by the target.

If the target has been reset and the report contains no releases, the empty target is
treated as authoritative. This causes previously checked local source versions and
retained CSDI archive slots to be re-materialised. Bootstrap a remote environment by
selecting the family and allowing downloads/uploads without prompts:

```sh
saanseoi update --target production --api-family divisions --download --yes
```

The same command is safe to rerun after an interrupted bootstrap; the target release
report becomes the comparison baseline and completed releases are not re-published.

Every dataset fixture defines a `versionPolicy`. The policy describes how the updater
reads a version from the dataset's optional `releases` metadata:

- `reference-year` uses a year-based reference period, such as `2021.0`.
- `initial-release-date` keeps the first release date as the version base when a later
  delivery is a correction.
- `reference-date` uses the data's effective/reference date as the version base.
- `release-date` uses each delivery's publication date as the version base.
- `upstream` preserves the provider's version format.

`releaseField` names the release-metadata field that supplies the version, such as
`sourceVersion` or `referenceYear`. This is important when a publisher's catalogue
revision describes its latest service revision rather than the census year represented
by the data. `publisherLastRevisedAt` on a release is tracked as the publisher-release
signal; it is distinct from `metadataLastRevisedAt`.

`correctionSuffixSource` declares who owns a correction suffix: `generated` means
SaanSeoi assigns `.0` to the initial delivery and increments it (`2021.1` or
`2026-07-23.1`) when a delivery with the same version base changes; `upstream` means the
publisher's full version, including any suffix, is retained verbatim; and `none` means
no suffix is used. `initial-release-date` is the exception for generated suffixes: when
the source reports a later revision date, the original date is retained and only the
correction suffix changes. The concrete `sourceVersion` and `cohortKey` belong to each
release manifest under `fixtures/meta/releases`; the dataset fixture's `releases` array
maps the live publisher metadata to that known release series. Update state separately
records `releaseLastRevisedAt` and `metadataLastRevisedAt`. A changed release revision
is a new-release candidate, while a metadata-only revision is reported as `REVIEW` and
prompts the operator to investigate the source before publishing.

Every fixture defines a `releasePolicy`, which separates source discovery into three
phases with separate state in `.local/harbour/update-state.json`:

- `newReleases` finds new head releases or performs an initial cohort intake.
- `revisions` checks the correction scope allowed by the publisher.
- `archives` enumerates historical publisher artefacts independently of the first two
  phases, either periodically or after a specified discovery event.

Each phase uses a trigger rather than only a fixed cadence: `periodic`,
`after-latest-release-age`, `initial-only`, `on-discovery`, or `never`.
`after-latest-release-age` supports release cliffs such as Overture's daily polling
after 25 days. `on-discovery` can run on a newly found release, a revision, and/or the
initial download, which lets bounded archives recover an intermediate release missed
between updater runs. `--check-now` bypasses due intervals but never a policy explicitly
set to `never`. `--force-download` also checks immediately and ignores a cached
download; combine `--force-upload` with `--check-now` to reprocess a staged upload
outside its normal schedule.

Archive metadata records whether availability is `none`, `limited`, or `full`, plus the
entry URL and reusable discovery operation where automated access exists. Once an
archive package has been downloaded, the updater compares its publisher-byte hash with
the known artefacts for that source release. A match is saved as an
`verifiedIdenticalArchiveSlots` fixture entry, so the same archive object is not made
actionable again.

The console collects due source discoveries before processing them, then renders the
actionable results under `NEW RELEASES`, `NEW REVISIONS`, and `ARCHIVES`. A source
adapter may expose an archive catalogue while checking a release or revision; its
archive packages are processed only when the archive policy itself is due or its
configured discovery event occurs.

When a logical dataset has multiple publisher catalogue records, each `releases[]` entry
may provide its own `sourceUrl`. Check state is stored independently for each source
version, so adding a new source URL makes that release eligible immediately.
`publisherReleaseFrequency` records the publisher's literal catalogue metadata when it
differs from SaanSeoi's normalized `releaseFrequency`; it does not control checking.

Datasets without a safe machine-readable release lookup are printed as `manual` with
their catalogue URL. This includes planned datasets whose source contract has not yet
been implemented; the command does not pretend that an unchanged catalogue page is a new
release.
