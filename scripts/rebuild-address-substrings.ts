import { Database } from 'bun:sqlite'
import { synchroniseAddressSubstringSearch } from '../libs/core/src/pipeline/services/addresses/substringIndex'
const path = process.argv[2]
if (!path)
  throw new Error(
    'Pass the local CURRENT SQLite path; this rebuild changes only the derived substring index.',
  )
const sqlite = new Database(path)
sqlite.exec('PRAGMA busy_timeout=10000')
const prepare = (statement: string, values: unknown[] = []) => ({
  bind: (...args: unknown[]) => prepare(statement, args),
  all: async () => ({ results: sqlite.query(statement).all(...(values as never[])) }),
  run: async () => {
    sqlite.query(statement).run(...(values as never[]))
    return { success: true }
  },
})
const binding = {
  prepare,
  batch: async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      for (const statement of statements) await statement.run()
      sqlite.exec('COMMIT')
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  },
}
try {
  const start = performance.now()
  const rows = await synchroniseAddressSubstringSearch(binding as never)
  console.log(
    JSON.stringify({
      indexedLocaleRows: rows,
      milliseconds: Math.round(performance.now() - start),
    }),
  )
} finally {
  sqlite.close()
}
