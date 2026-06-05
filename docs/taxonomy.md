# Divisions

## Levels 

- `0` - SAR, e.g. Hong Kong SAR, Macao SAR
- `1` - Area | City, e.g. Kowloon, Hong Kong Island, New Territories
- `2` - District, e.g. Yau Tsim Mong
- `3` - Town, e.g. Tuen Mun, Yuen Long, Tai Po
- `4` - Marcrohood, e.g. Mong Kok, Shek Mun
- `5` - Neighbourhood | Village, e.g. Prince Edward
- `6` - Microhood | Hamlet, e.g. 30 Houses

- All levels can contain none, one or more divisions of a lower level
- No level will contain any division of the same level
- All levels smaller than 2 (District) are optional for the hierarchy chain 
- All levels of 3 or below MUST have at least 1 district it is within
- All levels of 2 have exactly 1 Area they are within
- All levels of 1 have exactly 1 SAR they are within
- Typically a Microhood will either have a Macrohood or a Neighbourhood as parent 

### Mapping overture PlaceType to Level

See Overture [docs](https://docs.overturemaps.org/guides/divisions/#subtype-descriptions) for definitions.

First based on `subtype`, then on `class`

- ~~`country`~~ -> 0
- `dependency` -> 0 (SAR)
- ~~`macroregion`~~ -> 1
- `region` -> 2 (District)
- ~~`macrocounty` -> 2~~
- ~~`county` -> 2~~
- ~~`localadmin` -> 2~~
- `locality`
  - `city` -> 1 (Area|City)
  - `town` -> 3 (Town)
  - `village` -> 5 (Neighbourhood | Village)
  - `hamlet` -> 6 (Microhood | Hamlet)
- ~~`borough` -> 3~~
- `macrohood` -> 4 (Macrohood | Town)
- `neighborhood` -> 5 (Neighbourhood | Village)
- `microhood` -> 6 (Microhood | Hamlet)

We need to add `Areas`:
- New Territories
