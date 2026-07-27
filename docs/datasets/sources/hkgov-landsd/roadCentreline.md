# LandsD Road Centreline

The Lands Department Road Centreline dataset supplies road-centreline segments for
SaanSeoi Streets. It is intended for approximate location queries and map annotation
labelling, not legal road boundaries.

SaanSeoi retains every publisher segment as native evidence: its `objectId`,
`streetCode`, optional `streetType`, paired `nameEn`/`nameZhHant` labels, complete
native `rawProperties`, and EPSG:2326 `sourceGeometry`. EPSG:2326 is recorded once in
the archived release manifest rather than repeated on every source row. Publisher labels
remain paired on the source record; they are not expanded into source locale rows.

Each segment is matched only to the LandsD street identity effective at the release date
using an exact normalised English-name match. Where it is needed to disambiguate
identical English names, canonical district IDs are derived by intersecting the
projected segment with the selected SaanSeoi District geometry snapshot, then compared
with the historic street version's `districtIds`. These derived IDs, the WGS84
projection, bounding box, and any matched canonical street identity are transform
outputs only; none is stored on a Road Centreline source row. Traditional Chinese names
are publisher evidence, but are not an identity key. Segments without publisher names
remain source-only assertions; unmatched or ambiguous named records must be represented
in the versioned curation fixture before canonical publication.

The original publisher archive is the CSDI Road Centreline package. The CSDI
old-Street-Name archive link is descriptive provenance only and is never an input to
this pipeline. `hkgov-landsd:road-centreline` reads the locally mirrored FileGDB ZIP
directly, verifies the updater-provided archive key and SHA-256, and imports native
source rows through the local SQLite/D1 SQL pipeline. It never downloads the managed
archive again and has no GeoJSON or Parquet hand-off.
