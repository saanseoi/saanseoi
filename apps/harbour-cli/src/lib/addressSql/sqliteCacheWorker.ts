import { readFile, rm } from 'node:fs/promises'
import { basename } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'

import {
  assertBinaryGeometryRow,
  type BinaryGeometryRow,
} from './binaryGeometryMirror.ts'

type RemoteTableImport = {
  binaryRowsPath?: string
  hasRows: boolean
  pruneOperation?: CachePruneOperation | null
  sqlPath: string
  tableName: string
}
type BinaryTableImport = Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>

type CachePruneOperation = {
  tableName: string
  whereSql: string
}

type SqliteCacheWorkerPayload =
  | {
      destinationPath: string
      binaryTableImports?: BinaryTableImport[]
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
        payload.binaryTableImports ?? [],
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
  binaryTableImports: BinaryTableImport[] = [],
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
        try {
          sqlite.exec(dumpSql)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new Error(`Failed to import ${basename(dumpPath)}: ${message}`)
        }
      }
    }

    for (const tableImport of binaryTableImports) {
      await insertBinaryMirrorRows(sqlite, tableImport)
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
      if (tableImport.binaryRowsPath) {
        await insertBinaryMirrorRows(sqlite, tableImport)
        continue
      }

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

async function insertBinaryMirrorRows(
  sqlite: SQLiteDatabase,
  tableImport: BinaryTableImport,
) {
  if (!tableImport.binaryRowsPath) return

  const rows = JSON.parse(await readFile(tableImport.binaryRowsPath, 'utf8')) as Array<
    Omit<BinaryGeometryRow, 'geometry'> & { geometry: string | null }
  >
  if (rows.length === 0) return

  const columns = Object.keys(rows[0]?.values ?? {})
  const statement = sqlite.query(
    `INSERT INTO ${quoteSqlIdentifier(tableImport.tableName)} (${columns
      .map(quoteSqlIdentifier)
      .join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  )

  for (const row of rows) {
    const hydratedRow: BinaryGeometryRow = {
      ...row,
      geometry: row.geometry === null ? null : Buffer.from(row.geometry, 'hex'),
    }
    assertBinaryGeometryRow(hydratedRow)
    if (!columns.includes(hydratedRow.binaryColumn)) {
      throw new Error(
        `Binary mirror rows for ${tableImport.tableName} omit ${hydratedRow.binaryColumn}.`,
      )
    }
    const values: Array<Buffer | null | number | string> = columns.map(
      column => row.values[column] ?? null,
    )
    const geometryIndex = columns.indexOf(hydratedRow.binaryColumn)
    values[geometryIndex] =
      hydratedRow.geometryType === 'blob'
        ? hydratedRow.geometry
        : (hydratedRow.values[hydratedRow.binaryColumn] ?? null)
    statement.run(...values)
  }
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
