import type { Database } from 'bun:sqlite'
import { splitSqlStatements } from '@repo/core/pipeline/services/addressPipeline/sqlImportStages'

/** Generated DML only. Check every sqlite3_step result, not just a script's last result. */
export function executeNativeSqlStatements(db: Database, sql: string) {
  for (const statement of splitSqlStatements(sql)) db.query(statement).run()
}
