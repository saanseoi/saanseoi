# Overture

The following are the processing notes on how the overture source data is processed.

## Common

- Locale tags are normalized to lowercase BCP 47-like forms, with underscores converted to hyphens.
- The source locale `zh` is stored as `zh-hant`; no separate `zh` i18n row is kept.
- When Overture does not provide an explicit locale, the worker may infer one from unlabeled text and marks the resulting row with `isLocaleInferred = true`.
  - Unlabeled Chinese-only names are inferred as `zh-hans`.
  - Unlabeled Latin alphanumeric names are inferred as `en`.
  - Mixed-script names in the form `<Chinese> <Latin>` are split at the first whitespace boundary into `zh-hant` and `en` values.
- `otNameAlts` is a pipe-separated list of alternative names for the same locale and division. `otNameVariantJson` is the JSON array containing `otName` followed by the alternative values so the canonical name and search-oriented variants stay available in both structured and flat forms.
- `{datasetType}.names.rules` values are retained in `otNameRulesJson` as an array of `{ "variant", "value" }` objects per locale row to preserve Overture lineage while still folding usable text into `otName`, `otNameAlts`, and `otNameVariantJson`.
- Locale-less `rules.value` and `rules.variant` text is split with the same inference rules as `names.primary`, deduplicated against the locale’s canonical name, and appended as alternatives when applicable.

## Divisions

The `division` is normalised into `divisions` and `divisionsI18n` where each `locale` has an entry per `divisionId`.
- Division levels follow the taxonomy in `docs/taxonomy.md`, with Overture subtype/class mapped as: `dependency -> 0`, `region -> 2`, `locality.city -> 1`, `locality.town -> 3`, `locality.village -> 5`, `locality.hamlet -> 6`, `macrohood -> 4`, `neighborhood -> 5`, `microhood -> 6`.
- A taxonomy-facing lowercase `type` is also stored on `divisions` and `divisionsVersions`: `sar`, `area`, `district`, `town`, `macrohood`, `neighbourhood`, `village`, `microhood`, `hamlet`. `locality.city` maps to `area`, `region` maps to `district`, and Hong Kong area names still map to `area`.
- Hong Kong area names `Hong Kong Island`, `Kowloon`, and `New Territories` are preserved as level `1` areas even when Overture labels them as `region`.
- `hierarchies` is stored in both `otHierarchyJson` and `hierarchyJson`. The former retains the hierarchy determined by overture, the latter provides a more explicit hierarchy based on local knowledge.
- `geometry` is decoded from Overture WKB and stored as GeoJSON text in `otGeometryJson`.
- `population` is stored as `otPopulation`.
- `sources` is stored in `sourcesJson` wrapped as `{ "overture": ... }` so downstream consumers can distinguish Overture lineage from other source-specific payloads.
- The following Overture division fields are dropped:
  - `admin_level`: dropped because Harbour standardizes on taxonomy-derived `level` and `type` values instead of persisting raw Overture admin-level lineage.
  - `capital_division_ids`: dropped because the Hong Kong dataset only uses it sparsely and it is not meaningful enough for current SAR-focused use cases.
  - `capital_of_divisions`: dropped because the Hong Kong dataset only uses it sparsely and it is not meaningful enough for current SAR-focused use cases.
  - `country`: dropped because Harbour only processes SAR datasets within China, so the value is not useful at the row level.
  - `norms`: dropped because the field is too undifferentiated in current SAR datasets to justify row-level storage.
  - `region`: dropped because it is null throughout the Hong Kong division dataset.
  - `theme` and `type`: dropped at the row level because dataset-level metadata already records them.

## Addresses

- Overture `address` rows remain part of the Harbour address strategy alongside `hkgov-als`.
- For the first address pass, Overture is intended to contribute:
  - `id` -> Harbour `address2d.id` using the GERS UID directly.
  - `geometry` -> GeoJSON point text in `geometryJson`.
  - `bbox` -> `otBboxJson`.
  - `street` -> `otStreet`.
  - `number` -> `otNumber`.
  - `version` -> `otVersion`.
  - `sources` -> `sourcesJson` as `{ "overture": [...] }`, with null and empty source object properties removed.
- District matching for Overture HK addresses is intended to use the second `address_levels` entry against the English `divisionsI18n.otName` of the level-2 district rows.
- Overture address uploads are still expected to land before any `hkgov-als` enrichment layer is applied.
