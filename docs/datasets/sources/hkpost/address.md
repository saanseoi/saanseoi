# HKPost Address

This document tracks HKPost as a prospective address source.

Related family doc:

- [Address family](../../families/address.md)

## Current Status

- HKPost is not part of the current bulk upload pipeline.
- There is no worker ingestion path for HKPost data yet.

## Source

- Addressing interface:
  - `https://webapp.hongkongpost.hk/correct_addressing2/index.html?lang=en`

## Intended Use

HKPost is a likely future input for:

- address normalization checks
- 3D unit or floor enrichment
- user-facing formatting validation

## Current Blocker

- the richer HKPost data is exposed through application endpoints rather than a straightforward raw monthly bulk export

## Likely Future Relationship

If adopted, HKPost would most likely sit closer to:

- address validation
- 3D enrichment
- formatting normalization

than to the current 2D base-address snapshot flow used by Overture and HKGov ALS.
