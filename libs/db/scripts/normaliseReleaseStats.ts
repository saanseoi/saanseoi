import { Database } from 'bun:sqlite'

export const releaseStatsClassificationSql = `UPDATE stats SET
      category = CASE measure WHEN 'churn' THEN 'changes' ELSE measure END,
      measure = category
      WHERE measure IN ('churn', 'completeness', 'quality', 'processing');
      UPDATE stats SET measure = 'count'
      WHERE category = 'records' AND measure = 'distribution';`

/** Reclassifies release measures after the generated column-rename migrations. */
export function normaliseReleaseStats(db: Database, apply = false) {
  const affected = db
    .query(`SELECT count(*) AS count FROM stats
    WHERE measure IN ('churn', 'completeness', 'quality', 'processing')
      OR (category = 'records' AND measure = 'distribution')`)
    .get() as { count: number }
  if (apply)
    db.transaction(() => {
      db.exec(releaseStatsClassificationSql)
    })()
  return affected.count
}

if (import.meta.main) {
  const [path, mode] = process.argv.slice(2)
  if (path === '--sql') {
    console.log(releaseStatsClassificationSql)
    process.exit(0)
  }
  if (!path || (mode && mode !== '--apply'))
    throw new Error('Usage: bun normaliseReleaseStats.ts META.sqlite [--apply]')
  const db = new Database(
    path,
    mode === '--apply' ? { readwrite: true } : { readonly: true },
  )
  try {
    const count = normaliseReleaseStats(db, mode === '--apply')
    console.log(
      `${mode === '--apply' ? 'Normalised' : 'Would normalise'} ${count} release stats rows.`,
    )
  } finally {
    db.close()
  }
}
