# Investigating stored hierarchy names

Hierarchy labels are stored values. The intended label is the ancestor's `zh-hant` name
followed by its `en` name, separated by one space. Trim whitespace, omit missing names
and deduplicate equal names. English alone is valid when no Traditional Chinese name is
available. The implementation is `libs/core/src/displayName.ts` (`buildDisplayName`).

## Establish the affected release

Start with `dr-hk-saanseoi-division-2026-09-01.0`. Resolve its SOURCE binding and source
version through the release metadata, using the same selection as
`resolveRecordsRequest` in `apps/atlas-api/src/services/sourceRecords.ts`. Do not
substitute the latest CURRENT rows for the selected source release.

Read a source record and retain the full response, including its release pin:

```fish
curl -fsS 'http://localhost:8787/divisions/v0.1/sources?sourceRelease=dr-hk-saanseoi-division-2026-09-01.0&limit=1'
```

Follow `nextCursor` to inventory the release, or query its SOURCE database read-only. A
confirmed example is Sai Ying Pun, `0058e21e-a916-4762-8da1-ba6694204a35`: its ancestor
`8d17afe0-5631-49c5-b86d-d53c5d4b2f9d` is labelled `Central and Western District` in the
source response. This establishes the symptom, not the cause or the number of affected
records.

## Compare labels with release-matched ancestor names

On the resolved SOURCE database, run this read-only query. The validity bounds use the
source version `2026-09-01.0`, not the full release code. `ssDivision` is the dedicated
SaanSeoi division table. First check that each source record has only one valid row for
the selected version; investigate overlapping validity intervals before interpreting
joins.

```sql
WITH selected AS (
  SELECT * FROM ssDivision
  WHERE validFromRelease <= '2026-09-01.0'
    AND (validToRelease IS NULL OR validToRelease > '2026-09-01.0')
)
SELECT sourceRecordId, COUNT(*) AS versions
FROM selected GROUP BY sourceRecordId HAVING COUNT(*) <> 1;
```

Extract every ancestor occurrence, retaining child ID, version hash, category, path and
position so repeated ancestors remain attributable:

```sql
WITH selected AS (
  SELECT * FROM ssDivision
  WHERE validFromRelease <= '2026-09-01.0'
    AND (validToRelease IS NULL OR validToRelease > '2026-09-01.0')
)
SELECT child.sourceRecordId AS childId, child.versionHash,
       category.key AS category, path.key AS pathIndex,
       entry.key AS ancestorIndex,
       json_extract(entry.value, '$.id') AS ancestorId,
       json_extract(entry.value, '$.name') AS storedName,
       ancestor.versionHash AS ancestorVersionHash,
       json_extract(ancestor.properties, '$.names."zh-hant".name') AS zhHant,
       json_extract(ancestor.properties, '$.names.en.name') AS en
FROM selected AS child
JOIN json_each(child.properties, '$.hierarchies') AS category
JOIN json_each(category.value) AS path
JOIN json_each(path.value) AS entry
LEFT JOIN selected AS ancestor
  ON ancestor.sourceRecordId = json_extract(entry.value, '$.id')
ORDER BY child.sourceRecordId, category.key, path.key, entry.key;
```

Calculate the expected label with `buildDisplayName` from these two locale values.
Separate mismatched labels, ancestors without Chinese names, and unresolved ancestor
IDs. Count affected children and distinct ancestors. Repeat for other published editions
to establish the affected range.

## Trace the first incorrect value

Compare the same child and ancestor IDs through these stages:

1. The exact registered ZIP archive and its manifest, checksum and pinned input
   releases. Inspect its record JSON; a newly generated archive is not evidence of what
   was ingested for the selected release.
2. `assembled.json`, `inputs.json` and the locale rows used for that assembly. In
   `apps/harbour-cli/src/lib/pipeline/curatedDivisions/assemble.ts`, editorial hierarchy
   entries initially carry their stored labels through identity remapping.
   `resolveCuratedHierarchies` then constructs labels from locale rows.
3. `resolveHierarchies.ts`: inspect its `labels` map, early exits for children without a
   usable shape or point, and the `unsupported` branch that preserves explicit ancestors
   without geometry. That branch carries existing entries forward, including their
   names. These are candidates to investigate, not a confirmed cause for September.
4. `archiveInput.ts`, SOURCE `ssDivision.properties`, then
   `libs/core/src/pipeline/services/divisions/curatedDivision.ts`. Curated ingestion
   preserves supplied hierarchies; it does not rebuild their labels.
5. The selected serving snapshot, and finally `publicDivisionHierarchies` in
   `apps/atlas-api/src/services/divisionsPresentation.ts`. The public projection copies
   `name`; it does not translate it.

If the archive is correct but SOURCE is wrong, inspect the upload receipt, archive
selection, hash and persistence mapping. If SOURCE is correct but the response differs,
inspect the selected release and binding. If Chinese names are absent at assembly time,
repair their input or locale/identity association before changing label generation.

## Prepare and verify a repair

When locale rows are correct but carried-forward labels are stale, refresh ancestor
labels by canonical ID after identity remapping and final name curation, across every
hierarchy category and path. Use `buildDisplayName` and the release's own names.
Preserve IDs, path order, branching, classes and containment evidence. Define an
explicit policy for unresolved ancestor IDs; do not silently erase an existing label
because a lookup failed.

Add regression cases for bilingual names, English-only names, Chinese-only names,
duplicate names, remapped IDs, ancestors without geometry and children that skip spatial
hierarchy resolution. Test the final assembled archive as well as the label helper.
Check that non-name hierarchy fields are identical.

Build a candidate into a separate directory, with an explicit edition whose Division and
DivisionArea metadata already exist:

```fish
bun apps/harbour-cli/scripts/assemble-curated-divisions.ts /tmp/saanseoi-hierarchy-review 2026-09-01.0
```

This command prepares local artefacts; it does not upload or publish them. It uses the
current assembly code and editorial files with that edition's pinned source inputs, so
it is a candidate comparison, not an exact historical replay. Review the generated
manifests and complete record diff before ingestion.

Publish a corrected edition through the normal upload, processing and publication
workflow, with new content hashes and receipts. Do not directly update immutable SOURCE
JSON or replace an already published archive under its existing identity. If historical
repair is required, scope it explicitly and use the repository's guarded release
lifecycle. No database reset is needed for the investigation.

After publication, repeat the release-pinned query and source/API checks against the new
edition. Verify all affected paths and locale edge cases, and confirm that prior release
records still resolve to their original content.
