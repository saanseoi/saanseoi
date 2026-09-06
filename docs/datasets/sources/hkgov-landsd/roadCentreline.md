# LandsD Road Centreline

The Lands Department Road Centreline dataset supplies road-centreline segments for
SaanSeoi Streets. It is intended for approximate location queries and map annotation
labelling, not legal road boundaries.

SaanSeoi retains every publisher segment as native evidence: its `objectId`,
`streetCode`, optional `streetType`, paired `nameEn`/`nameZhHant` labels, complete
native `rawProperties`, and EPSG:2326 `sourceGeometry`. EPSG:2326 is recorded once in
the archived release manifest rather than repeated on every source row. Publisher labels
remain paired on the source record; they are not expanded into source locale rows.

Street codes accept publisher text or integer values. Native integer `STREETCODE` values
are stored as decimal text; text codes retain leading zeroes. The original value and
type remain in `rawProperties`. Missing or invalid codes stop ingestion.

Each segment is matched to the selected published LandsD street snapshot using an exact
normalised English-name match. Where it is needed to disambiguate identical English
names, canonical district IDs are derived by intersecting the projected segment with the
published HaD district-area snapshot, then compared with the street's `districtIds`.
These derived IDs, the WGS84 projection, bounding box, and any matched canonical street
identity are transform outputs only; none is stored on a Road Centreline source row.
Traditional Chinese names are publisher evidence, but are not an identity key. Segments
without publisher names remain source-only records; unmatched or ambiguous named records
must be represented in the versioned curation fixture before canonical publication.

FileGDB text attributes are decoded as UTF-8 at the archive boundary, including the
retained native properties. Invalid UTF-8 stops intake.

The archive reader disables the FileGDB convenience projection. Source coordinates
remain in HK80; matching projects them to WGS84 exactly once. District intersection
reuses parsed polygons and skips disjoint bounding boxes.

Every matching run writes `.cache/road-centreline-review/{archive-sha256}.json`,
including dry runs. The report records archive provenance and the selected street and
district-area snapshot IDs. It groups unresolved segments by issue kind, bilingual name,
district evidence and candidate IDs, with segment counts, all object IDs, and candidate
names and districts. The CLI reports the count and file path instead of printing every
segment. No link or exclusion decision is inferred from the report. The selected
snapshots are the latest published snapshots of the required kinds; historical
applicability must be checked when reviewing an older source archive.

The original publisher archive is the CSDI Road Centreline package. The CSDI
old-Street-Name archive link is descriptive provenance only and is never an input to
this pipeline. `hkgov-landsd:road-centreline` reads the locally mirrored FileGDB ZIP
directly, verifies the updater-provided archive key and SHA-256, and imports native
source rows through the local SQLite/D1 SQL pipeline. It never downloads the managed
archive again and has no GeoJSON or Parquet hand-off.
