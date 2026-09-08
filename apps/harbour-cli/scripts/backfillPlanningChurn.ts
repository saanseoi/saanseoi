import { Database } from 'bun:sqlite'
import {
  planningDivisionChurn,
  planningDivisionContentHash,
} from '../src/lib/divisionSql/planningDivisionChurn'

// Explicit local SQLite paths only. Dry-run by default; validates all release
// inventories before changing only their aggregate churn statistics atomically.
const [metaPath, historyPath, mode] = process.argv.slice(2)
if (!metaPath || !historyPath || (mode && mode !== '--apply')) {
  throw new Error(
    'Usage: bun backfillPlanningChurn.ts META.sqlite HISTORY.sqlite [--apply]',
  )
}
const meta = new Database(
  metaPath,
  mode === '--apply' ? { readwrite: true } : { readonly: true },
)
const history = new Database(historyPath, { readonly: true })
const releases = meta
  .query(`SELECT id, code, datasetId, sourceVersion FROM releases
  WHERE resourceType = 'division' AND status IN ('published', 'superseded')
  AND (code LIKE 'dr-hk-hkgov-pland-division-pu-%'
    OR code LIKE 'dr-hk-hkgov-pland-division-new-town-%')
  ORDER BY datasetId, sourceVersion`)
  .all() as Array<{
  id: string
  code: string
  datasetId: string
  sourceVersion: string
}>
const previous = new Map<string, Array<{ id: string; versionHash: string }>>()
const plans = releases.map(release => {
  const rows = history
    .query('SELECT * FROM divisions WHERE sourceReleaseId = ?')
    .all(release.id) as Array<{ id: string; versionHash: string; level: number }>
  const count = meta
    .query(
      "SELECT value FROM stats WHERE releaseId = ? AND dimension = 'records' AND metric = 'count'",
    )
    .get(release.id) as { value: number } | null
  if (
    !rows.length ||
    !count ||
    rows.length !== count.value ||
    new Set(rows.map(row => row.id)).size !== rows.length
  ) {
    throw new Error(`Retained inventory is incomplete or ambiguous: ${release.code}`)
  }
  const contentRows = rows.map(row => ({
    id: row.id,
    versionHash: planningDivisionContentHash(row),
  }))
  const stats = planningDivisionChurn(
    previous.get(release.datasetId) ?? [],
    contentRows,
  )
  previous.set(release.datasetId, contentRows)
  console.log(
    release.code,
    Object.fromEntries(stats.map(row => [row.dimension, row.value])),
    'levels',
    rows.reduce(
      (counts, row) => {
        counts[row.level] = (counts[row.level] ?? 0) + 1
        return counts
      },
      {} as Record<number, number>,
    ),
  )
  return { release, stats, rows }
})
if (mode === '--apply')
  meta.transaction(() => {
    for (const { release, stats, rows } of plans) {
      if (release.code.includes('-division-pu-')) {
        meta
          .query(
            "DELETE FROM stats WHERE releaseId = ? AND groupBy = 'unit_distribution'",
          )
          .run(release.id)
        for (const [level, label] of [
          [3, 'primary'],
          [4, 'secondary'],
          [5, 'tertiary'],
          [6, 'subunits'],
        ] as const) {
          meta
            .query(`INSERT INTO stats (id,type,releaseId,dimension,metric,metricUnit,value,groupBy,groupValue)
            VALUES (?, 'division', ?, 'units', 'count', 'rows', ?, 'unit_distribution', ?)`)
            .run(
              crypto.randomUUID(),
              release.id,
              rows.filter(row => row.level === level).length,
              label,
            )
        }
      }
      meta
        .query(
          "DELETE FROM stats WHERE releaseId = ? AND metric = 'churn' AND groupBy IS NULL",
        )
        .run(release.id)
      for (const row of stats)
        meta
          .query(`INSERT INTO stats
      (id,type,releaseId,dimension,metric,metricUnit,value,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(
            crypto.randomUUID(),
            row.type,
            release.id,
            row.dimension,
            row.metric,
            row.metricUnit,
            row.value,
            new Date().toISOString(),
            new Date().toISOString(),
          )
    }
  })()
console.log(
  mode === '--apply' ? `Updated ${plans.length} releases.` : 'Dry run; no changes.',
)
history.close()
meta.close()
