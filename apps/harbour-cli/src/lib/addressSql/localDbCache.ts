import { createHmac, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises'
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

import type { UploadTarget } from '../cli/options.ts'

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
  pruneOperation?: CachePruneOperation | null
  sqlPath: string
  tableName: string
}
type CachePruneOperation = {
  tableName: string
  whereSql: string
}
type CacheTableProfile =
  | 'address'
  | 'division'
  | 'divisionGeometry'
  | 'nativeSource'
  | 'street'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const WRANGLER_CONFIG_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')
const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')
const CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/db-cache')
const SQLITE_CACHE_WORKER_PATH = resolve(import.meta.dir, 'sqliteCacheWorker.ts')
const DB_CACHE_MANIFEST_VERSION = 5
const REMOTE_CACHE_BINDING_CONCURRENCY = 4
const WRANGLER_CONFIG_HOME = resolve(REPO_ROOT, '.local/wrangler')
const WRANGLER_LOG_PATH = resolve(WRANGLER_CONFIG_HOME, 'logs')
const DB_CACHE_PROGRESS_HEARTBEAT_MS = 1000
const BEFORE_SHARD_CUTOFF_YEAR = 2025
const LOCAL_SQLITE_OPEN_RETRY_LIMIT = 8
const LOCAL_SQLITE_OPEN_RETRY_DELAY_MS = 250
const VERSION_TABLES_WITH_CURRENT_ROWS = new Set([
  'address2d',
  'address2dI18n',
  'divisions',
  'divisionsI18n',
  'hkgovAlsAddresses2d',
  'hkgovLandsdStreets',
  'hkgovLandsdStreetI18n',
  'overtureDivisions',
  'overtureDivisionAreas',
  'overtureDivisionBoundaries',
])

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
    requireExistingRemoteCache?: boolean
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    remoteCacheScopeKey?: string
  } = {},
): Promise<LocalAddressDbContext> {
  const targetName = resolveTargetName(target)
  const targetRecords = await resolveD1Targets(targetName)
  const regionCodeToken = regionCode.trim().toUpperCase()
  const shardYearNumber = Number.parseInt(shardYear, 10)
  const historyBindingName = resolveShardBindingName(
    'history',
    regionCodeToken,
    shardYear,
  )
  const sourceBindingName = resolveShardBindingName(
    'source',
    regionCodeToken,
    shardYear,
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
    shardYear,
    history,
  )
  const internalSourceTargets = await buildSourceTargets(
    requiredTargetRecordsByBindingName,
    dbPaths,
    regionCodeToken,
    shardYear,
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
  bindingName: string,
) {
  return openSqliteDbWithRetry(filePath, schema, bindingName)
}

async function openSqliteDbWithRetry<TSchema extends Record<string, unknown>>(
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

function resolveShardBindingName(
  kind: 'history' | 'source',
  regionCodeToken: string,
  shardYear: string,
) {
  const parsedYear = Number.parseInt(shardYear, 10)
  const prefix = kind === 'history' ? 'DB_HISTORY' : 'DB_SOURCE'

  return Number.isInteger(parsedYear) && parsedYear < BEFORE_SHARD_CUTOFF_YEAR
    ? `${prefix}_${regionCodeToken}_BEFORE`
    : `${prefix}_${regionCodeToken}_${shardYear}`
}

function parseBindingScope(bindingName: string, prefix: string) {
  if (bindingName === `${prefix}BEFORE`) {
    return { kind: 'before' as const, year: 0 }
  }

  const year = parseBindingYear(bindingName, prefix)

  return year === null ? null : { kind: 'year' as const, year }
}

async function buildHistoryTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  primary: OpenSqliteDb<HistoryDatabase>,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_HISTORY_${regionCodeToken}_`,
    shardYear,
    historySchema,
    primary,
  )
}

async function buildSourceTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  primary: OpenSqliteDb<SourceDatabase>,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_SOURCE_${regionCodeToken}_`,
    shardYear,
    sourceSchema,
    primary,
  )
}

async function buildShardTargets<TSchema extends Record<string, unknown>, TDb>(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  bindingPrefix: string,
  shardYear: string,
  schema: TSchema,
  primary: OpenSqliteDb<TDb>,
) {
  const targets: InternalLocalShardTarget<TDb>[] = []

  for (const targetRecord of targetRecordsByBindingName.values()) {
    const scope = parseBindingScope(targetRecord.bindingName, bindingPrefix)

    if (scope === null || scope.year > Number.parseInt(shardYear, 10)) {
      continue
    }

    const openDb =
      targetRecord.bindingName ===
      `${bindingPrefix}${
        Number.parseInt(shardYear, 10) < BEFORE_SHARD_CUTOFF_YEAR ? 'BEFORE' : shardYear
      }`
        ? primary
        : ((await openSqliteDbWithRetry(
            requirePath(dbPaths[targetRecord.bindingName], targetRecord.bindingName),
            schema,
            targetRecord.bindingName,
          )) as OpenSqliteDb<TDb>)

    targets.push({
      binding: createLocalExecBinding(openDb.sqlite),
      bindingName: targetRecord.bindingName,
      databaseId: targetRecord.databaseId,
      databaseName: targetRecord.databaseName,
      openDb,
      year: scope.kind === 'before' ? 'BEFORE' : String(scope.year),
    })
  }

  return targets.sort((left, right) => {
    if (left.year === 'BEFORE') return -1
    if (right.year === 'BEFORE') return 1
    return left.year.localeCompare(right.year)
  })
}

function isUnableToOpenSqliteDatabase(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('unable to open database file')
  )
}

export async function refreshRemoteMetaCache(
  target: 'preview' | 'production',
  cacheDir: string,
) {
  const targetRecord = (await resolveD1Targets(target)).find(
    record => record.bindingName === 'DB_META',
  )

  if (!targetRecord) {
    throw new Error(`Could not resolve DB_META for ${target}.`)
  }

  const workDir = resolve(CACHE_ROOT, `.refresh-meta-${target}`)
  const dumpPath = resolve(workDir, 'DB_META.sql')
  const destinationPath = resolve(cacheDir, 'DB_META.sqlite')

  await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  await mkdir(workDir, { recursive: true })

  try {
    await exportRemoteDatabase(targetRecord, target, dumpPath)
    await importDatabaseDumpsToSqlite([dumpPath], destinationPath)
    await assertCachedDatabaseHasExpectedTables(destinationPath, 'DB_META')
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

export async function invalidateRemoteDbCache(
  target: 'preview' | 'production',
  cacheDir: string,
  reason?: string,
) {
  if (!cacheDir.startsWith(resolveRemoteCacheDir(target))) {
    throw new Error(`Refusing to invalidate cache outside the ${target} cache root.`)
  }

  const manifestPath = join(cacheDir, 'manifest.json')

  await rm(manifestPath, { force: true }).catch(() => undefined)
  await writeFile(
    join(cacheDir, 'invalidated.json'),
    JSON.stringify(
      {
        invalidatedAt: new Date().toISOString(),
        reason: reason ?? null,
        target,
      },
      null,
      2,
    ),
  ).catch(() => undefined)
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
      /^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(entry.binding) ||
      /^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(entry.binding))
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
    requireExistingRemoteCache?: boolean
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    remoteCacheScopeKey?: string
    cacheTableProfile?: CacheTableProfile
  } = {},
) {
  const cacheDir = resolveRemoteCacheDir(target, options.remoteCacheScopeKey)
  const manifestPath = join(cacheDir, 'manifest.json')
  const invalidatedManifestPath = join(cacheDir, 'invalidated.json')
  const invalidatedManifest = await readInvalidatedManifest(invalidatedManifestPath)
  const existingManifest = await readManifest(manifestPath)
  const shouldRefreshRemoteTables =
    options.refreshRemoteTables && !options.refreshRemoteCache
  const totalUnits = shouldRefreshRemoteTables
    ? countRemoteCacheRefreshWorkUnits(targets, options.cacheTableProfile)
    : countRemoteCacheWorkUnits(targets, options.cacheTableProfile)

  if (invalidatedManifest && !options.refreshRemoteCache) {
    throw new Error(
      [
        `The persistent ${target} D1 cache was invalidated at ${invalidatedManifest.invalidatedAt}.`,
        invalidatedManifest.reason
          ? `Reason: ${invalidatedManifest.reason}`
          : 'Reason: local cache update failed after a previous remote upload.',
        'Refusing to clone remote D1 silently. Remove .local/harbour-sql/db-cache to force a rebuild.',
      ].join(' '),
    )
  }

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

  if (options.requireExistingRemoteCache) {
    throw new Error(
      [
        `No complete reusable ${target} D1 cache was found at ${cacheDir}.`,
        'Rollback uses the local mirror as its planning surface and will not clone remote D1 automatically.',
        `Refresh the mirror first, for example: bun run db:mirror:${target}:to:local`,
      ].join(' '),
    )
  }

  const reusableFiles =
    options.refreshRemoteCache || !existingManifest
      ? {}
      : await resolveReusableCachedFiles(
          cacheDir,
          existingManifest.files,
          targets,
          options.cacheTableProfile,
        )
  const targetsToMirror = targets.filter(
    targetRecord => !reusableFiles[targetRecord.bindingName],
  )
  const mirroredFiles =
    targetsToMirror.length > 0
      ? await mirrorRemoteTargetToLocal(target, targetsToMirror, cacheDir, {
          cacheTableProfile: options.cacheTableProfile,
          onProgress: options.onProgress,
          preserveCacheDir: Object.keys(reusableFiles).length > 0,
          totalUnits,
        })
      : {}
  const files = {
    ...reusableFiles,
    ...mirroredFiles,
  }

  if (!(await doCachedFilesExist(files, targets, options.cacheTableProfile))) {
    throw new Error(
      `Failed to prepare a complete ${target} D1 database cache. Remove .local/harbour-sql/db-cache and retry.`,
    )
  }

  const manifest: DbCacheManifest = {
    cacheVersion: DB_CACHE_MANIFEST_VERSION,
    cacheScopeKey: options.remoteCacheScopeKey,
    cacheTableProfile: options.cacheTableProfile,
    files,
    preparedAt: new Date().toISOString(),
    target,
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await rm(invalidatedManifestPath, { force: true }).catch(() => undefined)
  return files
}

async function resolveReusableCachedFiles(
  cacheDir: string,
  files: Record<string, string>,
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
) {
  const reusableFiles: Record<string, string> = {}

  for (const target of targets) {
    const candidatePaths = [
      files[target.bindingName],
      resolve(cacheDir, `${target.bindingName}.sqlite`),
    ].filter(isNonEmptyString)

    for (const filePath of candidatePaths) {
      if (await isValidCachedFile(filePath, target.bindingName, cacheTableProfile)) {
        reusableFiles[target.bindingName] = filePath
        break
      }
    }
  }

  return reusableFiles
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
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

          await runWithProgressHeartbeat(
            options.onProgress,
            {
              action: 'export-binding',
              bindingName: targetRecord.bindingName,
              current: currentUnit,
              target,
              total: options.totalUnits,
            },
            () => exportRemoteDatabase(targetRecord, target, dumpPath),
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

        const tableImports = await buildRemoteTableImports(
          targetRecord,
          target,
          tables,
          workDir,
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
            assertCachedDatabaseHasExpectedTables(
              destinationPath,
              targetRecord.bindingName,
              options.cacheTableProfile,
            ),
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

async function readInvalidatedManifest(manifestPath: string) {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      invalidatedAt?: unknown
      reason?: unknown
      target?: unknown
    }

    return {
      invalidatedAt:
        typeof parsed.invalidatedAt === 'string'
          ? parsed.invalidatedAt
          : 'unknown time',
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      target: typeof parsed.target === 'string' ? parsed.target : null,
    }
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
    if (!(await isValidCachedFile(filePath, bindingName, cacheTableProfile))) {
      return false
    }
  }

  return true
}

async function isValidCachedFile(
  filePath: string,
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  if (!existsSync(filePath)) {
    return false
  }

  const fileStat = await stat(filePath)

  if (fileStat.size <= 0) {
    return false
  }

  return hasExpectedTables(filePath, bindingName, cacheTableProfile)
}

async function mirrorRemoteTargetToLocal(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  cacheDir: string,
  options: {
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
        const tables = resolveMirrorTablesForBinding(
          targetRecord.bindingName,
          options.cacheTableProfile,
        )
        const dumpPaths: string[] = []
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
            () => exportRemoteDatabase(targetRecord, target, dumpPath),
          )
          dumpPaths.push(dumpPath)
          currentUnit += 1
        } else {
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
            const dumpPath = resolve(
              workDir,
              `${targetRecord.bindingName}-${tableName}.sql`,
            )
            await runWithProgressHeartbeat(options.onProgress, exportEvent, () =>
              exportRemoteTable(targetRecord, target, tableName, dumpPath),
            )
            dumpPaths.push(dumpPath)
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
            importDatabaseDumpsToSqlite(dumpPaths, destinationPath, pruneOperations),
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
            assertCachedDatabaseHasExpectedTables(
              destinationPath,
              targetRecord.bindingName,
              options.cacheTableProfile,
            ),
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
    if (cacheTableProfile === 'street') {
      return ['divisions', 'divisionsI18n', 'streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return ['divisions', 'divisionAreas', 'divisionBoundaries']
    }

    return [
      'divisions',
      'divisionsI18n',
      'streets',
      'streetsI18n',
      'address2d',
      'address2dI18n',
    ]
  }

  if (/^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'street') {
      return ['streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n', 'snapshotVersionChanges']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return ['divisionAreas', 'divisionBoundaries']
    }

    return ['divisions', 'divisionsI18n', 'address2d', 'address2dI18n']
  }

  if (/^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'nativeSource') {
      return [
        'hkgovHydStreetNamePlates',
        'hkgovHydSensitiveStreets',
        'hkgovHydStrategicStreets',
        'hkgovTdPedestrianStreets',
        'hkgovCenstatdDivisionAreas',
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
        'hkgovCenstatdStatistics',
        'hkgovCenstatdDivisionAreaDerivatives',
        'hkgovLandsdPlaceNames',
        'hkgovLandsdRoadCentrelines',
      ]
    }

    if (cacheTableProfile === 'street') {
      return ['hkgovLandsdStreets', 'hkgovLandsdStreetI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['overtureDivisions', 'hkgovPlandPlanningCells', 'hkgovPlandNewTowns']
    }

    if (cacheTableProfile === 'divisionGeometry') {
      return [
        'overtureDivisions',
        'overtureDivisionAreas',
        'overtureDivisionBoundaries',
        'hkgovHadDivisionAreas',
      ]
    }

    return ['overtureDivisions', 'hkgovAlsAddresses2d']
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
  onBusy?: () => Promise<void> | void,
) {
  for (const tableImport of tableImports) {
    await onTable?.(tableImport)
  }

  await runWithHeartbeat(onBusy, () =>
    runSqliteCacheWorker({
      bindingName,
      filePath,
      tableImports,
      type: 'replace-table-rows',
    }),
  )
}

async function checkpointSqliteDatabase(filePath: string) {
  await runSqliteCacheWorker({
    filePath,
    type: 'checkpoint',
  })
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
  pruneOperations: CachePruneOperation[] = [],
) {
  await runSqliteCacheWorker({
    destinationPath,
    dumpPaths,
    pruneOperations,
    type: 'import-dumps',
  })
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
    const pruneOperation = resolveCachePruneOperation(
      targetRecord.bindingName,
      tableName,
    )
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

function resolveCachePruneOperation(
  bindingName: string,
  tableName: string,
): CachePruneOperation | null {
  if (
    !/^DB_(?:HISTORY|SOURCE)_[A-Z]{2}_\d{4}$/.test(bindingName) ||
    !VERSION_TABLES_WITH_CURRENT_ROWS.has(tableName)
  ) {
    return null
  }

  return {
    tableName,
    whereSql: '"isCurrent" <> 1',
  }
}

async function runWithProgressHeartbeat<T>(
  onProgress: ((event: LocalDbCacheProgressEvent) => Promise<void> | void) | undefined,
  event: LocalDbCacheProgressEvent,
  work: () => Promise<T>,
) {
  return runWithHeartbeat(() => onProgress?.(event), work)
}

async function runWithHeartbeat<T>(
  onHeartbeat: (() => Promise<void> | void) | undefined,
  work: () => Promise<T>,
) {
  let running = true
  const heartbeat = setInterval(() => {
    if (!running) {
      return
    }

    void onHeartbeat?.()
  }, DB_CACHE_PROGRESS_HEARTBEAT_MS)

  try {
    await onHeartbeat?.()
    return await work()
  } finally {
    running = false
    clearInterval(heartbeat)
  }
}

async function runSqliteCacheWorker(payload: SqliteCacheWorkerPayload) {
  await mkdir(CACHE_ROOT, { recursive: true })
  const payloadPath = resolve(
    CACHE_ROOT,
    `.sqlite-worker-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.json`,
  )

  await writeFile(payloadPath, JSON.stringify(payload))

  try {
    const proc = Bun.spawn([process.execPath, SQLITE_CACHE_WORKER_PATH, payloadPath], {
      cwd: REPO_ROOT,
      env: process.env,
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      throw new Error((stderr || stdout || 'SQLite cache worker failed.').trim())
    }
  } finally {
    await rm(payloadPath, { force: true }).catch(() => undefined)
  }
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
