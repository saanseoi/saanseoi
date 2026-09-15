# Canonical source evidence

Addresses, Divisions and Statistics separate canonical values, source references and
processing evidence. Canonical `sources` contains record references, not copied
publisher properties, curation explanations, normalisation flags or prepared alias rows.

Snapshot source selections and immutable resource/source releases hold dataset identity,
source version, cohort, archive filename and source schema version. The retained native
assertion holds its exact file/feature locator. Canonical district membership is not a
substitute for that locator. Statistics retains the selected source release and feature
reference for each field independently.

Division and geometry `evidence` references identify the canonical record whose source
interpretation must be replayed. Replay follows the selected snapshot ancestry and keeps
the exact publisher record/version and owning release. It includes inherited assertions
and applies explicit omissions. Several source records can contribute to one canonical
record, and one source record can resolve to several canonical records. Planning
geometry identifies native New Town records or contributing `cell_id` groups. A cell
group selects native Planning occurrence IDs beginning with `${cell_id}:`; all matching
occurrences belong to the selected release. Statistics geometry references its retained
Statistics feature IDs. Display derivatives retain references to their native
assertions.

ALS Address2D references identify the captured publisher occurrence and its version
hash. Curated premises additionally identify their canonical record in the selected
release's retained processing audit. Component corrections reference reviewed entry IDs
and revisions. Address3D collections retain source occurrence IDs and compact audit
references; inventory processing decisions remain in the interpretation/audit stores.

Only `profile=full` expands source references. The full document's
`meta.sourceSpecifications` is keyed by resource release ID and describes the exact
resource/source release codes, dataset, cohort, source version, source schema version
and archive filename. Native source locators and audit evidence remain in their
respective stores. Reconstruction batches records by snapshot and resource type rather
than issuing one database read per result. Places and Streets provenance implementation
is deferred.

Unchanged source-resolution retries do not update stored interpretations. Address3D
current materialisation removes only omitted collections and writes only changed
inventories or localisations. Source interpretations retain all collection owners.

## Address ID reconciliation candidates

Run the following with every current/history SQLite file and a new output directory:

```sh
bun apps/harbour-cli/scripts/reconcile-address-id-copies.ts OUTPUT_DIRECTORY DB_FILES...
```

The tool reads live inputs without modifying them, takes SQLite-consistent copies,
rejects prefix collisions and unexpected collection seeds, updates canonical references
and snapshot membership, and checks foreign keys. Publisher properties and original
audit assertions retain their original identifiers. It rejects candidates if the inputs
change during the run.

These copies are review artefacts. Their original version hashes remain available for
comparison; canonical versions and dependent publications must be regenerated before
publication. Do not replace live database files with these candidates.

## Shared Statistics definition selections

`statsRecords.definitionSetId` references the immutable field-definition map in
`statsDefinitionSets`. Current and history each retain the sets they require.
Publication and rollback copy referenced sets together with their field and measure
definitions; missing sets fail closed. Repeated records share a set, including across
releases when the selected field meanings match. Readers expand the map without storing
a copy on every observation pack.

The generated current/history schema migrations target a rebuilt database. Populated
stores require an isolated rebuild retaining their existing field-definition selections
before publication; adding the required reference column alone is not a data conversion.
