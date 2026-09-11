import { Database } from 'bun:sqlite'

// Read-only against the target. Optional SQL output is a reviewable repair plan.
const [databasePath, repairSqlPath] = process.argv.slice(2)
if (!databasePath)
  throw new Error('Usage: bun scripts/audit-meta-schema.ts META.sqlite [repair.sql]')
const db = new Database(databasePath, { readonly: true })
const rows = (sql: string) => db.query(sql).all()
const columns = rows('PRAGMA table_info(stats)') as Array<{ name: string }>
const kind = columns.some(column => column.name === 'kind') ? 'kind' : 'type'
const repairs = [
  // A single shared child key is unambiguous. A multi-resource publisher archive
  // must never be replaced by one arbitrarily selected prepared resource file.
  `UPDATE sourceReleases AS s SET rawObjectKey = (
    SELECT min(r.rawObjectKey) FROM releases r WHERE r.sourceReleaseId = s.id
  ) WHERE s.rawObjectKey IS NULL AND EXISTS (
    SELECT 1 FROM releases r WHERE r.sourceReleaseId = s.id
    GROUP BY r.sourceReleaseId HAVING count(*) = count(r.rawObjectKey)
      AND count(DISTINCT r.rawObjectKey) = 1
  );`,
  // Copy retained release evidence only; never backdate today's dataset policy.
  `UPDATE sourceReleases AS s SET processingRules = (
    SELECT min(r.processingRules) FROM releases r WHERE r.sourceReleaseId = s.id
  ) WHERE s.processingRules IS NULL AND EXISTS (
    SELECT 1 FROM releases r WHERE r.sourceReleaseId = s.id
    GROUP BY r.sourceReleaseId HAVING count(*) = count(r.processingRules)
      AND count(DISTINCT r.processingRules) = 1
  );`,
  `UPDATE releases AS r SET processingRules = (
    SELECT s.processingRules FROM sourceReleases s WHERE s.id = r.sourceReleaseId
  ) WHERE r.processingRules IS NULL AND EXISTS (
    SELECT 1 FROM sourceReleases s WHERE s.id = r.sourceReleaseId
      AND s.processingRules IS NOT NULL
  );`,
  `UPDATE stats SET "${kind}" = 'release' WHERE "${kind}" = 'division'
    AND releaseId IS NOT NULL AND apiReleaseSetId IS NULL;`,
]
const report = {
  datasets: rows(
    `SELECT code, sourceCrs, processingRules IS NOT NULL AS hasProcessingRules FROM datasets ORDER BY code`,
  ),
  missingSnapshotAssignments:
    rows(`SELECT s.code, s.status, s.publishedAt FROM snapshots s
    WHERE NOT EXISTS (SELECT 1 FROM snapshotShardAssignments a WHERE a.snapshotId = s.id)`),
  statsKinds: rows(
    `SELECT "${kind}" AS kind, count(*) AS count FROM stats GROUP BY "${kind}"`,
  ),
  invalidStatsOwners: rows(
    `SELECT id FROM stats WHERE (releaseId IS NOT NULL) + (apiReleaseSetId IS NOT NULL) != 1`,
  ),
  snapshotStats: columns.some(column => column.name === 'snapshotId')
    ? rows('SELECT count(*) AS count FROM stats WHERE snapshotId IS NOT NULL')
    : [],
  missingSourceMetadata: rows(`SELECT s.code, s.rawObjectKey IS NULL AS missingRawKey,
    s.processingRules IS NULL AS missingProcessingRules FROM sourceReleases s
    WHERE s.rawObjectKey IS NULL OR s.processingRules IS NULL ORDER BY s.code`),
  resourceDatasetMismatches: rows(`SELECT r.code FROM releases r JOIN sourceReleases s
    ON s.id = r.sourceReleaseId WHERE s.datasetId != r.datasetId`),
  incompletePublishedSources:
    rows(`SELECT s.code, expected.value AS missingResource FROM sourceReleases s,
    json_each(s.expectedResourceTypes) expected WHERE s.status = 'published' AND NOT EXISTS (
      SELECT 1 FROM releases r WHERE r.sourceReleaseId = s.id AND r.resourceType = expected.value
        AND r.status IN ('published', 'superseded'))`),
  invalidPublicationDates: rows(`SELECT code, publicationDate FROM sourceReleases
    WHERE publicationDate IS NOT NULL AND (length(publicationDate) != 10 OR date(publicationDate) IS NULL)`),
  foreignKeyViolations: rows('PRAGMA foreign_key_check'),
}
db.close()
if (repairSqlPath) await Bun.write(repairSqlPath, `${repairs.join('\n\n')}\n`)
console.log(JSON.stringify(report, null, 2))
