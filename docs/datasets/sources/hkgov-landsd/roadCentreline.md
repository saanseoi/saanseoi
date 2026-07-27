# LandsD Road Centreline

The Lands Department Road Centreline dataset supplies road-centreline segments for
SaanSeoi Streets. It is intended for approximate location queries and map annotation
labelling, not legal road boundaries.

SaanSeoi retains every publisher segment, including its `objectId`, `streetCode`,
optional `streetType`, native `sourceGeometry` and WGS84 `geometry`. EPSG:2326 is
recorded once in the archived release manifest rather than repeated on every source row.
Source English and Traditional Chinese names are retained as source i18n when present.
The publisher's `LASTUPDATEDATE` and `SHAPE_Length` fields are dropped.

Each segment is matched only to the LandsD street identity effective at the release date
using an exact normalised English-name match. Where it is needed to disambiguate
identical English names, canonical district IDs are derived by intersecting the
projected segment with the selected SaanSeoi District geometry snapshot, then compared
with the historic street version's `districtIds`. These derived IDs are matching and
statistics evidence only; they are not Road Centreline source fields. Traditional
Chinese names are retained as source i18n, but are not an identity key. `streetId` is a
validated logical reference rather than a SQL foreign key: the street source and
canonical state live in separate D1 shards. Segments without publisher names remain
source-only assertions with `streetId=NULL`; unmatched or ambiguous named records must
be represented in the versioned curation fixture before canonical publication.

The original publisher archive is the CSDI Road Centreline package. The CSDI
old-Street-Name archive link is descriptive provenance only and is never an input to
this pipeline.
