import { createHmac, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  historySchema,
  sourceSchema,
  type HistoryDatabase,
  type SourceDatabase,
} from '@repo/db'
import type { UploadTarget } from '../cli/options.ts'
import {
  BEFORE_SHARD_CUTOFF_YEAR,
  CACHE_ROOT,
  DB_CACHE_MANIFEST_VERSION,
  LOCAL_D1_PERSIST_ROOT,
  WRANGLER_CONFIG_PATH,
} from './localDbCacheConfig.ts'
import type {
  CacheTableProfile,
  D1TargetRecord,
  DbCacheManifest,
  InternalLocalShardTarget,
  OpenSqliteDb,
} from './localDbCacheTypes.ts'
import { doCachedFilesExist, readManifest } from './localDbCacheManifest.ts'
import { createLocalExecBinding, openSqliteDbWithRetry } from './localDbCache.ts'

export function resolveRemoteCacheDir(
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

/** Returns the persistent cache directory, never a release planning scope. */
export function resolveSharedRemoteDbCacheDir(target: UploadTarget) {
  if (!target.remote) {
    throw new Error('A shared remote cache is only available for remote targets.')
  }

  return resolveRemoteCacheDir(
    target.environment === 'production' ? 'production' : 'preview',
  )
}

export function buildReleaseUploadDbCacheScopeKey(options: {
  cacheTableProfile: CacheTableProfile
  cohortKey: string
  regionCode: string
  shardYear: string
  source: string
  sourceVersion: string
  theme: string
  resourceType: string
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
    options.resourceType.trim().toLowerCase(),
  ].join(':')
}

/**
 * Creates an isolated, writeable planning surface for one remote release.
 * The shared cache remains an exact representation of D1 until publication
 * succeeds and the generated SQL is replayed through its journal.
 */
export async function resetRemoteReleaseUploadCacheScope(
  target: UploadTarget,
  cacheScopeKey: string,
  cacheTableProfile: CacheTableProfile,
) {
  if (!target.remote) {
    return
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const targets = await resolveD1Targets(targetName)
  const sharedCacheDir = resolveRemoteCacheDir(targetName)
  const sharedManifest = await readManifest(join(sharedCacheDir, 'manifest.json'))
  const cachedTargets = sharedManifest
    ? targets.filter(targetRecord => targetRecord.bindingName in sharedManifest.files)
    : []

  if (
    !sharedManifest ||
    sharedManifest.cacheVersion !== DB_CACHE_MANIFEST_VERSION ||
    sharedManifest.target !== targetName ||
    cachedTargets.length === 0 ||
    !(await doCachedFilesExist(
      sharedManifest.files,
      cachedTargets,
      sharedManifest.cacheTableProfile,
    ))
  ) {
    throw new Error(
      `No valid shared ${targetName} D1 cache is available. Rebuild it explicitly with bin/saanseoi cache:rebuild --target ${targetName}.`,
    )
  }

  const cacheDir = resolveRemoteCacheDir(targetName, cacheScopeKey)

  if (cacheDir === sharedCacheDir) {
    throw new Error('Release upload cache scope must not overwrite the shared cache.')
  }

  await rm(cacheDir, { force: true, recursive: true })
  await mkdir(cacheDir, { recursive: true })

  const files: Record<string, string> = {}
  for (const targetRecord of cachedTargets) {
    const sourcePath = sharedManifest.files[targetRecord.bindingName]
    if (!sourcePath) {
      throw new Error(`Shared cache manifest is missing ${targetRecord.bindingName}.`)
    }

    const destinationPath = resolve(cacheDir, `${targetRecord.bindingName}.sqlite`)
    await copyFile(sourcePath, destinationPath)
    files[targetRecord.bindingName] = destinationPath
  }

  await writeFile(
    join(cacheDir, 'manifest.json'),
    JSON.stringify(
      {
        cacheVersion: DB_CACHE_MANIFEST_VERSION,
        cacheScopeKey,
        cacheTableProfile,
        files,
        preparedAt: new Date().toISOString(),
        target: targetName,
      } satisfies DbCacheManifest,
      null,
      2,
    ),
  )
}

export function resolveTargetName(
  target: UploadTarget,
): 'local' | 'preview' | 'production' {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

export function parseBindingYear(bindingName: string, prefix: string) {
  if (!bindingName.startsWith(prefix)) {
    return null
  }

  const year = bindingName.slice(prefix.length)

  return /^\d{4}$/.test(year) ? Number.parseInt(year, 10) : null
}

export function resolveShardBindingName(
  kind: 'history' | 'source',
  regionCodeToken: string,
  shardYear: string,
) {
  const annualShardYear = resolveAnnualShardYear(shardYear)
  const parsedYear = Number.parseInt(annualShardYear, 10)
  const prefix = kind === 'history' ? 'DB_HISTORY' : 'DB_SOURCE'

  return Number.isInteger(parsedYear) && parsedYear < BEFORE_SHARD_CUTOFF_YEAR
    ? `${prefix}_${regionCodeToken}_BEFORE`
    : `${prefix}_${regionCodeToken}_${annualShardYear}`
}

/** D1 history/source bindings are annual even when source releases are dated. */
export function resolveAnnualShardYear(shardYear: string) {
  const annualShardYear = /^(\d{4})/.exec(shardYear.trim())?.[1]
  if (!annualShardYear) {
    throw new Error(`Could not resolve an annual shard year from ${shardYear}.`)
  }
  return annualShardYear
}

function parseBindingScope(bindingName: string, prefix: string) {
  if (bindingName === `${prefix}BEFORE`) {
    return { kind: 'before' as const, year: 0 }
  }

  const year = parseBindingYear(bindingName, prefix)

  return year === null ? null : { kind: 'year' as const, year }
}

export async function buildHistoryTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  primary: OpenSqliteDb<HistoryDatabase>,
  includeAllShardYears = false,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_HISTORY_${regionCodeToken}_`,
    shardYear,
    historySchema,
    primary,
    includeAllShardYears,
  )
}

export async function buildSourceTargets(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  regionCodeToken: string,
  shardYear: string,
  primary: OpenSqliteDb<SourceDatabase>,
  includeAllShardYears = false,
) {
  return buildShardTargets(
    targetRecordsByBindingName,
    dbPaths,
    `DB_SOURCE_${regionCodeToken}_`,
    shardYear,
    sourceSchema,
    primary,
    includeAllShardYears,
  )
}

async function buildShardTargets<TSchema extends Record<string, unknown>, TDb>(
  targetRecordsByBindingName: Map<string, D1TargetRecord>,
  dbPaths: Record<string, string>,
  bindingPrefix: string,
  shardYear: string,
  schema: TSchema,
  primary: OpenSqliteDb<TDb>,
  includeAllShardYears: boolean,
) {
  const targets: InternalLocalShardTarget<TDb>[] = []

  for (const targetRecord of targetRecordsByBindingName.values()) {
    const scope = parseBindingScope(targetRecord.bindingName, bindingPrefix)

    if (
      scope === null ||
      (!includeAllShardYears && scope.year > Number.parseInt(shardYear, 10))
    ) {
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
      binding: createLocalExecBinding(openDb.sqlite, targetRecord.bindingName),
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

export function isUnableToOpenSqliteDatabase(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('unable to open database file')
  )
}

export async function resolveD1Targets(target: 'local' | 'preview' | 'production') {
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

export async function resolveLatestConfiguredShardYear(
  target: 'preview' | 'production',
) {
  const years = (await resolveD1Targets(target))
    .map(record => parseBindingYear(record.bindingName, 'DB_HISTORY_HK_'))
    .filter((year): year is number => year !== null)

  return String(Math.max(...years, BEFORE_SHARD_CUTOFF_YEAR))
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

export function mapLocalTargetPaths(targets: D1TargetRecord[]) {
  return Object.fromEntries(
    targets.map(target => [
      target.bindingName,
      resolveLocalD1SqlitePath(target.localDatabaseId),
    ]),
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

export function requirePath(value: string | undefined, bindingName: string) {
  if (!value) {
    throw new Error(`Could not resolve a local SQLite path for ${bindingName}.`)
  }

  return value
}

export function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === 'ENOENT'
  )
}
