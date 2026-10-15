# Dataset update checks

For the complete source-addition workflow, including the DataOps and upload hand-offs,
see the [dataset pipeline](pipeline.md).

`saanseoi update` checks dataset fixtures outside the paused Streets family in
`fixtures/meta/datasets` against their registered upstream source adapter. It prints the
latest upstream version when one is available and records the source cursor and last
check time in `.local/harbour/update-state.json`.

Use `--dataset CODE[,CODE...]` to narrow the check. New downloadable artefacts are
offered interactively; `--download` downloads them without asking. Downloads are written
below `data/`, which is intentionally ignored by Git.

```sh
saanseoi update
saanseoi update --dataset ds-hk-overture-division --download
```

## Explicitly skipped releases

Record an exact publisher version and a non-empty reason in the affected dataset
fixture's `skippedReleases` array:

```json
{
  "skippedReleases": [
    {
      "sourceVersion": "2026-09-23.1",
      "reason": "This patch does not affect the data ingested by SaanSeoi."
    }
  ]
}
```

Run `bun run rehash:fixture datasets/<fixture>.json` after editing the fixture.
Decisions apply to that dataset on every target. `saanseoi update` prints the skipped
version and full reason, excludes it from downloads, archive mirroring and ingestion,
and leaves the published target version unchanged. `--check-now`, `--force-download` and
`--force-upload` honour the decision. Remove the decision to make that version eligible
again.

Overture discovery selects the newest eligible catalogue version for ingestion even when
a newer patch is skipped. Other historical versions retain their archive role; skipped
versions do not consume the minimal initialisation sample. The Hong Kong Places and
Divisions fixtures explicitly skip `2026-09-23.1` because it does not affect the data
ingested by SaanSeoi. These decisions govern `update`; direct upload and source-specific
initialisation commands have their own release selection.

## Source discovery

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
saanseoi update --dataset ds-hk-hkgov-pland-division-pu --target preview
```

Every CSDI source object remains available as an immutable ZIP in R2. Publisher ZIPs are
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

Each source object is registered as a managed source asset and Atlas API serves its
public download at `/v0/assets/{asset-id}`; there is no public R2 bucket listing.
Archives and source Parquet are publisher evidence, while SaanSeoi's database-backed
datasets are the product. Processing intermediates remain local-only and transient.
Schema fingerprints are retained in release ingest metadata.

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
`Density_2022.gml` or `Density_2024.gml`, writes the raw publisher source record to the
source shard, and writes the canonical Division Statistics observation to the history
shard. Its source version remains the `PERIOD` reference year; the CSDI archive quarter
is provenance only. Run either explicit release with:

```sh
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2022
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2024
```

Dataset fixtures retain `schemaURL` when the publisher provides a source schema. A
missing value is explicit (`null`) rather than an inferred schema claim. CSDI simplified
data specifications are publisher references, separate from SaanSeoi's own source-schema
version labels.

The update report collapses already-current CSDI archive slots into one row per source
release. The updater still retains and checks state for every archive slot; a newly
changed publisher object remains visible as an actionable update.

Streets updates are paused. The family picker and `all` selection exclude every Streets
dataset, including HyD, TD, LandsD road centrelines, the gazetted street-name register
and DPang. Explicit `--api-family streets`, `--scope streets` and Streets `--dataset`
selections stop with an explanation before discovery or ingestion. Maintainer street
commands remain separate from the updater.

SaanSeoi's own Division dataset is produced internally. Its monthly edition is due on 1
January, 1 February, and so on, in `Asia/Hong_Kong`, conditional on the required
publisher inputs and curation decisions being available. A delayed run must retain the
first-of-month edition date. The assembler requires a Protomaps extraction from that
same month and selects eligible publisher pins on or before the edition date.

Automatic monthly production is not wired into `saanseoi update`. The updater reports
that separately and performs no upstream source check for SaanSeoi, including with
`--check-now`. Use the existing explicit assembly and initialisation workflows for
reviewed editions.

Reviewed publisher inputs use their checked-in `releases` lists:

- Protomaps island inputs use the exact hash-verified archive pins in the Division
  review and publication inputs. Prepare and pin an extraction before registering its
  version; a basemap date alone does not identify an extraction revision.
- RVD uses the official Property Review appendix and the native PDF extraction importer,
  retaining the PDF and extracted records as source evidence.

These checks do not invent editions or advance reviewed pins. A missing retained archive
produces an actionable error; `SAANSEOI_REVIEW_ARCHIVE_URL` can supply the exact pinned
archive bytes. Existing newer reviewed editions suppress automatic historical replay;
use the relevant initialiser for a deliberate rebuild.

```sh
saanseoi update --target local --api-family all --download --yes
```

Selected datasets run in dependency order, with each provider's archive and release work
finishing before its consumers. `--with-dependencies` adds missing providers to an
explicit selection, including the reviewed Division ingredients. Without that flag, the
selected dataset set stays exact. A target report must confirm every declared resource
in a cohort before the dataset is considered complete; Overture Division outputs are
checked independently, and Places also requires its supplementary Address output. A
missing cohort bypasses the saved check interval so failed or declined intake can be
retried. An unavailable target report makes the run fail.

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

The console collects due source discoveries before processing them, then renders each
selected dataset in dependency order under `NEW RELEASES`, `NEW REVISIONS`, and
`ARCHIVES`. A source adapter may expose an archive catalogue while checking a release or
revision; its archive packages are processed only when the archive policy itself is due
or its configured discovery event occurs.

When a logical dataset has multiple publisher catalogue records, each `releases[]` entry
may provide its own `sourceUrl`. Check state is stored independently for each source
version, so adding a new source URL makes that release eligible immediately.
`publisherReleaseFrequency` records the publisher's literal catalogue metadata when it
differs from SaanSeoi's normalized `releaseFrequency`; it does not control checking.

Datasets without a safe machine-readable release lookup are printed as `manual` with
their catalogue URL. This includes planned datasets whose source contract has not yet
been implemented; the command does not pretend that an unchanged catalogue page is a new
release.
