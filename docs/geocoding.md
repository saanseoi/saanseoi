# Division and address geocoding

`GET /divisions/v1/geocode` returns division membership. `GET /addresses/v1/geocode`
returns canonical structured addresses. Both use the public API key, origin, quota and
rate-limit rules of the other SaanSeoi data APIs. The response contains `data` and
`meta`; unavailable publications return `503`, and invalid input returns the standard
`422` validation document.

## Input

Supply exactly one input form:

| Input           | Meaning                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `lat` and `lng` | Reverse geocoding in WGS84 decimal degrees                                     |
| `address`       | Forward search of canonical formatted address text                             |
| `placename`     | Forward search of division names, or address building, estate and street names |

Coordinates require both named fields, with latitude in `[-90, 90]` and longitude in
`[-180, 180]`. Empty, non-finite, out-of-range and mixed inputs are rejected. GeoJSON
and returned coordinate pairs use `[lng, lat]`. HK 1980 Grid input is not part of this
contract; convert it to WGS84 before calling the endpoint.

Optional parameters:

| Parameter       | Values and default                                                                           |
| --------------- | -------------------------------------------------------------------------------------------- |
| `apiReleaseSet` | Exact published release-set code; omission selects the latest compatible published release   |
| `locales`       | Comma-separated locale tags; default `en,zh-hant`. `*` selects all; `null` selects no names. |
| `limit`         | Forward/proximity candidates, 1–50; default 10                                               |
| `maxDistance`   | Reverse address search radius in metres, 0–50,000; default 1,000                             |
| `include`       | `divisions` adds division resolution to each address candidate                               |
| `geometry`      | `stub` adds the authoritative stub polygons to division memberships                          |

Examples:

```text
/divisions/v1/geocode?lat=22.285&lng=114.158&geometry=stub
/divisions/v1/geocode?placename=Lamma&locales=en,zh-hant
/addresses/v1/geocode?address=Queen%27s%20Road&include=divisions
/addresses/v1/geocode?lat=22.285&lng=114.158&maxDistance=500
```

## Release identity

Each required family resolves its selection once per request. `meta.release` identifies
the endpoint's release. `meta.addressRelease` and `meta.divisionRelease` identify every
composed family, including its domain, cohort, schema, ruleset and logical snapshots.
The version-1 geocoding contract consumes the existing version-0.1 dataset contracts.

Pins can select a retained published release outside the latest catalogue. They never
fall back to current data. Current rows are read under the existing publication token
guard; displaced rows use retained snapshot journals and their assigned history shards.
Missing retained history or a publication changing during the read returns `503`.

Address composition requires the exact canonical Overture division snapshot selected by
the address release to be a member of the geographic division release. Publication dates
and similar cohort names are not compatibility evidence. A division address-text search
uses an address release sharing its selected division snapshot. If no compatible
published companion exists, the response is `compatible_release_unavailable`.

## Division containment and selection

The authoritative geometry is the geographic-domain `stub` association. It is stored in
`fixtures/divisions/hk/stub-areas.json`, keyed by `properties.divisionId`, and scoped by
domain and cohort through the existing `divisionStubAreas` service. A request for a
different cohort has no stub coverage. The checked-in fixture is an empty review
inventory, so it does not currently supply operational containment coverage. Label
points, geometry from other domains and published non-stub variants cannot substitute
for this association.

The resolver builds a request-scoped bounding-box prefilter from stub polygon vertices,
then uses the shared exact point-in-polygon routine. Multipolygon components are tested
separately. Hole interiors are excluded; outer and hole boundaries are included. A
shared boundary can therefore match multiple divisions. The shared routine uses a
`1e-12` cross-product tolerance for collinearity in degree coordinates.

Selection follows these rules:

1. Collect all containing stub geometries, deduplicated by division ID. All geometries
   admitted through this association have the same reviewed authority; a source label,
   label point, smaller bounding box or database row order does not break a tie.
2. Evaluate each stored `full` ancestry branch independently. An ancestor with a stub
   polygon excluding the coordinate contradicts that branch. Missing geometry does not
   contradict an evidenced relationship, but is reported as incomplete coverage.
3. Restore suppressed ancestors using the branch's category projections and ancestor
   records. Category projections are deduplicated independently, so their array
   positions cannot be joined. Conflicting, cyclic or uncorrelated alternatives remain
   unresolved.
4. Remove paths that are entirely represented by a more specific evidenced path. Select
   one administrative/locality/hood path only when the evidence leaves one alternative.
   The ordered path includes its matched leaf. Retain landform membership and
   island-group ancestry separately, including landforms suppressed from display paths.
5. Sort remaining alternatives deterministically by identity traversal. Sorting does not
   select a winner. Overlapping unrelated paths and unresolved projections are
   ambiguous.

The division resolution contains:

- `matchedDivisionIds`: direct geometric matches for reverse requests, or the named
  candidate identity for forward requests.
- `memberships`: IDs, category, class, level, requested names, and `containment` or
  `hierarchy` evidence, or `name` evidence for the forward candidate. Optional
  geometries are exclusively stub polygons.
- `path`: the selected ordered administrative/locality/hood path, or null.
- `alternatives`: competing evidenced paths.
- `landform`: separate landform memberships and paths.
- `selectedAncestryIds`: deduplicated selected membership for counting, including
  suppressed ancestors and landforms; null when ambiguous.
- `coverage` and `ambiguity`: geometry coverage counts, missing ancestors and unresolved
  division IDs. Missing ancestor records retain their IDs and any unambiguous stored
  classification evidence; unavailable classification is null.

`status` is `resolved`, `ambiguous`, `incomplete` or `not_found`. Ambiguity takes
precedence over incomplete coverage; the coverage object remains available. A same-name
island and village remain separate identities. An incomplete result must not be counted
as proof of complete geographic coverage.

## Forward candidates and reverse addresses

Forward candidates are ranked by trimmed, case-insensitive exact text (score 1), prefix
(0.8), then substring (0.6). Scores describe text match classes, not probabilities.
Division searches include stored alternative names. Multiple candidates remain
`ambiguous`, even when `limit=1` hides other results. `meta.total` and `meta.truncated`
make this visible. Stable ID ordering only orders equal-ranked candidates.

A division forward candidate's coordinate is explicitly a `label` point. Its own
identity and evidenced ancestry remain available without a coordinate. Where a label
coordinate exists, ancestor stub polygons can help resolve branching ancestry; the point
does not establish the named division's containment. Membership evidence distinguishes
the name match from containment. Address-text division searches retain separate
address-location candidates and return their division resolutions.

Address attributes retain the canonical granularity, parent address, structured
localised fields, division references, provenance, and point geometry. Missing
coordinates remain null; they are not manufactured from a name. Reverse searches return
point addresses within `maxDistance`, ordered by great-circle distance in metres.
`match.type` is `exact_location` for zero distance and `nearest` otherwise;
`distanceMetres` is explicit. Canonical address points do not evidence
building-footprint containment.

Current address candidates use a SQL coordinate/text prefilter before hydration.
Historical candidates use existing journal replay. Candidate processing is paged and
retains only the best result page plus one ambiguity witness. Broad historical searches
can still require substantial reads; there is no historical full-text or spatial index
to substitute for the selected snapshot.

OpenAPI documents are available at `/openapi/divisions/v1` and `/openapi/addresses/v1`.
