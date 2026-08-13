import { readFile, rm } from 'node:fs/promises'

import { Database as SQLiteDatabase } from 'bun:sqlite'

type RemoteTableImport = {
  hasRows: boolean
  pruneOperation?: CachePruneOperation | null
  sqlPath: string
  tableName: string
}

type CachePruneOperation = {
  tableName: string
  whereSql: string
}

type SqliteCacheWorkerPayload =
  | {
      destinationPath: string
      dumpPaths: string[]
      pruneOperations?: CachePruneOperation[]
      type: 'import-dumps'
    }
  | {
      bindingName: string
      filePath: string
      tableImports: RemoteTableImport[]
      type: 'replace-table-rows'
    }
  | {
      filePath: string
      type: 'checkpoint'
    }

async function main() {
  const payloadPath = process.argv[2]

  if (!payloadPath) {
    throw new Error('Missing SQLite cache worker payload path.')
  }

  const payload = JSON.parse(
    await readFile(payloadPath, 'utf8'),
  ) as SqliteCacheWorkerPayload

  switch (payload.type) {
    case 'checkpoint':
      checkpointSqliteDatabase(payload.filePath)
      return
    case 'import-dumps':
      await importDatabaseDumpsToSqlite(
        payload.dumpPaths,
        payload.destinationPath,
        payload.pruneOperations ?? [],
      )
      return
    case 'replace-table-rows':
      await replaceCachedTableRows(
        payload.filePath,
        payload.bindingName,
        payload.tableImports,
      )
      return
  }
}

async function importDatabaseDumpsToSqlite(
  dumpPaths: string[],
  destinationPath: string,
  pruneOperations: CachePruneOperation[] = [],
) {
  await rm(destinationPath, { force: true }).catch(() => undefined)

  const sqlite = new SQLiteDatabase(destinationPath)
  let failed = false

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;')
    sqlite.exec('BEGIN;')
    for (const dumpPath of dumpPaths) {
      const dumpSql = await readFile(dumpPath, 'utf8')

      if (dumpSql.trim().length > 0) {
        sqlite.exec(dumpSql)
      }
    }

    pruneCachedRows(sqlite, pruneOperations)
    sqlite.exec('COMMIT;')
    sqlite.exec('PRAGMA foreign_keys = ON;')
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch (error) {
    failed = true
    try {
      sqlite.exec('ROLLBACK;')
    } catch {
      // The failure may have occurred before the transaction started.
    }
    throw error
  } finally {
    sqlite.close()
    if (failed) {
      await rm(destinationPath, { force: true }).catch(() => undefined)
    }
  }
}

async function replaceCachedTableRows(
  filePath: string,
  bindingName: string,
  tableImports: RemoteTableImport[],
) {
  const sqlite = new SQLiteDatabase(filePath)

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;')
    sqlite.exec('BEGIN;')

    for (const tableImport of [...tableImports].reverse()) {
      sqlite.exec(`DELETE FROM ${quoteSqlIdentifier(tableImport.tableName)};`)
    }

    for (const tableImport of tableImports) {
      if (!tableImport.hasRows) {
        continue
      }

      const importSql = await readFile(tableImport.sqlPath, 'utf8')

      if (importSql.trim().length > 0) {
        sqlite.exec(importSql)
      }
    }

    pruneCachedRows(
      sqlite,
      tableImports.flatMap(tableImport =>
        tableImport.pruneOperation ? [tableImport.pruneOperation] : [],
      ),
    )

    sqlite.exec('COMMIT;')
    sqlite.exec('PRAGMA foreign_keys = ON;')
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK;')
    } catch {
      // The failing statement may have aborted before BEGIN completed.
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    throw new Error(`Failed to refresh cached rows for ${bindingName}: ${errorMessage}`)
  } finally {
    sqlite.close()
  }

  checkpointSqliteDatabase(filePath)
}

function pruneCachedRows(
  sqlite: SQLiteDatabase,
  pruneOperations: CachePruneOperation[],
) {
  for (const operation of pruneOperations) {
    sqlite.exec(
      `DELETE FROM ${quoteSqlIdentifier(operation.tableName)} WHERE ${operation.whereSql};`,
    )
  }
}

function checkpointSqliteDatabase(filePath: string) {
  const sqlite = new SQLiteDatabase(filePath)

  try {
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    sqlite.close()
  }
}

function quoteSqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
