import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  currentSchema,
  historySchema,
  metaSchema,
  sourceSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
  type SourceDatabase,
} from '@repo/db'
import type { UploadTarget } from '../cli/options.ts'
import type {
  CacheTableProfile,
  DbCacheManifest,
  LocalAddressDbContext,
  LocalD1ExecBinding,
  LocalDbCacheProgressEvent,
  OpenSqliteDb,
} from './localDbCacheTypes.ts'
import {
  buildHistoryTargets,
  buildSourceTargets,
  isUnableToOpenSqliteDatabase,
  mapLocalTargetPaths,
  parseBindingYear,
  requirePath,
  resolveAnnualShardYear,
  resolveD1Targets,
  resolveLatestConfiguredShardYear,
  resolveRemoteCacheDir,
  resolveShardBindingName,
  resolveTargetName,
} from './localDbCacheTargets.ts'
import { ensureRemoteCachePaths } from './localDbCacheManifest.ts'
import {
  CACHE_ROOT,
  DB_CACHE_MANIFEST_VERSION,
  LOCAL_SQLITE_OPEN_RETRY_DELAY_MS,
  LOCAL_SQLITE_OPEN_RETRY_LIMIT,
  REMOTE_CACHE_BINDING_CONCURRENCY,
  REPO_ROOT,
} from './localDbCacheConfig.ts'
import { retryRemoteCacheExport } from './localDbCacheReplay.ts'
import { exportRemoteDatabase, importDatabaseDumpsToSqlite } from './localDbCacheIo.ts'
import { assertCachedDatabaseHasExpectedTables } from './localDbCacheProfiles.ts'

export async function resolveLocalAddressDbContext(
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
  options: {
    resumeSqlDeliveryReleaseId?: string
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    cacheTableProfile?: CacheTableProfile
    includeAllHistoryShardYears?: boolean
    includeAllSourceShardYears?: boolean
    includePreviousShardYears?: boolean
    requireExistingRemoteCache?: boolean
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    remoteCacheScopeKey?: string
  } = {},
): Promise<LocalAddressDbContext> {
  const targetName = resolveTargetName(target)
  const targetRecords = await resolveD1Targets(targetName)
  const regionCodeToken = regionCode.trim().toUpperCase()
  const annualShardYear = resolveAnnualShardYear(shardYear)
  const shardYearNumber = Number.parseInt(annualShardYear, 10)
  const historyBindingName = resolveShardBindingName(
    'history',
    regionCodeToken,
    annualShardYear,
  )
  const sourceBindingName = resolveShardBindingName(
    'source',
    regionCodeToken,
    annualShardYear,
  )
  const requiredBindingNames = [
    'DB_META',
    'DB_CURRENT',
    historyBindingName,
    sourceBindingName,
  ] as const
  const requiredTargetRecords = targetRecords.filter(targetRecord => {
    const isRequiredBinding = requiredBindingNames.includes(
      targetRecord.bindingName as (typeof requiredBindingNames)[number],
    )

    if (isRequiredBinding) {
      return true
    }

    const isHistoryBinding =
      targetRecord.bindingName === `DB_HISTORY_${regionCodeToken}_BEFORE` ||
      parseBindingYear(targetRecord.bindingName, `DB_HISTORY_${regionCodeToken}_`) !==
        null
    if (options.includeAllHistoryShardYears && isHistoryBinding) {
      return true
    }

    const isSourceBinding =
      targetRecord.bindingName === `DB_SOURCE_${regionCodeToken}_BEFORE` ||
      parseBindingYear(targetRecord.bindingName, `DB_SOURCE_${regionCodeToken}_`) !==
        null
    if (options.includeAllSourceShardYears && isSourceBinding) {
      return true
    }

    if (!options.includePreviousShardYears) {
      return false
    }

    if (
      targetRecord.bindingName === `DB_HISTORY_${regionCodeToken}_BEFORE` ||
      targetRecord.bindingName === `DB_SOURCE_${regionCodeToken}_BEFORE`
    ) {
      return true
    }

    const historyYear = parseBindingYear(
      targetRecord.bindingName,
      `DB_HISTORY_${regionCodeToken}_`,
    )
    const sourceYear = parseBindingYear(
      targetRecord.bindingName,
      `DB_SOURCE_${regionCodeToken}_`,
    )

    return (
      (historyYear !== null &&
        Number.isInteger(shardYearNumber) &&
        historyYear < shardYearNumber) ||
      (sourceYear !== null &&
        Number.isInteger(shardYearNumber) &&
        sourceYear < shardYearNumber)
    )
  })
  const requiredTargetRecordsByBindingName = new Map(
    requiredTargetRecords.map(targetRecord => [targetRecord.bindingName, targetRecord]),
  )
  const dbPaths =
    targetName === 'local'
      ? mapLocalTargetPaths(requiredTargetRecords)
      : await ensureRemoteCachePaths(targetName, requiredTargetRecords, options)
  const dbCacheDir =
    targetName === 'local'
      ? dirname(requirePath(dbPaths.DB_META, 'DB_META'))
      : resolveRemoteCacheDir(targetName, options.remoteCacheScopeKey)
  const metaPath = requirePath(dbPaths.DB_META, 'DB_META')
  const currentPath = requirePath(dbPaths.DB_CURRENT, 'DB_CURRENT')
  const historyPath = requirePath(dbPaths[historyBindingName], historyBindingName)
  const sourcePath = requirePath(dbPaths[sourceBindingName], sourceBindingName)
  const meta = (await openSqliteDb(
    metaPath,
    metaSchema,
    'DB_META',
  )) as unknown as OpenSqliteDb<MetaDatabase>
  const current = (await openSqliteDb(
    currentPath,
    currentSchema,
    'DB_CURRENT',
  )) as unknown as OpenSqliteDb<CurrentDatabase>
  const history = (await openSqliteDb(
    historyPath,
    historySchema,
    historyBindingName,
  )) as unknown as OpenSqliteDb<HistoryDatabase>
  const source = (await openSqliteDb(
    sourcePath,
    sourceSchema,
    sourceBindingName,
  )) as unknown as OpenSqliteDb<SourceDatabase>
  const internalHistoryTargets = await buildHistoryTargets(
    requiredTargetRecordsByBindingName,
    dbPaths,
    regionCodeToken,
    annualShardYear,
    history,
    options.includeAllHistoryShardYears,
  )
  const internalSourceTargets = await buildSourceTargets(
    requiredTargetRecordsByBindingName,
    dbPaths,
    regionCodeToken,
    annualShardYear,
    source,
    options.includeAllSourceShardYears,
  )
  const historyTargets = internalHistoryTargets.map(target => ({
    binding: target.binding,
    bindingName: target.bindingName,
    databaseId: target.databaseId,
    databaseName: target.databaseName,
    db: target.openDb.db,
    year: target.year,
  }))
  const sourceTargets = internalSourceTargets.map(target => ({
    binding: target.binding,
    bindingName: target.bindingName,
    databaseId: target.databaseId,
    databaseName: target.databaseName,
    db: target.openDb.db,
    year: target.year,
  }))

  return {
    cleanup() {
      for (const target of internalSourceTargets) {
        if (target.openDb !== source) {
          target.openDb.sqlite.close()
        }
      }
      for (const target of internalHistoryTargets) {
        if (target.openDb !== history) {
          target.openDb.sqlite.close()
        }
      }
      source.sqlite.close()
      history.sqlite.close()
      current.sqlite.close()
      meta.sqlite.close()
    },
    currentBinding: createLocalExecBinding(current.sqlite),
    currentDb: current.db,
    historyBinding: createLocalExecBinding(history.sqlite),
    historyDb: history.db,
    historyTargets,
    metaBinding: createLocalExecBinding(meta.sqlite),
    metaDb: meta.db,
    sourceBinding: createLocalExecBinding(source.sqlite),
    sourceDb: source.db,
    sourceTargets,
    state: {
      bindings: Object.fromEntries(
        requiredTargetRecords.map(targetRecord => [
          targetRecord.bindingName,
          {
            databaseId: targetRecord.databaseId,
            databaseName: targetRecord.databaseName,
          },
        ]),
      ),
      dbCacheDir: dbCacheDir,
      preparedAt: new Date().toISOString(),
      target: targetName,
    },
  }
}

/**
 * Rebuilds the shared remote cache from the configured production or preview
 * D1 databases. This is intentionally explicit because it replaces the local
 * cache rather than replaying a release into it.
 */
export async function rebuildRemoteDbCache(
  target: UploadTarget,
  onProgress?: (event: LocalDbCacheProgressEvent) => void,
  cacheTableProfile?: CacheTableProfile,
  shardYear?: string,
) {
  if (!target.remote) {
    throw new Error(
      'The remote D1 cache can only be rebuilt for preview or production.',
    )
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const resolvedShardYear =
    shardYear ?? (await resolveLatestConfiguredShardYear(targetName))
  const dbContext = await resolveLocalAddressDbContext(
    target,
    'hk',
    resolvedShardYear,
    {
      cacheTableProfile,
      onProgress,
      includePreviousShardYears: true,
      refreshRemoteCache: true,
    },
  )

  dbContext.cleanup()
}

/**
 * Seeds the post-reset mirror without exporting empty data databases. DB_META
 * is the sole remote export because fixture synchronisation creates new IDs;
 * every other binding is built locally from the checked-in schema baseline.
 */
export async function seedRemoteDbCacheAfterReset(
  target: UploadTarget,
  onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void,
) {
  if (!target.remote) {
    throw new Error('A post-reset cache seed requires preview or production.')
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const targets = await resolveD1Targets(targetName)
  const cacheDir = resolveRemoteCacheDir(targetName)
  const workDir = resolve(CACHE_ROOT, `.seed-reset-${targetName}`)
  const files: Record<string, string> = {}
  let completed = 0

  await rm(cacheDir, { force: true, recursive: true })
  await rm(workDir, { force: true, recursive: true })
  await mkdir(cacheDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  try {
    await mapWithConcurrency(
      targets,
      REMOTE_CACHE_BINDING_CONCURRENCY,
      async targetRecord => {
        const destinationPath = resolve(cacheDir, `${targetRecord.bindingName}.sqlite`)
        await onProgress?.({
          action: 'export-binding',
          bindingName: targetRecord.bindingName,
          current: completed,
          target: targetName,
          total: targets.length,
        })

        if (targetRecord.bindingName === 'DB_META') {
          const dumpPath = resolve(workDir, 'DB_META.sql')
          await retryRemoteCacheExport(() =>
            exportRemoteDatabase(targetRecord, targetName, dumpPath),
          )
          await importDatabaseDumpsToSqlite([dumpPath], destinationPath)
        } else {
          await createEmptyCacheDatabaseFromMigrations(
            targetRecord.bindingName,
            destinationPath,
          )
        }

        await assertCachedDatabaseHasExpectedTables(
          destinationPath,
          targetRecord.bindingName,
        )
        files[targetRecord.bindingName] = destinationPath
        completed += 1
        await onProgress?.({
          action: 'validate-binding',
          bindingName: targetRecord.bindingName,
          current: completed,
          target: targetName,
          total: targets.length,
        })
      },
    )

    await writeFile(
      resolve(cacheDir, 'manifest.json'),
      JSON.stringify(
        {
          cacheVersion: DB_CACHE_MANIFEST_VERSION,
          files,
          preparedAt: new Date().toISOString(),
          target: targetName,
        } satisfies DbCacheManifest,
        null,
        2,
      ),
    )
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}

async function createEmptyCacheDatabaseFromMigrations(
  bindingName: string,
  destinationPath: string,
) {
  const family =
    bindingName === 'DB_CURRENT'
      ? 'current'
      : bindingName.startsWith('DB_HISTORY_')
        ? 'history'
        : bindingName.startsWith('DB_SOURCE_')
          ? 'source'
          : null
  if (!family) throw new Error(`Cannot resolve migration family for ${bindingName}.`)

  const migrationRoot = resolve(REPO_ROOT, 'libs/db/migrations', family)
  const migrationPaths = await listMigrationSqlPaths(migrationRoot)
  if (migrationPaths.length === 0) {
    throw new Error(`No ${family} migration baseline exists at ${migrationRoot}.`)
  }

  await rm(destinationPath, { force: true })
  await mkdir(dirname(destinationPath), { recursive: true })
  const sqlite = new SQLiteDatabase(destinationPath, { create: true })
  try {
    for (const migrationPath of migrationPaths) {
      sqlite.exec(await readFile(migrationPath, 'utf8'))
    }
  } finally {
    sqlite.close()
  }
}

async function listMigrationSqlPaths(root: string): Promise<string[]> {
  const paths: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = resolve(root, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await listMigrationSqlPaths(entryPath)))
    } else if (entry.isFile() && entry.name === 'migration.sql') {
      paths.push(entryPath)
    }
  }
  return paths.sort((left, right) => left.localeCompare(right))
}

/**
 * Opens only the shared local metadata database. Use this for local services
 * that do not need a resource shard, such as immutable evidence registration.
 */
export async function withLocalMetaDb<T>(
  work: (db: MetaDatabase) => Promise<T> | T,
): Promise<T> {
  const metaTarget = (await resolveD1Targets('local')).find(
    target => target.bindingName === 'DB_META',
  )
  if (!metaTarget) throw new Error('Could not resolve the local DB_META binding.')

  const metaPath = requirePath(mapLocalTargetPaths([metaTarget]).DB_META, 'DB_META')
  const meta = (await openSqliteDb(
    metaPath,
    metaSchema,
    'DB_META',
  )) as unknown as OpenSqliteDb<MetaDatabase>

  try {
    return await work(meta.db)
  } finally {
    meta.sqlite.close()
  }
}

export function createLocalExecBinding(sqlite: SQLiteDatabase): LocalD1ExecBinding {
  return {
    async batch(statements) {
      sqlite.exec('BEGIN')

      try {
        for (const statement of statements) {
          sqlite.exec(statement.sql)
        }

        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    prepare(sql: string) {
      return {
        async run() {
          sqlite.exec(sql)
        },
        sql,
      }
    },
  }
}

export function openSqliteDb<TSchema extends Record<string, unknown>>(
  filePath: string,
  schema: TSchema,
  bindingName: string,
) {
  return openSqliteDbWithRetry(filePath, schema, bindingName)
}

export async function openSqliteDbWithRetry<TSchema extends Record<string, unknown>>(
  filePath: string,
  schema: TSchema,
  bindingName: string,
) {
  let lastError: unknown

  for (let attempt = 1; attempt <= LOCAL_SQLITE_OPEN_RETRY_LIMIT; attempt += 1) {
    try {
      const sqlite = new SQLiteDatabase(filePath)

      try {
        sqlite.exec('PRAGMA foreign_keys = ON;')
      } catch (error) {
        sqlite.close()
        throw error
      }

      return {
        db: drizzle({
          client: sqlite,
          schema,
        }),
        sqlite,
      }
    } catch (error) {
      lastError = error

      if (
        !isUnableToOpenSqliteDatabase(error) ||
        attempt === LOCAL_SQLITE_OPEN_RETRY_LIMIT
      ) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Could not open local D1 binding ${bindingName} at ${filePath}: ${reason}`,
        )
      }

      await new Promise<void>(resolve => {
        setTimeout(resolve, LOCAL_SQLITE_OPEN_RETRY_DELAY_MS * attempt)
      })
    }
  }

  throw lastError
}

export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const limit = Math.max(1, Math.floor(concurrency))
  let nextIndex = 0
  let failure: unknown = null

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        if (failure) {
          return
        }
        const item = items[nextIndex]
        nextIndex += 1

        if (item !== undefined) {
          try {
            await worker(item)
          } catch (error) {
            // Wait for other in-flight workers before the caller removes a
            // shared temporary directory. That preserves the primary error.
            failure ??= error
            return
          }
        }
      }
    }),
  )

  if (failure) {
    throw failure
  }
}

export type {
  LocalD1ExecBinding,
  LocalAddressDbContext,
  LocalDbCacheProgressEvent,
  CacheTableProfile,
} from './localDbCacheTypes.ts'

export {
  resolveSharedRemoteDbCacheDir,
  buildReleaseUploadDbCacheScopeKey,
  resetRemoteReleaseUploadCacheScope,
  resolveShardBindingName,
} from './localDbCacheTargets.ts'

export {
  readRemoteCachedCompletedReleaseCodes,
  withRemoteCachedMetaDb,
} from './localDbCacheReads.ts'

export { updateDbCacheProgress } from './localDbCacheDisplay.ts'

export {
  refreshRemoteMetaCache,
  applyPublishMetadataDeltaToRemoteCache,
  invalidateRemoteDbCache,
  replayRemoteCacheWithRetry,
} from './localDbCacheReplay.ts'

export {
  resolveCacheTablesForBinding,
  resolveCachePruneOperation,
} from './localDbCacheProfiles.ts'
