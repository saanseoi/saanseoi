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
