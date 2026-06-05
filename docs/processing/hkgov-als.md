# HKGov ALS

The Hong Kong government ALS address export is a first-class source for Harbour address processing.

## Sources

- Structured address schema:
  - https://www.digitalpolicy.gov.hk/en/our_work/data_governance/policies_standards/interoperability_framework/doc/common_schemas/structured_address_v1_0.xsd
- Current bulk export source:
  - https://static.csdi.gov.hk/csdi-webpage/download/common/e5f7fd41bda5a9327bb91ed531ac4c2a8ef954d21049c1979c5520a4976152fb

## Current Scope

- Only the 2D district GeoJSON exports are prepared in the current pass.
- `als_addresses_3d_(public_rental_housing).geojson` is explicitly deferred.
- Preparation is done locally with `apps/harbour-cli` before upload.
- The prep command combines the district GeoJSON files into a single parquet file for a monthly dataset upload.

## Preparation

- Command:
  - `bun --cwd apps/harbour-cli ./src/cli.ts prepare-hkgov-als <source-dir> --out <file> --month YYYY-MM --source-version YYYY-MM-DD.NN [--env dev|preview|production] [--db /path/to/local.sqlite]`
- The command:
  - skips the 3D export for now
  - reads all 2D district GeoJSON files
  - flattens the structured address payload into upload-friendly parquet columns
  - stores both localized premises address objects as JSON payload columns
  - extracts structured localized address elements for `en` and `zh-hant`, including:
    - formatted address
    - building name
    - building number from
    - building number to
    - block type
    - block number
    - block type before number
    - phase name
    - phase number
    - estate name
    - street number
    - street name
  - resolves `areaId`, `districtId`, and level-0 `countryId` from the divisions database matching the selected environment, then reuses those ids for every row
  - stores `BuildingCsuInformation.CsuId` or `GeoAddress` in `identifiersJson.hkgovCsuId`

## Environment Mapping

- `--env dev`
  - reads from the local preview D1 database state
- `--env preview`
  - reads from the remote preview D1 database
- `--env production`
  - reads from the remote production D1 database
- `--db`
  - overrides the environment-based lookup and reads from the specified SQLite file directly
- If the selected database does not yet contain the seeded China PRC level-0 division, `countryId` is left null in the prep parquet while `areaId` and `districtId` are still resolved.

## Address Modeling Intent

- `hkgov-als` is richer than Overture and is intended to supply:
  - localized address text
  - estate and building names
  - street number ranges
  - government address identifiers
- Overture and `hkgov-als` are both retained as sources.
- The current direction is:
  - Overture supplies broad 2D address coverage and source lineage.
  - `hkgov-als` supplies the richer Hong Kong-specific address structure.

## Notes

- The current local prep output is a staging format for upload, not the final published `address2d` row shape.
- `countryId` is intended to point at the seeded China PRC level-0 division immediately.
- Hong Kong SAR remains a separate level-0 SAR division within the broader hierarchy.

## TODO

- Build the 3D enrichment step that derives `address3d` rows from uploaded 2D addresses.
- Base that enrichment on:
  - `hkgov-als` 3D data
  - HKPost addressing data
- This is deferred because the richer 3D inputs are exposed through APIs rather than raw bulk downloads.
- Generate selection structures from the available structured address elements so downstream ingestion can consistently populate the final `address2dI18n` shape.
