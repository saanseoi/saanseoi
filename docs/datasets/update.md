# Dataset update checks

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
`data/overture/{release}/divisions/China/Hong Kong`.

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

Every source object is retained as an immutable ZIP in R2. Publisher ZIPs are copied
byte-for-byte; a non-ZIP delivery is losslessly wrapped in a ZIP. The paired manifest
records the source URL, CSDI release slot, original filename and digest, archive digest,
package contents, and—when native parsing succeeds—schema and semantic fingerprints. The
immutable objects use this layout:

```text
by-source/hk/hkgov-csdi/{dataset-id}/{release-slot}/
  {source-sha256}-source.zip
  {manifest-sha256}-manifest.json
```

Each immutable object is registered as a managed source asset and Atlas API serves its
public download at `/v0/assets/{asset-id}`; there is no public R2 bucket listing.
Archive ZIPs are publisher evidence, while SaanSeoi's database-backed datasets are the
product. Intermediate Parquet is local-only and transient: it is never uploaded to R2 or
retained in release metadata. Schema fingerprints are retained in release ingest
metadata.

Mirroring an archive does not itself publish a SaanSeoi dataset release. The source
release policy is to compare native schema and semantic fingerprints in release order:
an initial baseline or any geometry, attribute, feature, or schema change warrants a
back-dated SaanSeoi release and notes; an identical redelivery remains provenance only.

The LandsD street-name dataset is a two-stage source. Run
`bun scripts/prepare-landsd-street.ts` once against the complete gazetted PDF to create
the initial Parquet release. Later `saanseoi update --download` runs read the Government
Notices table and write only notice rows not present in the saved source cursor,
together with generated Markdown notes and local WebP plan conversions. `lastUpdated` in
the dataset fixture is the checked-in bootstrap baseline; the live cursor belongs in the
ignored update-state file.

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

`correction` indicates whether a changed delivery for the same version base receives the
next correction suffix (`2021.1` or `2026-07-23.1`). `initial-release-date` is the
exception: when the source reports a later revision date, the original date is retained
and only the correction suffix changes. The concrete `sourceVersion` and `cohortKey`
belong to each release manifest under `fixtures/meta/releases`; the dataset fixture's
`releases` array maps the live publisher metadata to that known release series. Update
state separately records `releaseLastRevisedAt` and `metadataLastRevisedAt`. A changed
release revision is a new-release candidate, while a metadata-only revision is reported
as `REVIEW` and prompts the operator to investigate the source before publishing.

Fixtures may also define an `updatePolicy`:

- `allowUpdates` defaults to `true`; set it to `false` when the source is intentionally
  frozen and should no longer be queried.
- `checkFrequency` may be `daily`, `weekly`, or `monthly`, and defaults to `daily`. The
  updater records the last check in `.local/harbour/update-state.json` and does not
  query a source again before its interval expires. `--force` or `--check-now` bypasses
  this throttle.

When a logical dataset has multiple publisher catalogue records, each `releases[]` entry
may provide its own `sourceUrl`. Check state is stored independently for each source
version, so adding a new source URL makes that release eligible immediately.
`publisherReleaseFrequency` records the publisher's literal catalogue metadata when it
differs from SaanSeoi's normalized `releaseFrequency`; it does not control checking.

Datasets without a safe machine-readable release lookup are printed as `manual` with
their catalogue URL. This includes planned datasets whose source contract has not yet
been implemented; the command does not pretend that an unchanged catalogue page is a new
release.
