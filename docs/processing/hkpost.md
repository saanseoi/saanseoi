# HKPost

HKPost is a prospective address enrichment source for Harbour.

## Source

- Addressing interface:
  - https://webapp.hongkongpost.hk/correct_addressing2/index.html?lang=en

## Intended Use

- HKPost is not part of the current bulk upload pipeline.
- It is a likely future input for:
  - address normalization checks
  - 3D unit or floor enrichment
  - user-facing formatting validation

## Notes

- The current blocker is source shape.
- Unlike the monthly `hkgov-als` GeoJSON export, the richer HKPost data is exposed through application endpoints rather than a straightforward raw bulk download.
