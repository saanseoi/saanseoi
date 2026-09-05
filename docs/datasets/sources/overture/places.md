# Overture Places

Overture Places are ingested from the monthly `place` reference-data parquet layer. The
accepted source contract is versioned in `libs/core/src/sourceRecordSchemas.ts` and
includes the publisher geometry, multilingual names, categories, contact fields, brand
data, source references, and operating status. The release windows reflect the upstream
additions: `basic_category` is added in 2025-10-22.0 and `taxonomy` in 2025-12-17.0. The
upload validator accepts these known additive transitions while continuing to reject
unrelated drift.

The normaliser requires a Point geometry and preserves the raw publisher payload in
`overturePlaces`. It converts the multilingual `names`, `brand.names`, and address
`freeform` values into PlaceI18n rows using script-aware locale resolution. Locale-less
values are marked as inferred, and conflicting explicit labels are recorded with their
source values in release audit actions. Source values and variants are not replaced with
AI translations.

Overture `id` values are validated against the Overture GERS Registry rather than being
classified from their UUID shape. Harbour caches the registry evidence for the Division
and Place IDs in `.local/harbour-sql/gers-registry/cache.json`. The cache stores the
registry history and release path for each match, and records unmatched IDs explicitly.
Refresh it and print the coverage report with:

```sh
./bin/saanseoi cache:gers --require-gers
```

The complete publisher `addresses` value is included in the source record. A localised
`freeformAddress` is materialised on the matching PlaceI18n row; the public Place object
does not expose an `addresses` field. The structured `address.freeform`,
`address.locality`, `address.country`, `address.region`, and `address.postcode` values
remain in `rawProperties`; they are observational source values and are not
authoritative inputs to any parsed canonical field or relationship.

Overture address identifiers are not treated as SaanSeoi ALS identifiers and are ignored
for Place-to-address matching. Place ingestion parses the address `freeform` value
against the English and Traditional Chinese definitions in the selected ALS snapshot.
The conservative first pass requires a building number and known street, expands common
English street abbreviations, and understands Arabic and common Chinese number forms.
Shop, unit, room, floor, stall, and similar address3d fragments are separated before the
address2d match. They are retained by the parser for future address3d matching but do
not affect today's canonical relationship. A tied match remains unresolved. Locality,
country, region, and postcode are not used for that match. The selected ALS snapshot is
the compatible reference dataset recorded in the Places snapshot provenance. A later
release does not silently replace that historical selection with today's latest address
snapshot. The selected ALS address relationship remains separate and authoritative.

Places with `CN` or `MO` address country codes are excluded from the Hong Kong
projection. Places with a missing country code remain included. Both cases are recorded
as one `overture_place_country_review_required` action per Place in the release Audit.
Ingestion stops with a warning if any Place contains more than one publisher address.
The warning requires reconsideration of the Place-to-address implementation before the
release can be materialised.

Machine translation of Place names and free-form addresses is disabled. Publisher
localisations are preserved as supplied or inferred from their script; Harbour does not
fill a missing PlaceI18n value through Azure. Known non-premise address observations are
kept for review in `fixtures/review/overture-place-addresses.json`, with the Place name
and source record ID alongside the free-form value.

`referenceName` is a deterministic response projection over PlaceI18n rows. It is not
stored as a synthetic locale and is not counted as locale coverage.

Each canonical place receives H3 cells at resolutions 5, 7, and 9. The H3 index supports
the Places `by-cell` API and is rebuilt with the current place snapshot. The
`placesDivision` projection is likewise current-only and is derived from the selected
address row's division snapshot and IDs. The full-text index is rebuilt after the
snapshot and its address, division, and street joins have been materialised.

## ZH-HANT

Overture Places 的 `names`、`brand.names` 及地址 `freeform`
會按腳本獨立解析並保留來源值。未標記漢字在香港資料中通常推斷為
`zh-hant`；這代表繁體中文腳本，不代表粵語。衝突的語言標籤及來源值會記錄在發布審核動作中，混合腳本不會自行拆分。公開 Place 不再提供
`addresses`，自由格式地址會放在 PlaceI18n 的
`freeformAddress`；選定的 ALS 關係仍然獨立且具權威性。地點名稱、品牌及自由格式地址均不使用機器翻譯。

## ZH-HANS

Overture Places 的 `names`、`brand.names` 及地址 `freeform`
会按脚本独立解析并保留源值。未标记汉字在香港资料中通常推断为
`zh-hant`；这代表繁体中文脚本，不代表粤语。冲突的语言标签及源值会记录在发布审核动作中，混合脚本不会自行拆分。公开 Place 不再提供
`addresses`，自由格式地址会放在 PlaceI18n 的
`freeformAddress`；选定的 ALS 关系仍然独立且具权威性。地点名称、品牌及自由格式地址均不使用机器翻译。
