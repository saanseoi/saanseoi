import { createHmac, createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  stat,
  rm,
  readdir,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

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

import type { UploadTarget } from '../options.ts'

type D1TargetRecord = {
  bindingName: string
  databaseId: string | null
  databaseName: string
  localDatabaseId: string
}

type DbCacheManifest = {
  cacheVersion: number
  cacheScopeKey?: string
  cacheTableProfile?: CacheTableProfile
  preparedAt: string
  target: 'local' | 'preview' | 'production'
  files: Record<string, string>
}

type LocalD1PreparedStatement = {
  run(): Promise<unknown>
  sql: string
}

export type LocalD1ExecBinding = {
  batch(statements: LocalD1PreparedStatement[]): Promise<unknown>
  prepare(sql: string): LocalD1PreparedStatement
}

export type LocalAddressDbContext = {
  cleanup(): void
  currentBinding?: LocalD1ExecBinding
  currentDb: CurrentDatabase
  historyBinding?: LocalD1ExecBinding
  historyDb: HistoryDatabase
  historyTargets: Array<{
    binding?: LocalD1ExecBinding
    bindingName: string
    databaseId: string | null
    databaseName: string
    db: unknown
    year: string
  }>
  metaBinding?: LocalD1ExecBinding
  metaDb: MetaDatabase
  sourceBinding?: LocalD1ExecBinding
  sourceDb: SourceDatabase
  sourceTargets: Array<{
    binding?: LocalD1ExecBinding
    bindingName: string
    databaseId: string | null
    databaseName: string
    db: unknown
    year: string
  }>
  state: {
    bindings: Record<
      string,
      {
        databaseId: string | null
        databaseName: string
      }
    >
    dbCacheDir: string
    preparedAt: string
    target: 'local' | 'preview' | 'production'
  }
}

export type LocalDbCacheProgressEvent = {
  action:
    | 'check-cache'
    | 'export-binding'
    | 'reuse-cache'
    | 'mirror-table'
    | 'copy-binding'
    | 'validate-binding'
  bindingName: string
  current: number
  filter?: string
  tableName?: string
  target: 'preview' | 'production'
  total: number
}

type OpenSqliteDb<TDb> = {
  db: TDb
  sqlite: SQLiteDatabase
}

type InternalLocalShardTarget<TDb> = {
  binding?: LocalD1ExecBinding
  bindingName: string
  databaseId: string | null
  databaseName: string
  openDb: OpenSqliteDb<TDb> | OpenSqliteDb<unknown>
  year: string
}

type RemoteTableImport = {
  hasRows: boolean
  sqlPath: string
  tableName: string
}
type CacheTableProfile = 'address' | 'division' | 'divisionGeometry'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const WRANGLER_CONFIG_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')
const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')
const CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/db-cache')
const DB_CACHE_MANIFEST_VERSION = 3
const REMOTE_CACHE_BINDING_CONCURRENCY = 4
const WRANGLER_CONFIG_HOME = resolve(REPO_ROOT, '.local/wrangler')
const WRANGLER_LOG_PATH = resolve(WRANGLER_CONFIG_HOME, 'logs')

function resolveRemoteCacheDir(
  target: 'preview' | 'production',
  cacheScopeKey?: string,
) {
  if (!cacheScopeKey) {
    return resolve(CACHE_ROOT, target)
  }

  const scopeHash = createHash('sha256')
    .update(cacheScopeKey)
    .digest('hex')
    .slice(0, 12)
  const scopeSlug = cacheScopeKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)

  return resolve(CACHE_ROOT, target, `${scopeSlug || 'scope'}-${scopeHash}`)
}

export function buildReleaseUploadDbCacheScopeKey(options: {
  cacheTableProfile: CacheTableProfile
  cohortKey: string
  regionCode: string
  shardYear: string
  source: string
  sourceVersion: string
  theme: string
  type: string
}) {
  return [
    'release-upload',
    options.cacheTableProfile,
    options.regionCode.trim().toLowerCase(),
    options.shardYear.trim(),
    options.source.trim().toLowerCase(),
    options.sourceVersion.trim(),
    options.cohortKey.trim(),
    options.theme.trim().toLowerCase(),
    options.type.trim().toLowerCase(),
  ].join(':')
}

export async function resolveLocalAddressDbContext(
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
  options: {
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    cacheTableProfile?: CacheTableProfile
    includePreviousShardYears?: boolean
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    requireExistingRemoteCache?: boolean
    remoteCacheScopeKey?: string
  } = {},
): Promise<LocalAddressDbContext> {
  const targetName = resolveTargetName(target)
  const targetRecords = await resolveD1Targets(targetName)
  const regionCodeToken = regionCode.trim().toUpperCase()
  const shardYearNumber = Number.parseInt(shardYear, 10)
  const historyBindingName = `DB_HISTORY_${regionCodeToken}_${shardYear}`
  const sourceBindingName = `DB_SOURCE_${regionCodeToken}_${shardYear}`
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

    if (!options.includePreviousShardYears) {
      return false
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
  const meta = openSqliteDb(
    metaPath,
    metaSchema,
  ) as unknown as OpenSqliteDb<MetaDatabase>
  const current = openSqliteDb(
    currentPath,
    currentSchema,
  ) as unknown as OpenSqliteDb<CurrentDatabase>
  const history = openSqliteDb(
    historyPath,
    historySchema,
  ) as unknown as OpenSqliteDb<HistoryDatabase>
  const source = openSqliteDb(
    sourcePath,
    sourceSchema,
  ) as unknown as OpenSqliteDb<SourceDatabase>
  const internalHistoryTargets = buildHistoryTargets(
    requiredTargetRecordsByBindingName,
    dbPaths,
    regionCodeToken,
    shardYear,
    targetName,
    history,
  )
  const internalSourceTargets = buildSourceTargets(
    requiredTargetRecordsByBindingName,
    dbPaths,
    regionCodeToken,
    shardYear,
    targetName,
    source,
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
    currentBinding:
      targetName === 'local' ? createLocalExecBinding(current.sqlite) : undefined,
    currentDb: current.db,
    historyBinding:
      targetName === 'local' ? createLocalExecBinding(history.sqlite) : undefined,
    historyDb: history.db,
    historyTargets,
    metaBinding:
      targetName === 'local' ? createLocalExecBinding(meta.sqlite) : undefined,
    metaDb: meta.db,
    sourceBinding:
      targetName === 'local' ? createLocalExecBinding(source.sqlite) : undefined,
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
 * Remove an unusable mirrored remote-D1 cache after a post-upload replay
 * failure. The next upload will make a fresh, explicit mirror rather than
 * trusting partial local state.
 */
export async function invalidateRemoteDbCache(
  target: 'preview' | 'production',
  cacheDir: string,
  _reason: string,
) {
  if (!cacheDir.startsWith(resolveRemoteCacheDir(target))) {
    throw new Error(`Refusing to invalidate cache outside the ${target} cache root.`)
  }
  await rm(cacheDir, { force: true, recursive: true })
}

/** Refresh just the mirrored metadata database after a remote release replay. */
export async function refreshRemoteMetaCache(
  target: 'preview' | 'production',
  cacheDir: string,
) {
  const manifest = await readManifest(join(cacheDir, 'manifest.json'))
  const metaTarget = (await resolveD1Targets(target)).find(
    targetRecord => targetRecord.bindingName === 'DB_META',
  )
  if (!metaTarget) {
    throw new Error(`Could not resolve DB_META for ${target}.`)
  }
  await ensureRemoteCachePaths(target, [metaTarget], {
    cacheTableProfile: manifest?.cacheTableProfile,
    refreshRemoteTables: true,
    remoteCacheScopeKey: manifest?.cacheScopeKey,
  })
}

function createLocalExecBinding(sqlite: SQLiteDatabase): LocalD1ExecBinding {
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

function openSqliteDb<TSchema extends Record<string, unknown>>(
  filePath: string,
  schema: TSchema,
) {
  const sqlite = new SQLiteDatabase(filePath)
  sqlite.exec('PRAGMA foreign_keys = ON;')

  const db = drizzle({
    client: sqlite,
    schema,
  })

  return {
    db,
    sqlite,
  }
}

function resolveTargetName(target: UploadTarget): 'local' | 'preview' | 'production' {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function parseBindingYear(bindingName: string, prefix: string) {
  if (!bindingName.startsWith(prefix)) {
    return null
  }

  const year = bindingName.slice(prefix.length)

  return /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : null
}

function buildHistoryTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  targetName: 'local' | 'preview' | 'production',
  primary: OpenSqliteDb<HistoryDatabase>,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_HISTORY_${regionCodeToken}_`,
    shardYear,
    targetName,
    historySchema,
    primary,
  )
}

function buildSourceTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  targetName: 'local' | 'preview' | 'production',
  primary: OpenSqliteDb<SourceDatabase>,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_SOURCE_${regionCodeToken}_`,
    shardYear,
    targetName,
    sourceSchema,
    primary,
  )
}

function buildShardTargets<TSchema extends Record<string, unknown>, TDb>(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  bindingPrefix: string,
  shardYear: string,
  targetName: 'local' | 'preview' | 'production',
  schema: TSchema,
  primary: OpenSqliteDb<TDb>,
) {
  const targets: InternalLocalShardTarget<TDb>[] = []

  for (const targetRecord of targetRecordsByBindingName.values()) {
    const year = parseBindingYear(targetRecord.bindingName, bindingPrefix)

    if (year === null || year > Number.parseInt(shardYear, 10)) {
      continue
    }

    const openDb =
      targetRecord.bindingName === `${bindingPrefix}${shardYear}`
        ? primary
        : (openSqliteDb(
            requirePath(dbPaths[targetRecord.bindingName], targetRecord.bindingName),
            schema,
          ) as OpenSqliteDb<TDb>)

    targets.push({
      binding:
        targetName === 'local' ? createLocalExecBinding(openDb.sqlite) : undefined,
      bindingName: targetRecord.bindingName,
      databaseId: targetRecord.databaseId,
      databaseName: targetRecord.databaseName,
      openDb,
      year: String(year),
    })
  }

  return targets.sort((left, right) => left.year.localeCompare(right.year))
}

async function resolveD1Targets(target: 'local' | 'preview' | 'production') {
  const rawConfig = await readFile(WRANGLER_CONFIG_PATH, 'utf8')
  const config = JSON.parse(rawConfig) as {
    d1_databases?: Array<Record<string, unknown>>
    env?: {
      preview?: {
        d1_databases?: Array<Record<string, unknown>>
      }
      production?: {
        d1_databases?: Array<Record<string, unknown>>
      }
    }
  }
  const wranglerTarget = target === 'production' ? 'production' : 'preview'
  const entries =
    wranglerTarget === 'production'
      ? (config.env?.production?.d1_databases ?? config.d1_databases ?? [])
      : (config.env?.preview?.d1_databases ?? config.d1_databases ?? [])

  return entries.filter(isD1TargetEntry).map(entry => ({
    bindingName: entry.binding,
    databaseId: entry.database_id ?? null,
    databaseName: entry.database_name,
    localDatabaseId: entry.preview_database_id ?? entry.database_id ?? entry.binding,
  }))
}

function isD1TargetEntry(entry: Record<string, unknown>): entry is {
  binding: string
  database_id?: string
  database_name: string
  preview_database_id?: string
} {
  return (
    typeof entry.binding === 'string' &&
    typeof entry.database_name === 'string' &&
    (entry.binding === 'DB_META' ||
      entry.binding === 'DB_CURRENT' ||
      /^DB_HISTORY_[A-Z]{2}_\d{4}$/.test(entry.binding) ||
      /^DB_SOURCE_[A-Z]{2}_\d{4}$/.test(entry.binding))
  )
}

function mapLocalTargetPaths(targets: D1TargetRecord[]) {
  return Object.fromEntries(
    targets.map(target => [
      target.bindingName,
      resolveLocalD1SqlitePath(target.localDatabaseId),
    ]),
  )
}

async function ensureRemoteCachePaths(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  options: {
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    remoteCacheScopeKey?: string
    cacheTableProfile?: CacheTableProfile
  } = {},
) {
  const cacheDir = resolveRemoteCacheDir(target, options.remoteCacheScopeKey)
  const manifestPath = join(cacheDir, 'manifest.json')
  const existingManifest = await readManifest(manifestPath)
  const shouldRefreshRemoteTables =
    options.refreshRemoteTables && !options.refreshRemoteCache
  const totalUnits = shouldRefreshRemoteTables
    ? countRemoteCacheRefreshWorkUnits(targets, options.cacheTableProfile)
    : countRemoteCacheWorkUnits(targets, options.cacheTableProfile)

  await options.onProgress?.({
    action: 'check-cache',
    bindingName: 'cache',
    current: 0,
    target,
    total: totalUnits,
  })

  if (
    !options.refreshRemoteCache &&
    existingManifest &&
    existingManifest.cacheVersion === DB_CACHE_MANIFEST_VERSION &&
    existingManifest.target === target &&
    existingManifest.cacheScopeKey === options.remoteCacheScopeKey &&
    existingManifest.cacheTableProfile === options.cacheTableProfile &&
    (await doCachedFilesExist(
      existingManifest.files,
      targets,
      options.cacheTableProfile,
    ))
  ) {
    if (shouldRefreshRemoteTables) {
      const files = await refreshRemoteCacheTables(
        target,
        targets,
        existingManifest.files,
        cacheDir,
        {
          onProgress: options.onProgress,
          cacheTableProfile: options.cacheTableProfile,
          totalUnits,
        },
      )
      const manifest: DbCacheManifest = {
        ...existingManifest,
        cacheScopeKey: options.remoteCacheScopeKey,
        cacheTableProfile: options.cacheTableProfile,
        files,
        preparedAt: new Date().toISOString(),
      }

      await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      return files
    }

    await options.onProgress?.({
      action: 'reuse-cache',
      bindingName: 'cache',
      current: totalUnits,
      target,
      total: totalUnits,
    })
    return existingManifest.files
  }

  const files = await mirrorRemoteTargetToLocal(target, targets, cacheDir, {
    cacheTableProfile: options.cacheTableProfile,
    onProgress: options.onProgress,
    totalUnits,
  })

  const manifest: DbCacheManifest = {
    cacheVersion: DB_CACHE_MANIFEST_VERSION,
    cacheScopeKey: options.remoteCacheScopeKey,
    cacheTableProfile: options.cacheTableProfile,
    files,
    preparedAt: new Date().toISOString(),
    target,
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  return files
}

async function refreshRemoteCacheTables(
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

        const tables = resolveMirrorTablesForBinding(
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

          await exportRemoteDatabase(targetRecord, target, dumpPath)
          await importDatabaseDumpsToSqlite([dumpPath], refreshedPath)
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

        const tableImports = await buildRemoteTableImports(
          targetRecord,
          target,
          tables,
          workDir,
        )

        await replaceCachedTableRows(
          destinationPath,
          targetRecord.bindingName,
          tableImports,
          async tableImport => {
            await options.onProgress?.({
              action: 'mirror-table',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              tableName: tableImport.tableName,
              target,
              total: options.totalUnits,
            })
            currentUnit += 1
          },
        )

        await options.onProgress?.({
          action: 'validate-binding',
          bindingName: targetRecord.bindingName,
          current: currentUnit,
          target,
          total: options.totalUnits,
        })
        await assertCachedDatabaseHasExpectedTables(
          destinationPath,
          targetRecord.bindingName,
          options.cacheTableProfile,
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

async function readManifest(manifestPath: string) {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    return JSON.parse(raw) as DbCacheManifest
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

async function doCachedFilesExist(
  files: Record<string, string>,
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  for (const target of targets) {
    if (!(target.bindingName in files)) {
      return false
    }
  }

  for (const [bindingName, filePath] of Object.entries(files)) {
    if (!existsSync(filePath)) {
      return false
    }

    const fileStat = await stat(filePath)

    if (fileStat.size <= 0) {
      return false
    }

    if (!(await hasExpectedTables(filePath, bindingName, cacheTableProfile))) {
      return false
    }
  }

  return true
}

async function mirrorRemoteTargetToLocal(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  cacheDir: string,
  options: {
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    cacheTableProfile?: CacheTableProfile
    totalUnits: number
  },
) {
  const workDir = resolve(CACHE_ROOT, `.mirror-${target}`)
  const files: Record<string, string> = {}
  let currentUnit = 0

  await rm(cacheDir, { force: true, recursive: true }).catch(() => undefined)
  await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  await mkdir(cacheDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  try {
    await mapWithConcurrency(
      targets,
      REMOTE_CACHE_BINDING_CONCURRENCY,
      async targetRecord => {
        const tables = resolveMirrorTablesForBinding(
          targetRecord.bindingName,
          options.cacheTableProfile,
        )
        const dumpPaths: string[] = []

        if (tables.length === 0) {
          await options.onProgress?.({
            action: 'export-binding',
            bindingName: targetRecord.bindingName,
            current: currentUnit,
            target,
            total: options.totalUnits,
          })
          const dumpPath = resolve(workDir, `${targetRecord.bindingName}.sql`)
          await exportRemoteDatabase(targetRecord, target, dumpPath)
          dumpPaths.push(dumpPath)
          currentUnit += 1
        } else {
          for (const tableName of tables) {
            await options.onProgress?.({
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              tableName,
              target,
              total: options.totalUnits,
            })
            const dumpPath = resolve(
              workDir,
              `${targetRecord.bindingName}-${tableName}.sql`,
            )
            await exportRemoteTable(targetRecord, target, tableName, dumpPath)
            dumpPaths.push(dumpPath)
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
        await importDatabaseDumpsToSqlite(dumpPaths, destinationPath)
        currentUnit += 1

        await options.onProgress?.({
          action: 'validate-binding',
          bindingName: targetRecord.bindingName,
          current: currentUnit,
          target,
          total: options.totalUnits,
        })
        await assertCachedDatabaseHasExpectedTables(
          destinationPath,
          targetRecord.bindingName,
          options.cacheTableProfile,
        )
        currentUnit += 1
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

function countRemoteCacheWorkUnits(
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  return targets.reduce((total, target) => {
    const tables = resolveMirrorTablesForBinding(target.bindingName, cacheTableProfile)

    return total + Math.max(tables.length, 1) + 2
  }, 0)
}

function countRemoteCacheRefreshWorkUnits(
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  return targets.reduce((total, target) => {
    const tables = resolveMirrorTablesForBinding(target.bindingName, cacheTableProfile)

    return total + (tables.length === 0 ? 2 : tables.length + 1)
  }, 0)
}

function resolveMirrorTablesForBinding(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (bindingName === 'DB_META') {
    return []
  }

  if (bindingName === 'DB_CURRENT') {
    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return ['divisions', 'divisionAreas', 'divisionBoundaries']
    }

    return ['divisions', 'divisionsI18n', 'address2d', 'address2dI18n']
  }

  if (/^DB_HISTORY_[A-Z]{2}_\d{4}$/.test(bindingName)) {
    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return ['divisionAreas', 'divisionBoundaries']
    }

    return ['divisions', 'divisionsI18n', 'address2d', 'address2dI18n']
  }

  if (/^DB_SOURCE_[A-Z]{2}_\d{4}$/.test(bindingName)) {
    if (cacheTableProfile === 'division') {
      return [
        'overtureDivisions',
        'hkgovPlandDivisions',
        'hkgovPlandDivisionI18n',
        'hkgovPlandPlanningCells',
      ]
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return [
        'overtureDivisionAreas',
        'overtureDivisionBoundaries',
        'hkgovHadDivisionAreas',
        'hkgovPlandDivisionAreas',
        'hkgovPlandNewTownDivisionAreas',
        'hkgovPlandNewTownDivisionAreaI18n',
      ]
    }

    return ['overtureDivisions', 'overtureAddresses2d', 'hkgovAlsAddresses2d']
  }

  return []
}

function resolveExpectedTablesForBinding(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (bindingName === 'DB_META') {
    return [
      'publishers',
      'publisherI18n',
      'licenses',
      'datasets',
      'datasetI18n',
      'dataShards',
      'apiVersions',
      'apiReleaseSets',
      'releases',
      'snapshots',
      'snapshotSources',
      'snapshotAssembly',
      'snapshotAssemblySources',
      'snapshotAssemblyRuns',
      'identifierBridges',
    ]
  }

  return resolveMirrorTablesForBinding(bindingName, cacheTableProfile)
}

async function resolveMirroredSqlitePath(
  persistRoot: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
): Promise<string> {
  const sqliteDir = resolve(persistRoot, 'v3/d1/miniflare-D1DatabaseObject')
  const expectedTables = resolveExpectedTablesForBinding(bindingName, cacheTableProfile)
  const entries = existsSync(sqliteDir) ? await readdir(sqliteDir) : []
  const candidatePaths = entries
    .filter(entry => entry.endsWith('.sqlite') && entry !== 'metadata.sqlite')
    .map(entry => resolve(sqliteDir, entry))

  if (candidatePaths.length === 0) {
    throw new Error(
      `Could not locate a mirrored SQLite file for ${bindingName} in ${sqliteDir}.`,
    )
  }

  if (expectedTables.length === 0) {
    if (candidatePaths.length === 1) {
      const [candidatePath] = candidatePaths

      if (candidatePath) {
        return candidatePath
      }
    }

    throw new Error(
      `Found multiple mirrored SQLite files for ${bindingName} in ${sqliteDir}, but no table signature is available to disambiguate them.`,
    )
  }

  const matchingPaths: string[] = []

  for (const candidatePath of candidatePaths) {
    if (await hasExpectedTables(candidatePath, bindingName, cacheTableProfile)) {
      matchingPaths.push(candidatePath)
    }
  }

  if (matchingPaths.length === 1) {
    const [matchingPath] = matchingPaths

    if (matchingPath) {
      return matchingPath
    }
  }

  if (matchingPaths.length === 0) {
    throw new Error(
      `Could not locate a mirrored SQLite file with the expected tables for ${bindingName} in ${sqliteDir}.`,
    )
  }

  throw new Error(
    `Found multiple mirrored SQLite files with the expected tables for ${bindingName} in ${sqliteDir}.`,
  )
}

async function hasExpectedTables(
  filePath: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  const expectedTables = resolveExpectedTablesForBinding(bindingName, cacheTableProfile)

  if (expectedTables.length === 0) {
    return true
  }

  const sqlite = new SQLiteDatabase(filePath, { readonly: true })

  try {
    const rows = sqlite
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
    const tableNames = new Set(rows.map(row => row.name))

    return expectedTables.every(tableName => tableNames.has(tableName))
  } finally {
    sqlite.close()
  }
}

async function assertCachedDatabaseHasExpectedTables(
  filePath: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (await hasExpectedTables(filePath, bindingName, cacheTableProfile)) {
    return
  }

  throw new Error(
    [
      `Cache validation failed for ${bindingName}.`,
      `The mirrored database at ${filePath} does not contain the expected tables.`,
      'Remove .local/harbour-sql/db-cache and retry the upload.',
    ].join(' '),
  )
}

async function replaceCachedTableRows(
  filePath: string,
  bindingName: string,
  tableImports: RemoteTableImport[],
  onTable?: (tableImport: RemoteTableImport) => Promise<void> | void,
) {
  const sqlite = new SQLiteDatabase(filePath)

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;')
    sqlite.exec('BEGIN;')

    for (const tableImport of [...tableImports].reverse()) {
      sqlite.exec(`DELETE FROM ${quoteSqlIdentifier(tableImport.tableName)};`)
    }

    for (const tableImport of tableImports) {
      await onTable?.(tableImport)

      if (!tableImport.hasRows) {
        continue
      }

      const importSql = await readFile(tableImport.sqlPath, 'utf8')

      if (importSql.trim().length > 0) {
        sqlite.exec(importSql)
      }
    }

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

  await checkpointSqliteDatabase(filePath)
}

function quoteSqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

async function checkpointSqliteDatabase(filePath: string) {
  const sqlite = new SQLiteDatabase(filePath)

  try {
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    sqlite.close()
  }
}

async function exportRemoteDatabase(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  outputPath: string,
) {
  await runMirrorCommand([
    'bash',
    'libs/db/scripts/run-d1-export.sh',
    targetRecord.databaseName,
    '--config',
    WRANGLER_CONFIG_PATH,
    '--env',
    target,
    '--remote',
    '--output',
    outputPath,
  ])
}

async function exportRemoteTable(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tableName: string,
  outputPath: string,
) {
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
    '--output',
    outputPath,
  ])
}

async function importDatabaseDumpsToSqlite(
  dumpPaths: string[],
  destinationPath: string,
) {
  await rm(destinationPath, { force: true }).catch(() => undefined)

  const sqlite = new SQLiteDatabase(destinationPath)
  let failed = false

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;')
    for (const dumpPath of dumpPaths) {
      const dumpSql = await readFile(dumpPath, 'utf8')

      if (dumpSql.trim().length > 0) {
        sqlite.exec(dumpSql)
      }
    }
    sqlite.exec('PRAGMA foreign_keys = ON;')
    sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch (error) {
    failed = true
    throw error
  } finally {
    sqlite.close()
    if (failed) {
      await rm(destinationPath, { force: true }).catch(() => undefined)
    }
  }
}

async function buildRemoteTableImports(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tables: string[],
  workDir: string,
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
      '--output',
      tableDumpPath,
    ])

    const tableDump = await readFile(tableDumpPath, 'utf8')
    const importSql = stripExportTableDefinition(tableDump)
    const sqlPath = resolve(
      workDir,
      `${targetRecord.bindingName}-${tableName}-import.sql`,
    )
    const hasRows = importSql.length > 0

    await writeFile(
      sqlPath,
      hasRows ? `PRAGMA defer_foreign_keys = true;\n\n${importSql}\n` : '',
    )
    imports.push({
      hasRows,
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

async function runMirrorCommand(command: string[]) {
  await mkdir(WRANGLER_CONFIG_HOME, { recursive: true })
  await mkdir(WRANGLER_LOG_PATH, { recursive: true })

  const proc = Bun.spawn(command, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? WRANGLER_LOG_PATH,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? WRANGLER_CONFIG_HOME,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error((stderr || stdout || command.join(' ')).trim())
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const limit = Math.max(1, Math.floor(concurrency))
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex]
        nextIndex += 1

        if (item !== undefined) {
          await worker(item)
        }
      }
    }),
  )
}

function resolveLocalD1SqlitePath(localDatabaseId: string) {
  return resolveD1SqlitePath(LOCAL_D1_PERSIST_ROOT, localDatabaseId)
}

function resolveD1SqlitePath(persistRoot: string, localDatabaseId: string) {
  const uniqueKey = 'miniflare-D1DatabaseObject'
  const key = createHash('sha256').update(uniqueKey).digest()
  const nameHmac = createHmac('sha256', key)
    .update(localDatabaseId)
    .digest()
    .subarray(0, 16)
  const hmac = createHmac('sha256', key).update(nameHmac).digest().subarray(0, 16)
  const objectId = Buffer.concat([nameHmac, hmac]).toString('hex')

  return resolve(persistRoot, 'v3/d1/miniflare-D1DatabaseObject', `${objectId}.sqlite`)
}

function requirePath(value: string | undefined, bindingName: string) {
  if (!value) {
    throw new Error(`Could not resolve a local SQLite path for ${bindingName}.`)
  }

  return value
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === 'ENOENT'
  )
}
