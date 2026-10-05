import { Database } from 'bun:sqlite'
import {
  buildSourceChurnCounts,
  type SourceChurnRecord,
} from '@repo/core/pipeline/services/sources/sourceChurn'
import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'

// Explicit local SQLite paths only. Dry run by default; --apply saves a backup first.
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const paths = args.filter(arg => arg !== '--apply')
if (paths.length < 2)
  throw new Error(
    'Usage: bun run scripts/repair-local-overture-division-churn.ts META.sqlite SOURCE.sqlite... [--apply]',
  )
const meta = new Database(paths[0]!, apply ? { readwrite: true } : { readonly: true })
const sources = paths.slice(1).map(path => new Database(path, { readonly: true }))
type Release = { id: string; sourceVersion: string }
const releases = meta
  .query<Release, []>(`
  SELECT r.id, r.sourceVersion FROM resourceReleases r
  JOIN datasets d ON d.id = r.datasetId
  WHERE d.code = 'ds-hk-overture-division' AND r.resourceType = 'division'
    AND r.status IN ('current', 'archived') AND r.revokedAt IS NULL
  ORDER BY r.sourceVersion
`)
  .all()
if (!releases.length) throw new Error('No published Overture division releases found.')
type Row = SourceChurnRecord & { sourceRecordId: string; versionHash: string }
function snapshot(version: string) {
  const rows = new Map<string, Row>()
  for (const source of sources) {
    for (const row of source
      .query<Row, [string, string]>(`
      SELECT sourceRecordId, properties, sourceGeometry, versionHash FROM overtureDivisions
      WHERE validFromRelease <= ? AND (validToRelease IS NULL OR validToRelease > ?)
    `)
      .all(version, version)) {
      const existing = rows.get(row.sourceRecordId)
      if (existing && existing.versionHash !== row.versionHash)
        throw new Error(
          `Ambiguous source identity at ${version}: ${row.sourceRecordId}`,
        )
      rows.set(row.sourceRecordId, row)
    }
  }
  if (!rows.size) throw new Error(`No retained source records at ${version}`)
  return rows
}
let previous = new Map<string, Row>()
const repairs = releases.map(release => {
  const current = snapshot(release.sourceVersion)
  const churn = buildSourceChurnCounts(previous, current)
  previous = current
  console.log(JSON.stringify({ release: release.sourceVersion, ...churn.totals }))
  return { release, rows: buildChurnStatsRows(churn) }
})
if (apply) {
  const backup = paths[0] + '.source-churn-' + Date.now() + '.json'
  const existing = releases.flatMap(release =>
    meta
      .query(
        "SELECT * FROM stats WHERE resourceReleaseId = ? AND category = 'changes' AND apiReleaseSetId IS NULL",
      )
      .all(release.id),
  )
  await Bun.write(backup, JSON.stringify(existing, null, 2))
  meta.transaction(() => {
    const remove = meta.query(
      "DELETE FROM stats WHERE resourceReleaseId = ? AND category = 'changes' AND apiReleaseSetId IS NULL",
    )
    const insert = meta.query(`INSERT INTO stats
      (id, resourceReleaseId, category, measure, unit, value, dimension, dimensionValue, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const { release, rows } of repairs) {
      remove.run(release.id)
      for (const row of rows)
        insert.run(
          crypto.randomUUID(),
          release.id,
          row.category,
          row.measure,
          row.unit,
          row.value,
          row.dimension ?? null,
          row.dimensionValue ?? null,
          row.createdAt,
          row.updatedAt,
        )
    }
  })()
  console.log(`Updated ${repairs.length} releases. Previous churn rows: ${backup}`)
}
for (const source of sources) source.close()
meta.close()
