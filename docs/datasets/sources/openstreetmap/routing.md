# OpenStreetMap routing inputs

Routing companions use the Guangdong PBF recorded in each basemap manifest and its
checksummed published regional boundary. Python tooling downloads inputs atomically,
verifies SHA-256, and extracts with osmium complete_ways before compiling engine data.
Regional graphs can include complete ways beyond the clip; a map-rendering polygon clip
is not applied to graph edges. See the [routing family](../../families/routing.md) for
engine/version pins, known omitted inputs and public rebuild recipes. Archived Guangdong
PBFs remain retained and publicly downloadable independently of graph expiry.

Historical recipe-only publication uses each basemap manifest's archived Guangdong
source and published boundary hashes. It verifies source availability and size plus the
boundary checksum, without creating or claiming previously built graph payloads. The
standalone helper verifies full input SHA-256 checksums before graph generation.
