# Record-level source attribution

## Address assembly evidence and retrieval

Public Address `sources` identifies the publisher, dataset and supporting source record
IDs. Supplementary addresses identify Overture Places; official addresses identify DPO
ALS. Places retain their Address links. Upstream records are retrieved through the
retained source archives using the matching source edition, since records and Address
links can differ between editions. Supplementary Address curation entries and decisions
belong to the Place audit. Address history retains canonical components and attribution
without a separate evidence payload or evidence index.

Place identity and Division association evidence lives in immutable R2 record-evidence
objects. Each object identifies its collection, record ID and schema version. Place
`sourceResolutions` retains entity membership and an evidence locator; readers verify
both bytes and record identity. Upload acknowledgement precedes SQL writes that expose
these references.
