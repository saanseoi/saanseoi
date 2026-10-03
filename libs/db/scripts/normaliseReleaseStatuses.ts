import { Database } from 'bun:sqlite'

export const releaseStatusNormalisationSql = `UPDATE sourceReleases
SET status = CASE status WHEN 'published' THEN 'current' WHEN 'superseded' THEN 'archived' END
WHERE status IN ('published', 'superseded');
UPDATE resourceReleases
SET status = CASE status WHEN 'published' THEN 'current' WHEN 'superseded' THEN 'archived' END
WHERE status IN ('published', 'superseded');
UPDATE releaseSetLifecycleJournal
SET statusFrom = CASE statusFrom WHEN 'published' THEN 'current' WHEN 'superseded' THEN 'archived' ELSE statusFrom END,
    statusTo = CASE statusTo WHEN 'published' THEN 'current' WHEN 'superseded' THEN 'archived' ELSE statusTo END
WHERE resourceReleaseId IS NOT NULL
  AND (statusFrom IN ('published', 'superseded') OR statusTo IN ('published', 'superseded'));`

/** Rename release states without changing publication events, timestamps or lineage. */
export function normaliseReleaseStatuses(db: Database, apply = false) {
  const counts = {
    sourceReleases: (
      db
        .query(`SELECT count(*) AS count FROM sourceReleases
      WHERE status IN ('published', 'superseded')`)
        .get() as { count: number }
    ).count,
    resourceReleases: (
      db
        .query(`SELECT count(*) AS count FROM resourceReleases
      WHERE status IN ('published', 'superseded')`)
        .get() as { count: number }
    ).count,
    lifecycleJournal: (
      db
        .query(`SELECT count(*) AS count FROM releaseSetLifecycleJournal
      WHERE resourceReleaseId IS NOT NULL
        AND (statusFrom IN ('published', 'superseded') OR statusTo IN ('published', 'superseded'))`)
        .get() as { count: number }
    ).count,
  }
  if (apply) db.transaction(() => db.exec(releaseStatusNormalisationSql))()
  return counts
}

if (import.meta.main) {
  const [path, mode, ...extra] = process.argv.slice(2)
  if (path === '--sql' && !mode) {
    console.log(releaseStatusNormalisationSql)
  } else {
    if (!path || extra.length || (mode && mode !== '--apply'))
      throw new Error(
        'Usage: bun normaliseReleaseStatuses.ts META.sqlite [--apply] | --sql',
      )
    const db = new Database(
      path,
      mode === '--apply' ? { readwrite: true } : { readonly: true },
    )
    try {
      const counts = normaliseReleaseStatuses(db, mode === '--apply')
      console.log(
        `${mode === '--apply' ? 'Normalised' : 'Would normalise'} release statuses: ${JSON.stringify(counts)}`,
      )
    } finally {
      db.close()
    }
  }
}
