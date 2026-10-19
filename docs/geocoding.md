# Division and address geocoding

`GET /divisions/v1/geocode` resolves geographical membership.
`GET /addresses/v1/geocode` finds canonical structured addresses. Both use the public
API key, origin, quota and rate-limit rules of the other SaanSeoi data APIs.

Successful responses use JSON:API 1.1 with content type `application/vnd.api+json`.
`data` is always an array of `geocoding-results` resources. Each has a stable request or
candidate identity, `attributes`, and `relationships`. Related Division and Address
resources appear once in `included`. Validation errors return JSON:API `errors` with
status `422` and the query parameter; unavailable publications return `503` errors.

## Inputs and profiles

Supply exactly one of `lat` plus `lng`, `address`, or `placename`. Coordinates are WGS84
decimal degrees: latitude in `[-90, 90]`, longitude in `[-180, 180]`. Returned
coordinate pairs and GeoJSON use `[lng, lat]`. Empty, non-finite, out-of-range and mixed
inputs are rejected. Convert HK 1980 Grid coordinates to WGS84 first.

| Parameter     | Meaning                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `profile`     | `compact`, `default`, `map` or `full`; default is `default`                                      |
| `releaseSet`  | Exact retained release; omission selects the current compatible release                          |
| `locales`     | Requested locale tags; default `en,zh-hant`; `*` for all, `null` for no names                    |
| `limit`       | Forward or proximity candidates, 1–50; default 10                                                |
| `maxDistance` | Reverse address radius in metres, 0–50,000; default 1,000                                        |
| `include`     | `divisions` adds geographical membership to address results                                      |
| `geometry`    | `area` includes selected polygons without requiring the map profile; `saanseoi` is also accepted |

| Profile   | Detail                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `compact` | Status, ordered relationships, division IDs, levels and requested primary names                          |
| `default` | Compact detail plus match evidence, rank, coordinates, category and class                                |
| `map`     | Default detail plus selected division polygons and address point geometry                                |
| `full`    | Map detail plus name variants/rules, lookup diagnostics, separate dataset coverage and release snapshots |

Profiles do not change the selected identities or hierarchy. Missing geometry is not
invented from a label point. Named division label coordinates are marked `label`.

## Ordered hierarchy

Result relationships separate `administrative`, `locality`, `hood` and `landform`. Each
relationship's `data` is explicitly ordered from root to leaf. For the San Po Kong
example:

- Administrative: Hong Kong → Kowloon → Wong Tai Sin District.
- Locality: Kowloon (the distinct city identity).
- Hood: San Po Kong, level 5.

The administrative area and the locality city called Kowloon retain different IDs. A
locality city is not represented as a child of an administrative district merely because
both contain the query point. Follow the ordered relationship identifiers to the named
resources in `included`; those resources follow branch traversal order.

When a category has alternative paths, `relationships.<category>.meta.paths` retains
them. When complete ancestry has alternatives, result `meta.alternatives` also keeps the
categories correlated per branch. Do not combine unrelated alternatives to invent a new
ancestry. Ambiguity remains visible in every profile.

`attributes.status` is:

- `resolved`: this lookup has an unambiguous path and its required polygon evidence.
- `ambiguous`: competing paths, shared-boundary alternatives or unresolved ancestry.
- `incomplete`: geometry or records required by this lookup are missing, or no match can
  be established within the available partial coverage.
- `not_found`: no candidate in complete evaluated coverage.

Dataset-wide missing polygons do not make a fully evidenced lookup incomplete. With
`profile=full`, result `meta.coverage.missingAncestorIds` identifies missing geometry
for the lookup; `meta.datasetCoverage` separately reports the whole selected dataset.
For example, Austin, San Po Kong and Lamma Island resolve with no missing ancestors
although the dataset has other divisions without polygons.

## Geometry and evidence

Containment reads the release's published SaanSeoi DivisionArea snapshot, or its
Overture area companion when no SaanSeoi companion exists. Curated drawings override
island inventory polygons, which override Overture fallback during assembly. Requests do
not read editor fixtures. See the
[curated assembly contract](datasets/sources/saanseoi/divisionArea.md).

A request-scoped bounding-box prefilter excludes irrelevant polygons before exact
point-in-polygon tests. Multipolygon components are tested separately. Hole interiors
are excluded; outer and hole boundaries are included. Shared edges can match both
neighbours. The routine uses a `1e-12` cross-product collinearity tolerance in degrees.

Every stored ancestry branch is evaluated independently. A containing geometry is
positive evidence; a covered ancestor excluding the coordinate contradicts the branch.
Missing geometry is reported without inventing a boundary. Suppressed ancestors are
restored only through their own correlated branches and category projections. Cycles and
conflicting alternatives stay unresolved. More general paths represented entirely by a
more specific path are removed. Landform ancestry remains separate. Stable sorting never
chooses a winner between equally supported branches.

## Candidates and release identity

Division name ranking uses trimmed case-insensitive exact matches (1), prefixes (0.8)
and substrings (0.6), including alternative names. Scores identify match classes, not
probabilities.

Address queries first parse street names and building numbers. Parsing accepts common
English road abbreviations and directions, number ranges, Chinese street/number order,
and English street-first listings. Room, unit and floor labels do not become street
numbers. Letter suffixes are ignored when comparing numeric stems; a match for `139A`
therefore does not establish suffix-specific identity. Publisher strings remain intact.

Current publications use the numeric-stem index to retrieve parsed number candidates.
Exact street names and number intervals rank above locality-qualified names and
intersecting ranges. Same-parity ranges retain their street side. Building and estate
qualifiers improve rank; bare street addresses retain competing facilities. Locality
prefix/road-section matches are weaker interpretations, not verified street aliases.
Name normalisation handles punctuation and common building abbreviations; a leading
building word plus an acronym can match its expanded name, such as One IFC.

Unparsed queries try formatted and named components, then a broader normalised scan only
if the first pass finds no match. This fallback and retained-history replay can require
substantial reads. Missing or contradictory numbers never become numeric substring
matches. Multiple candidates remain ambiguous even when a limit hides an alternative;
`meta.total` and `meta.truncated` make this visible. Address-text division queries
retain separate address-location candidates.

Reverse addresses are canonical points within `maxDistance`, ordered by great-circle
distance after a latitude/longitude prefilter. `attributes.coordinates` locates the
candidate address and has `coordinateRole: "address"`. `attributes.match.type` is
`exact_location` at zero distance or `nearest`, with `distanceMetres`,
`evidence: "address_point"` and `selection: "proximity"`. Zero distance does not prove
building identity. Address points do not establish building-footprint containment.

A second candidate within 15 metres of the closest candidate's distance makes the
response ambiguous, including when `limit=1`. The reported `ambiguityDistanceMetres: 15`
is a conservative selection heuristic, not a measured GPS accuracy or a confidence
interval. Larger gaps do not prove unique building identity. Candidate reads are paged,
retaining the requested best candidates and an ambiguity witness. Basemap footprints are
not currently used to promote candidates; see the
[coverage investigation](benchmarks/geocoder-2026-10-19.md).

`meta.release.apiReleaseSet` identifies the endpoint's release. Separate companion
release metadata appears only when a different release is actually used. `full` adds
domain, cohort, schema, ruleset and snapshots without repeating the same release. Pins
never fall back to current data. Reads use publication guards and retained history for
displaced snapshots; unavailable retained history returns `503`.

Address composition requires the exact canonical division snapshot selected by the
address release. Matching dates alone do not prove compatibility. If no compatible
companion exists, the endpoint returns `compatible_release_unavailable`.

Local examples:

```text
http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697&profile=compact
http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697&profile=default
http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697&profile=map
http://localhost:8787/divisions/v1/geocode?lat=22.3359905&lng=114.1989697&profile=full
```

OpenAPI documents: `/openapi/divisions/v1` and `/openapi/addresses/v1`.
