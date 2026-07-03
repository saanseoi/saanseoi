# Overture Division

This document describes the Overture-specific side of the division pipeline.

Related docs:

- [Division family](../../families/division.md)
- [Division resourceType](../../resourceType/division.md)
- [ResourceType common processing](../../resourceType/common.md)

## Dataset Role

- Dataset metadata uses `publisherCode: overture`, `code: hk-division`.
- `saanseoi upload` now processes division parquet locally, generates SQL artifacts, and imports them into D1.
- The local SQL upload path is `apps/harbour-cli/src/lib/divisionSql/processLocalDivisionSqlUpload.ts`.
- For `--target local`, upload registration is written directly to the local
  SQLite meta DB; the parquet is copied into the `.local/harbour-sql` release
  workspace instead of being multipart-posted through the local Worker.
- Shared normalization and current/history diff semantics live in `libs/core/src/pipeline/services/division.ts`.
- Overture is currently the only division source in the pipeline.

## Locale and Name Normalization

Division i18n rows are built from mixed Overture name fields.

Current behavior:

- locale tags are normalized to lowercase BCP 47-like forms
- underscores are converted to hyphens
- source locale `zh` is stored as `zh-hant`
- locale-less text may be inferred and marked with `isLocaleInferred = true`
- source retention keeps those normalized source-style locale tags
- canonical current/history division snapshots also add API-facing locale rows for:
  - `en`
  - `zh-hant`
  - `zh-hans`
- those canonical rows are filled from preferred source variants when present:
  - `zh-hant` prefers `zh-hk`, then `zh-hant`, then `zh-mo`, then `zh-tw`
  - `zh-hans` prefers `zh-hans`, then `zh-cn`, then `zh-sg`
- Atlas request-time locale filters are matched case-insensitively after lowercasing input

Inference rules currently implemented:

- unlabeled Chinese-only names are inferred as `zh-hans`
- unlabeled Latin alphanumeric names are inferred as `en`
- mixed-script values in the form `<Chinese> <Latin>` are split into `zh-hant` and `en`

The local pipeline builds localized name state from:

- `names.primary`
- `names.common`
- `names.rules`
- `local_type`

Stored i18n fields mean:

- `name`: canonical value for the locale
- `nameAlts`: pipe-joined alternative values
- `nameVariant`: JSON array containing `name` followed by alternatives
- `nameRules`: JSON array of `{ value, variant }` rule records retained from Overture

Current storage boundary:

- source tables keep raw normalized source locales
- canonical current/history tables keep both:
  - raw normalized source locales
  - canonical API locales used by Atlas default responses

## Type and Level Mapping

Harbour derives taxonomy-facing `level` and `type` rather than storing Overture admin lineage directly.

Important current mappings:

- `dependency -> level 0`, `type sar`
- `region -> level 2`, `type district`
- `locality.city -> level 1`, `type area`
- `locality.town -> level 3`, `type town`
- `locality.village -> level 5`, `type village`
- `locality.hamlet -> level 6`, `type hamlet`
- `macrohood -> level 4`, `type macrohood`
- `neighborhood -> level 5`, `type neighbourhood`
- `microhood -> level 6`, `type microhood`

Hong Kong-specific override:

- `Hong Kong Island`, `Kowloon`, and `New Territories` are preserved as `level 1` `area` rows even if Overture labels them as `region`

Fallback behavior:

- if subtype/class/admin-level hints are incomplete, Harbour derives `type` from the resolved coarse level

## Geometry and Hierarchy Normalization

Current handling:

- if `geometry` is already GeoJSON-shaped, it is used directly
- otherwise the local uploader decodes Overture WKB into GeoJSON
- `hierarchies` is normalized into `hierarchy`
- singleton nested list wrappers produced by parquet decoding are unwrapped

## Local SQL Upload Phases

Division uploads follow the shared local SQL lifecycle documented in
[ResourceType common processing](../../resourceType/common.md). The
division-specific generated artifacts are:

- normalize parquet rows into canonical division records and source-retained rows
- generate `source` SQL for `overtureDivisions` and `overtureDivisionI18n`
- generate `history` SQL for canonical version tables in the history shard
- generate `current` SQL, including optional snapshot clone SQL when a published predecessor exists
- generate `stats` SQL for dataset-level rows in `meta.stats`

## Source Fields Retained

The current canonical and source-retained subset includes:

- `id`
- `parent_division_id`
- `subtype`, retained canonically under `sourceKeys.overture.subtype`
- `class`, retained canonically under `sourceKeys.overture.class`
- `population`
- `wikidata`
- `geometry`
- `bbox`
- `hierarchies`
- `cartography`
- `sources`
- `names`
- `local_type`
- `version`

## Fields Dropped or Not Persisted Directly

Current notable dropped fields:

- `capital_division_ids`
- `capital_of_divisions`
- `country`
- `norms`
- `region`
- row-level `theme`
- row-level `type`

Reason in practice:

- Harbour stores derived taxonomy-facing `level` and `type`
- raw `admin_level` is retained only in source storage, not as a canonical field
- sparse or low-value source fields are not currently worth persisting
- dataset-level metadata already carries `theme` and dataset `type`

## Source Retention

Overture-specific source rows are retained in:

- `overtureDivisions`
- `overtureDivisionI18n`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Current retained source fields include:

- `sourceRecordId`
- `versionHash`
- `releaseId`
- `validFromRelease`
- `validToRelease`
- `isCurrent`
- `admin_level`
- `subtype`
- `class`
- `population`
- `version`
- `wikidata`
- `geometry`
- `bbox`
- `hierarchies`
- `cartography`
- `sources`
- `rawProperties`

Localized source retention stores:

- `name`
- `nameVariant`
- `nameAlts`
- `nameRules`
- `isLocaleInferred`
