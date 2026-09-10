import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { geometrySha256, type BinaryGeometryRow } from './binaryGeometryMirror.ts'
import type { RemoteD1QueryClient } from './remoteD1Client.ts'
import type {
  CachePruneOperation,
  CacheTableProfile,
  D1TargetRecord,
  LocalDbCacheProgressEvent,
  RemoteTableImport,
} from './localDbCacheTypes.ts'
import {
  CACHE_ROOT,
  REMOTE_CACHE_BINDING_CONCURRENCY,
  WRANGLER_CONFIG_PATH,
} from './localDbCacheConfig.ts'
import { mapWithConcurrency } from './localDbCache.ts'
import {
  assertCachedDatabaseHasExpectedTables,
  resolveCachePruneOperation,
  resolveCacheTablesForBinding,
  shouldMirrorBindingSchemaOnly,
  shouldMirrorTableSchemaOnly,
} from './localDbCacheProfiles.ts'
import {
  checkpointSqliteDatabase,
  createRemoteD1QueryClient,
  exportRemoteDatabase,
  importDatabaseDumpsToSqlite,
  replaceCachedTableRows,
  runMirrorCommand,
  runWithProgressHeartbeat,
} from './localDbCacheIo.ts'
import { retryRemoteCacheExport } from './localDbCacheReplay.ts'
import {
  removeRemoteCachePartialCheckpoint,
  writeRemoteCachePartialCheckpoint,
} from './localDbCacheManifest.ts'
import {
  mirrorBinaryGeometryTable,
  resolveBinaryGeometryColumn,
  shouldMirrorBinaryGeometryTable,
} from './localDbCacheGeometry.ts'
import { quoteSqlIdentifier } from './localDbCacheReads.ts'

export function groupCacheExportTables(
  bindingName: string,
  tables: string[],
  profile?: CacheTableProfile,
) {
  return [false, true]
    .map(schemaOnly => ({
      schemaOnly,
      tables: tables.filter(
        table =>
          (shouldMirrorTableSchemaOnly(bindingName, table, profile) ||
            shouldMirrorBinaryGeometryTable(table)) === schemaOnly,
      ),
    }))
    .filter(group => group.tables.length > 0)
}

export async function refreshRemoteCacheTables(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  files: Record<string, string>,
  cacheDir: string,
  options: {
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    cacheTableProfile?: CacheTableProfile
    totalUnits: number
  },
) {
  const workDir = resolve(CACHE_ROOT, `.refresh-${target}`)
  const refreshedFiles = { ...files }
  let currentUnit = 0

  await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  await mkdir(cacheDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  try {
    await mapWithConcurrency(
      targets,
      REMOTE_CACHE_BINDING_CONCURRENCY,
      async targetRecord => {
        const destinationPath = refreshedFiles[targetRecord.bindingName]

        if (!destinationPath) {
          throw new Error(`Cache manifest is missing ${targetRecord.bindingName}.`)
        }

        const tables = resolveCacheTablesForBinding(
          targetRecord.bindingName,
          options.cacheTableProfile,
        )

        if (tables.length === 0) {
          await options.onProgress?.({
            action: 'export-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          })
          const dumpPath = resolve(workDir, `${targetRecord.bindingName}.sql`)
          const refreshedPath = resolve(workDir, `${targetRecord.bindingName}.sqlite`)

          await runWithProgressHeartbeat(
            options.onProgress,
            {
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              target,
              total: options.totalUnits,
            },
            () =>
              retryRemoteCacheExport(() =>
                exportRemoteDatabase(targetRecord, target, dumpPath, {
                  schemaOnly: shouldMirrorBindingSchemaOnly(
                    targetRecord.bindingName,
                    options.cacheTableProfile,
                  ),
                }),
              ),
          )
          await runWithProgressHeartbeat(
            options.onProgress,
            {
              action: 'copy-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              target,
              total: options.totalUnits,
            },
            () => importDatabaseDumpsToSqlite([dumpPath], refreshedPath),
          )
          currentUnit += 1

          await options.onProgress?.({
            action: 'copy-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          })
          await checkpointSqliteDatabase(refreshedPath)
          await copyFile(refreshedPath, destinationPath)
          currentUnit += 1
          return
        }

        const remoteD1Client = createRemoteD1QueryClient(targetRecord, target)
        const tableImports = await buildRemoteTableImports(
          targetRecord,
          target,
          tables,
          workDir,
          remoteD1Client,
        )
        const busyTableName = tableImports.at(-1)?.tableName

        await replaceCachedTableRows(
          destinationPath,
          targetRecord.bindingName,
          tableImports,
          async tableImport => {
            await options.onProgress?.({
              action: 'mirror-table',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              ...(tableImport.pruneOperation ? { filter: 'current rows' } : {}),
              tableName: tableImport.tableName,
              target,
              total: options.totalUnits,
            })
            currentUnit += 1
          },
          () =>
            options.onProgress?.({
              action: 'mirror-table',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              target,
              total: options.totalUnits,
              ...(tableImports.some(tableImport => tableImport.pruneOperation)
                ? { filter: 'current rows' }
                : {}),
              ...(busyTableName ? { tableName: busyTableName } : {}),
            }),
        )

        await options.onProgress?.({
          action: 'validate-binding',
          bindingName: targetRecord.bindingName,
          current: currentUnit,
          target,
          total: options.totalUnits,
        })
        await runWithProgressHeartbeat(
          options.onProgress,
          {
            action: 'validate-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          },
          () =>
            validateMirroredCacheBinding({
              bindingName: targetRecord.bindingName,
              cacheTableProfile: options.cacheTableProfile,
              destinationPath,
              binaryTableImports: tableImports,
            }),
        )
        currentUnit += 1
      },
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    throw new Error(
      `Failed to refresh ${target} D1 database cache.\n${errorMessage}`.trim(),
    )
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  }

  return refreshedFiles
}

export async function mirrorRemoteTargetToLocal(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  cacheDir: string,
  options: {
    cacheScopeKey?: string
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    cacheTableProfile?: CacheTableProfile
    preserveCacheDir?: boolean
    totalUnits: number
  },
) {
  const workDir = resolve(CACHE_ROOT, `.mirror-${target}`)
  const files: Record<string, string> = {}
  let currentUnit = 0

  if (!options.preserveCacheDir) {
    await rm(cacheDir, { force: true, recursive: true }).catch(() => undefined)
  }
  await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  await mkdir(cacheDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  try {
    await mapWithConcurrency(
      targets,
      REMOTE_CACHE_BINDING_CONCURRENCY,
      async targetRecord => {
        await removeRemoteCachePartialCheckpoint(cacheDir, targetRecord.bindingName)
        const tables = resolveCacheTablesForBinding(
          targetRecord.bindingName,
          options.cacheTableProfile,
        )
        const dumpPaths: string[] = []
        const remoteD1Client = createRemoteD1QueryClient(targetRecord, target)
        const binaryTableImports: Array<
          Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>
        > = []
        const pruneOperations: CachePruneOperation[] = []

        if (tables.length === 0) {
          await options.onProgress?.({
            action: 'export-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          })
          const dumpPath = resolve(workDir, `${targetRecord.bindingName}.sql`)
          await runWithProgressHeartbeat(
            options.onProgress,
            {
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              target,
              total: options.totalUnits,
            },
            () =>
              retryRemoteCacheExport(() =>
                exportRemoteDatabase(targetRecord, target, dumpPath, {
                  schemaOnly: shouldMirrorBindingSchemaOnly(
                    targetRecord.bindingName,
                    options.cacheTableProfile,
                  ),
                }),
              ),
          )
          dumpPaths.push(dumpPath)
          currentUnit += 1
        } else {
          for (const group of groupCacheExportTables(
            targetRecord.bindingName,
            tables,
            options.cacheTableProfile,
          )) {
            const dumpPath = resolve(
              workDir,
              `${targetRecord.bindingName}-${group.schemaOnly ? 'schema' : 'data'}.sql`,
            )
            const event: LocalDbCacheProgressEvent = {
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              tableName: group.tables[0],
              target,
              total: options.totalUnits,
            }
            await runWithProgressHeartbeat(options.onProgress, event, () =>
              retryRemoteCacheExport(() =>
                exportRemoteDatabase(targetRecord, target, dumpPath, group),
              ),
            )
            dumpPaths.push(dumpPath)
          }
          for (const tableName of tables) {
            const exportEvent: LocalDbCacheProgressEvent = {
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              tableName,
              target,
              total: options.totalUnits,
            }

            await options.onProgress?.(exportEvent)
            if (shouldMirrorBinaryGeometryTable(tableName)) {
              binaryTableImports.push({
                ...(await mirrorBinaryGeometryTable(
                  targetRecord,
                  tableName,
                  workDir,
                  remoteD1Client,
                )),
                tableName,
              })
            }
            const pruneOperation = resolveCachePruneOperation(
              targetRecord.bindingName,
              tableName,
            )

            if (pruneOperation) {
              pruneOperations.push(pruneOperation)
            }
            currentUnit += 1
          }
        }

        await options.onProgress?.({
          action: 'copy-binding',
          bindingName: targetRecord.bindingName,
          current: currentUnit,
          target,
          total: options.totalUnits,
        })
        const destinationPath = resolve(cacheDir, `${targetRecord.bindingName}.sqlite`)
        await runWithProgressHeartbeat(
          options.onProgress,
          {
            action: 'copy-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          },
          () =>
            importDatabaseDumpsToSqlite(
              dumpPaths,
              destinationPath,
              pruneOperations,
              binaryTableImports,
            ),
        )
        currentUnit += 1

        await options.onProgress?.({
          action: 'validate-binding',
          bindingName: targetRecord.bindingName,
          current: currentUnit,
          target,
          total: options.totalUnits,
        })
        await runWithProgressHeartbeat(
          options.onProgress,
          {
            action: 'validate-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          },
          () =>
            validateMirroredCacheBinding({
              bindingName: targetRecord.bindingName,
              cacheTableProfile: options.cacheTableProfile,
              destinationPath,
              binaryTableImports,
            }),
        )
        currentUnit += 1
        await writeRemoteCachePartialCheckpoint({
          bindingName: targetRecord.bindingName,
          cacheDir,
          cacheScopeKey: options.cacheScopeKey,
          cacheTableProfile: options.cacheTableProfile,
          filePath: destinationPath,
          target,
        })
        files[targetRecord.bindingName] = destinationPath
      },
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    throw new Error(
      `Failed to mirror ${target} D1 databases into local cache.\n${errorMessage}`.trim(),
    )
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  }

  return files
}

export function countRemoteCacheWorkUnits(
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  return targets.reduce((total, target) => {
    const tables = resolveCacheTablesForBinding(target.bindingName, cacheTableProfile)

    return total + Math.max(tables.length, 1) + 2
  }, 0)
}

export function countRemoteCacheRefreshWorkUnits(
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  return targets.reduce((total, target) => {
    const tables = resolveCacheTablesForBinding(target.bindingName, cacheTableProfile)

    return total + (tables.length === 0 ? 2 : tables.length + 1)
  }, 0)
}

export async function validateMirroredCacheBinding(input: {
  bindingName: string
  cacheTableProfile?: CacheTableProfile
  destinationPath: string
  binaryTableImports: Array<Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>>
}) {
  try {
    await validateMirroredCacheBindingUnchecked(input)
  } catch (error) {
    // A refreshed file which did not pass remote byte validation must never be
    // selected by a later upload, replay, or geometry backfill.
    await rm(input.destinationPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function validateMirroredCacheBindingUnchecked(input: {
  bindingName: string
  cacheTableProfile?: CacheTableProfile
  destinationPath: string
  binaryTableImports: Array<Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>>
}) {
  await assertCachedDatabaseHasExpectedTables(
    input.destinationPath,
    input.bindingName,
    input.cacheTableProfile,
  )
  // The binary rows are the exact remote bytes captured for this import. Keep
  // validation local to that capture; re-reading every geometry from D1 here
  // doubles the remote transfer without adding byte-level assurance.
  const sqlite = new SQLiteDatabase(input.destinationPath, { readonly: true })
  try {
    for (const tableImport of input.binaryTableImports) {
      const tableName = tableImport.tableName
      if (!shouldMirrorBinaryGeometryTable(tableName)) continue
      const binaryColumn = resolveBinaryGeometryColumn(tableName)
      if (!binaryColumn) continue
      const binaryRowsPath = tableImport.binaryRowsPath
      if (!binaryRowsPath) {
        throw new Error(
          `Binary mirror did not produce rows for ${input.bindingName}.${tableName}.`,
        )
      }
      const rows = JSON.parse(
        await readFile(binaryRowsPath, 'utf8'),
      ) as BinaryGeometryRow[]
      await rm(binaryRowsPath, { force: true })
      for (const row of rows) {
        const primaryKeyColumns =
          row.primaryKeyColumns ??
          [
            'id',
            'versionHash',
            'snapshotId',
            'sourceRecordId',
            'inputVersionHash',
            'transform',
          ].filter(column => column in row.values)
        const primaryKeys = primaryKeyColumns.map(
          column => [column, row.values[column] ?? null] as const,
        )
        const where = primaryKeys
          .map(([column]) => `${quoteSqlIdentifier(column)} = ?`)
          .join(' AND ')
        const local = sqlite
          .query(
            `SELECT typeof(${quoteSqlIdentifier(binaryColumn)}) AS type, length(${quoteSqlIdentifier(binaryColumn)}) AS length, hex(${quoteSqlIdentifier(binaryColumn)}) AS hex FROM ${quoteSqlIdentifier(tableName)} WHERE ${where}`,
          )
          .get(...primaryKeys.map(([, value]) => value)) as {
          hex?: string
          length?: number
          type?: string
        } | null
        if (
          !local ||
          local.type !== row.geometryType ||
          local.length !== row.geometryLength ||
          (row.geometryType === 'blob' &&
            geometrySha256(Buffer.from(local.hex ?? '', 'hex')) !== row.geometryDigest)
        ) {
          throw new Error(
            `Binary cache validation failed for ${input.bindingName}.${tableName} snapshot=${row.snapshotId ?? 'none'} record=${row.recordId}. Delete the refreshed cache and retry; production backfill remains blocked.`,
          )
        }
      }
    }
  } finally {
    sqlite.close()
  }
}

async function buildRemoteTableImports(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tables: string[],
  workDir: string,
  remoteD1Client: RemoteD1QueryClient,
) {
  const imports: RemoteTableImport[] = []

  for (const tableName of tables) {
    const tableDumpPath = resolve(
      workDir,
      `${targetRecord.bindingName}-${tableName}.sql`,
    )

    await runMirrorCommand([
      'bash',
      'libs/db/scripts/run-d1-export.sh',
      targetRecord.databaseName,
      '--config',
      WRANGLER_CONFIG_PATH,
      '--env',
      target,
      '--remote',
      `--table=${tableName}`,
      ...(shouldMirrorBinaryGeometryTable(tableName) ? ['--no-data'] : []),
      '--output',
      tableDumpPath,
    ])

    const tableDump = await readFile(tableDumpPath, 'utf8')
    const importSql = stripExportTableDefinition(tableDump)
    const pruneOperation = resolveCachePruneOperation(
      targetRecord.bindingName,
      tableName,
    )
    const sqlPath = resolve(
      workDir,
      `${targetRecord.bindingName}-${tableName}-import.sql`,
    )
    const hasRows = importSql.length > 0

    const binaryTableImport = shouldMirrorBinaryGeometryTable(tableName)
      ? await mirrorBinaryGeometryTable(
          targetRecord,
          tableName,
          workDir,
          remoteD1Client,
        )
      : null

    await writeFile(
      sqlPath,
      hasRows ? `PRAGMA defer_foreign_keys = true;\n\n${importSql}\n` : '',
    )
    imports.push({
      ...(binaryTableImport ?? {}),
      hasRows,
      pruneOperation,
      sqlPath,
      tableName,
    })
  }

  return imports
}

function stripExportTableDefinition(rawSql: string) {
  const withoutPragmas = rawSql
    .replaceAll('PRAGMA defer_foreign_keys=TRUE;\n', '')
    .replaceAll('PRAGMA defer_foreign_keys = true;\n', '')
    .trim()

  if (withoutPragmas.length === 0) {
    return ''
  }

  return withoutPragmas.replace(/^CREATE TABLE[\s\S]*?\);\s*/m, '').trim()
}
