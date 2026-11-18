import type { Database } from 'bun:sqlite'

/** Contentless FTS5 roots cannot be scanned; their shadow tables hold the exact state. */
export function compareContentlessFtsThroughShadows(db: Database, name: string) {
  const definition = (schema: string) =>
    db
      .query<{ sql: string }, [string]>(
        `SELECT sql FROM ${schema}.sqlite_schema WHERE type='table' AND name=?`,
      )
      .get(name)?.sql
  const baseline = definition('net_baseline')
  if (
    !baseline ||
    !/^CREATE\s+VIRTUAL\b/i.test(baseline) ||
    !/\bUSING\s+fts5\s*\(/i.test(baseline) ||
    !/\bcontent\s*=\s*(?:''|"")/i.test(baseline)
  )
    return false
  if (definition('main') !== baseline)
    throw new Error(`Schema changed during net planning: ${name}`)
  for (const schema of ['main', 'net_baseline']) {
    const shadows = new Set(
      db
        .query<{ name: string; type: string }, []>(`PRAGMA ${schema}.table_list`)
        .all()
        .filter(row => row.type === 'shadow')
        .map(row => row.name),
    )
    for (const suffix of ['data', 'idx', 'config'])
      if (!shadows.has(`${name}_${suffix}`))
        throw new Error(`Missing contentless FTS5 storage: ${name}_${suffix}`)
  }
  // The caller's ordinary-table loop must still compare every unowned shadow table.
  return true
}
