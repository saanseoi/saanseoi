import type { Database } from 'bun:sqlite'
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'

/** Avoid repeatedly parsing the tail of a large sqlite3_exec script. */
export function executeSqliteDump(db: Database, sql: string) {
  // Trigger bodies contain statement separators. Keep SQLite's full parser for
  // those uncommon schema dumps; the exported data dumps have no triggers.
  if (/\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i.test(sql)) {
    db.exec(sql)
    return
  }
  for (const sqlStatement of splitSqlStatements(sql)) {
    const statement = db.prepare(sqlStatement)
    try {
      statement.run()
    } finally {
      statement.finalize()
    }
  }
}
