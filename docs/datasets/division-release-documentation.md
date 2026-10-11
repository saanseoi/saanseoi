# Division release documentation

The SaanSeoi Division release fixtures carry a full description in English, Traditional
Chinese and Simplified Chinese. Copy that description for each edition and refresh its
release identity, ingredient pins and count scope.

`{{releaseDate:en}}`, `{{releaseDate:zh-Hant}}` and `{{releaseDate:zh-Hans}}` render the
human-readable edition date from `releaseVersion`. Source versions and the basemap
release link use frontmatter placeholders. The basemap date comes from the retained
Protomaps ingredient; it can differ from the SaanSeoi edition date.

Refresh the counts and pins from the exact retained Division and DivisionArea ZIPs:

```fish
bun apps/harbour-cli/scripts/refresh-division-docs.ts FIXTURE.md DIVISION.zip AREA.zip
```

The command checks the dataset, release and resource type in both manifests, requires
matching ingredient pins, and rejects area references outside the Division archive.
SQLite queries count divisions by class and category, area records, distinct divisions
with areas, and divisions without areas. Both ZIP SHA-256 hashes and `countsRelease` are
retained in frontmatter with the query results. These are archive counts, not a claim
about the current serving database or publication state.

Before publishing documentation, run the same command with `--check`:

```fish
bun apps/harbour-cli/scripts/refresh-division-docs.ts FIXTURE.md DIVISION.zip AREA.zip --check
```

This read-only check fails if a count, ingredient pin or archive hash differs. Rendering
also rejects a copied fixture whose `countsRelease` does not match the target release.
Do not edit counts manually. If a release archive is rebuilt, refresh and check against
that exact archive pair before publishing its documentation.
