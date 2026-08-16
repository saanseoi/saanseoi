import { createHmac, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, stat, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import {
  REMOTE_GEOMETRY_HEX_CHUNK_BYTES,
  assertBinaryGeometryRow,
  geometrySha256,
  reassembleHexChunks,
  rejectReplacementCharacter,
  type BinaryGeometryRow,
} from './binaryGeometryMirror.ts'

import {
  currentSchema,
  eq,
  historySchema,
  metaSchema,
  or,
  sourceSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
  type SourceDatabase,
} from '@repo/db'

import type { UploadTarget } from '../cli/options.ts'
import type { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'

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

type RemoteCacheReplayJournal = {
  attemptCount: number
  cacheDir: string
  completedAt?: string
  failedAt?: string
  lastError?: string
  releaseCode: string
  startedAt: string
  status: 'failed' | 'replayed' | 'replaying'
  target: 'preview' | 'production'
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
  binaryRowsPath?: string
  hasRows: boolean
  pruneOperation?: CachePruneOperation | null
  sqlPath: string
  tableName: string
}
type CachePruneOperation = {
  tableName: string
  whereSql: string
}
export type CacheTableProfile =
  | 'address'
  | 'division'
  | 'divisionGeometry'
  | 'divisionStatistic'
  | 'planningDivisionGeometry'
  | 'nativeSource'
  | 'street'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const WRANGLER_CONFIG_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')
const LOCAL_D1_PERSIST_ROOT = resolve(REPO_ROOT, '.local/d1/dev')
const CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/db-cache')
const SQLITE_CACHE_WORKER_PATH = resolve(import.meta.dir, 'sqliteCacheWorker.ts')
// v6 requires byte-for-byte validation of every mirrored binary geometry.
const DB_CACHE_MANIFEST_VERSION = 6
const REMOTE_CACHE_BINDING_CONCURRENCY = 4
const WRANGLER_CONFIG_HOME = resolve(REPO_ROOT, '.local/wrangler')
const WRANGLER_LOG_PATH = resolve(WRANGLER_CONFIG_HOME, 'logs')
const DB_CACHE_PROGRESS_HEARTBEAT_MS = 1000
const REMOTE_CACHE_REPLAY_RETRY_LIMIT = 3
const REMOTE_CACHE_REPLAY_RETRY_DELAY_MS = 750
const REMOTE_META_CACHE_REFRESH_RETRY_LIMIT = 3
const REMOTE_META_CACHE_REFRESH_RETRY_DELAY_MS = 1_000
const BEFORE_SHARD_CUTOFF_YEAR = 2025
// Each release receives historyShard and sourceShard assignments on publication.
const REQUIRED_RELEASE_SHARD_ASSIGNMENTS = 2
const LOCAL_SQLITE_OPEN_RETRY_LIMIT = 8
const LOCAL_SQLITE_OPEN_RETRY_DELAY_MS = 250
const REMOTE_GEOMETRY_PAGE_SIZE = 100
const VERSION_TABLES_WITH_CURRENT_ROWS = new Set([
  'address2d',
  'address2dI18n',
  'divisions',
  'divisionsI18n',
  'hkgovAlsAddresses2d',
  'hkgovLandsdStreets',
  'hkgovLandsdStreetI18n',
  'hkgovPlandNewTowns',
  'hkgovPlandPlanningCells',
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

export async function readRemoteCachedCompletedReleaseCodes(
  target: UploadTarget,
  options: { allowPartialCache?: boolean } = {},
) {
  if (!target.remote) {
    throw new Error(
      'Completed remote releases can only be read for preview or production.',
    )
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheDir = resolveRemoteCacheDir(targetName)
  return withRemoteCachedMetaDb(target, async (metaDb, metaSqlite, manifest) => {
    const rows = await metaDb
      .select({
        code: metaSchema.metaReleases.code,
        datasetId: metaSchema.metaReleases.datasetId,
        id: metaSchema.metaReleases.id,
        status: metaSchema.metaReleases.status,
        type: metaSchema.metaReleases.resourceType,
      })
      .from(metaSchema.metaReleases)
      .where(
        or(
          eq(metaSchema.metaReleases.status, 'published'),
          eq(metaSchema.metaReleases.status, 'superseded'),
        ),
      )
      .all()

    if (!options.allowPartialCache) {
      const incompleteReleases = await findIncompletePublishedReleases(
        cacheDir,
        manifest.files,
        metaSqlite,
        rows,
      )

      if (incompleteReleases.length > 0) {
        throw new Error(
          [
            `The ${targetName} cache contains published releases that are not safe to skip.`,
            ...incompleteReleases.map(release => `- ${release}`),
            'Reset or repair the target before continuing; published releases are never silently reprocessed.',
          ].join('\n'),
        )
      }
    }

    return rows.map(row => row.code)
  })
}

async function findIncompletePublishedReleases(
  cacheDir: string,
  files: Record<string, string>,
  metaSqlite: SQLiteDatabase,
  releases: Array<{
    code: string
    datasetId: string
    id: string
    status: string
    type: string
  }>,
) {
  const currentPath = files.DB_CURRENT ?? resolve(cacheDir, 'DB_CURRENT.sqlite')
  const currentSqlite = existsSync(currentPath)
    ? new SQLiteDatabase(currentPath, { readonly: true })
    : null
  const incomplete: string[] = []

  try {
    for (const release of releases) {
      if (release.status === 'superseded') {
        continue
      }

      const currentTable = resolveCompletedReleaseCurrentTable(release.type)

      // Non-SQL pipelines have no cache-level materialisation contract here.
      if (!currentTable) {
        continue
      }

      const snapshot = metaSqlite
        .query(
          `
            SELECT s.id AS snapshotId, s.snapshotLineageId AS snapshotLineageId
            FROM snapshots s
            INNER JOIN snapshotSources ss ON ss.snapshotId = s.id
            LEFT JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
            WHERE ss.sourceReleaseId = ?
              AND ss.datasetId = ?
              AND s.resourceType = ?
              AND s.status = 'published'
              AND (
                s.snapshotLineageId IS NULL
                OR (sl.resourceType = ? AND sl.primaryDatasetId = ?)
              )
            ORDER BY s.revision DESC
            LIMIT 1
          `,
        )
        .get(
          release.id,
          release.datasetId,
          release.type,
          release.type,
          release.datasetId,
        ) as { snapshotId?: string; snapshotLineageId?: string | null } | null

      if (!snapshot?.snapshotId) {
        incomplete.push(
          `${release.code}: missing published snapshot lineage/source membership`,
        )
        continue
      }

      const releaseShardCount = metaSqlite
        .query(
          'SELECT COUNT(*) AS count FROM releaseShardAssignments WHERE releaseId = ?',
        )
        .get(release.id) as { count?: number }
      const snapshotShardCount = metaSqlite
        .query(
          'SELECT COUNT(*) AS count FROM snapshotShardAssignments WHERE snapshotId = ?',
        )
        .get(snapshot.snapshotId) as { count?: number }

      if (
        (releaseShardCount.count ?? 0) < REQUIRED_RELEASE_SHARD_ASSIGNMENTS ||
        (snapshot.snapshotLineageId && (snapshotShardCount.count ?? 0) < 1)
      ) {
        incomplete.push(`${release.code}: missing release or snapshot shard assignment`)
        continue
      }

      if (!currentSqlite) {
        incomplete.push(`${release.code}: DB_CURRENT cache file is missing`)
        continue
      }

      try {
        const rowCount = currentSqlite
          .query(
            `SELECT COUNT(*) AS count FROM ${quoteSqlIdentifier(currentTable)} WHERE "snapshotId" = ?`,
          )
          .get(snapshot.snapshotId) as { count?: number }
        if ((rowCount.count ?? 0) === 0) {
          incomplete.push(`${release.code}: current snapshot is not materialised`)
        }
      } catch (error) {
        incomplete.push(
          `${release.code}: could not verify current materialisation (${error instanceof Error ? error.message : String(error)})`,
        )
      }
    }
  } finally {
    currentSqlite?.close()
  }

  return incomplete
}

function resolveCompletedReleaseCurrentTable(type: string) {
  switch (type) {
    case 'division':
      return 'divisions'
    case 'divisionArea':
      return 'divisionAreas'
    case 'divisionBoundary':
      return 'divisionBoundaries'
    default:
      return null
  }
}

function quoteSqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * Reads the metadata mirror without contacting remote D1. Remote upload
 * planning and post-publish checks use this so they observe the exact cache
 * that was used to prepare the release, rather than requiring Wrangler's
 * separate Cloudflare API credentials.
 */
export async function withRemoteCachedMetaDb<T>(
  target: UploadTarget,
  work: (
    db: MetaDatabase,
    sqlite: SQLiteDatabase,
    manifest: DbCacheManifest,
  ) => Promise<T> | T,
): Promise<T> {
  if (!target.remote) {
    throw new Error('The remote metadata cache is only available for remote targets.')
  }

  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheDir = resolveRemoteCacheDir(targetName)
  const invalidated = await readInvalidatedManifest(join(cacheDir, 'invalidated.json'))

  if (invalidated) {
    throw new Error(
      [
        `The persistent ${targetName} D1 cache was invalidated at ${invalidated.invalidatedAt}.`,
        invalidated.reason ? `Reason: ${invalidated.reason}` : null,
        `Rebuild it explicitly with bin/saanseoi cache:rebuild --target ${targetName}.`,
      ]
        .filter(isNonEmptyString)
        .join(' '),
    )
  }

  const manifest = await readManifest(join(cacheDir, 'manifest.json'))
  const metaPath = manifest?.files.DB_META

  if (
    !manifest ||
    manifest.cacheVersion !== DB_CACHE_MANIFEST_VERSION ||
    manifest.target !== targetName ||
    !metaPath ||
    !(await isValidCachedFile(metaPath, 'DB_META'))
  ) {
    throw new Error(
      [
        `No valid ${targetName} metadata cache is available for this operation.`,
        `Rebuild it explicitly with bin/saanseoi cache:rebuild --target ${targetName}.`,
      ].join(' '),
    )
  }

  const meta = (await openSqliteDb(
    metaPath,
    metaSchema,
    'DB_META',
  )) as unknown as OpenSqliteDb<MetaDatabase>

  try {
    return await work(meta.db, meta.sqlite, manifest)
  } finally {
    meta.sqlite.close()
  }
}

export function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
  options: {
    completeOnReuse?: boolean
  } = {},
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const label = formatDbCacheProgressLabel(event)
  const current = Math.min(event.current, event.total)

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, {
      current,
      max: event.total,
    })
  } else {
    progress.update(current, {
      label,
      max: event.total,
    })
  }

  if (event.action === 'reuse-cache' && options.completeOnReuse !== false) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(colorTeal('Cache'), colorRed('hit'), 0),
        ['0 ms'],
      ),
    )
  }
}

function formatDbCacheProgressLabel(event: LocalDbCacheProgressEvent) {
  const subject = describeDbCacheSubject(event)

  return formatRunningPhaseLabel(
    colorTeal('Clone cache'),
    colorRed(subject),
    Math.min(event.current, event.total),
    event.total,
  )
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  const tableName = event.tableName
    ? event.filter
      ? `${event.tableName}:${event.filter}`
      : event.tableName
    : null

  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return tableName
        ? `${event.bindingName}.${tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return tableName ? `${event.bindingName}.${tableName}` : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
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

export function resolveShardBindingName(
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
    await retryRemoteCacheExport(() =>
      exportRemoteDatabase(targetRecord, target, dumpPath),
    )
    await importDatabaseDumpsToSqlite([dumpPath], destinationPath)
    await assertCachedDatabaseHasExpectedTables(destinationPath, 'DB_META')
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

async function retryRemoteCacheExport(exportDatabase: () => Promise<void>) {
  let lastError: unknown

  for (
    let attempt = 1;
    attempt <= REMOTE_META_CACHE_REFRESH_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      await exportDatabase()
      return
    } catch (error) {
      lastError = error

      if (attempt < REMOTE_META_CACHE_REFRESH_RETRY_LIMIT) {
        await Bun.sleep(REMOTE_META_CACHE_REFRESH_RETRY_DELAY_MS * 2 ** (attempt - 1))
      }
    }
  }

  throw lastError
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

/**
 * Replays a published release into the local cache with a durable checkpoint.
 * Generated SQL is idempotent, so a transient local SQLite failure can retry
 * without cloning remote D1 again. A terminal failure still invalidates the
 * cache: it may have applied only part of the release.
 */
export async function replayRemoteCacheWithRetry(
  target: 'preview' | 'production',
  cacheDir: string,
  releaseCode: string,
  replay: () => Promise<void>,
) {
  assertRemoteCacheDirectory(target, cacheDir)
  const journalPath = resolveRemoteCacheReplayJournalPath(cacheDir, releaseCode)
  const startedAt = new Date().toISOString()
  let lastError: unknown

  await mkdir(dirname(journalPath), { recursive: true })

  for (let attempt = 1; attempt <= REMOTE_CACHE_REPLAY_RETRY_LIMIT; attempt += 1) {
    await writeRemoteCacheReplayJournal(journalPath, {
      attemptCount: attempt,
      cacheDir,
      releaseCode,
      startedAt,
      status: 'replaying',
      target,
    })

    try {
      await replay()
      await writeRemoteCacheReplayJournal(journalPath, {
        attemptCount: attempt,
        cacheDir,
        completedAt: new Date().toISOString(),
        releaseCode,
        startedAt,
        status: 'replayed',
        target,
      })
      return
    } catch (error) {
      lastError = error
      const lastErrorMessage = error instanceof Error ? error.message : String(error)
      await writeRemoteCacheReplayJournal(journalPath, {
        attemptCount: attempt,
        cacheDir,
        failedAt: new Date().toISOString(),
        lastError: lastErrorMessage,
        releaseCode,
        startedAt,
        status: 'failed',
        target,
      })

      if (attempt < REMOTE_CACHE_REPLAY_RETRY_LIMIT) {
        await Bun.sleep(REMOTE_CACHE_REPLAY_RETRY_DELAY_MS * attempt)
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  await invalidateRemoteDbCache(target, cacheDir, reason)
  throw new Error(
    `Updating the ${target} local cache failed after ${REMOTE_CACHE_REPLAY_RETRY_LIMIT} idempotent replay attempts. The cache was invalidated. ${reason}`,
  )
}

function resolveRemoteCacheReplayJournalPath(cacheDir: string, releaseCode: string) {
  const fileName = releaseCode.replaceAll(/[^a-zA-Z0-9._-]/g, '_')
  return resolve(cacheDir, 'replay-journal', `${fileName}.json`)
}

async function writeRemoteCacheReplayJournal(
  path: string,
  journal: RemoteCacheReplayJournal,
) {
  await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`)
}

function assertRemoteCacheDirectory(
  target: 'preview' | 'production',
  cacheDir: string,
) {
  if (!cacheDir.startsWith(resolveRemoteCacheDir(target))) {
    throw new Error(
      `Refusing to update a replay journal outside the ${target} cache root.`,
    )
  }
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

async function resolveLatestConfiguredShardYear(target: 'preview' | 'production') {
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
        'Published-release replay uses the local mirror as its planning surface and will not clone remote D1 automatically.',
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

function isNonEmptyString(value: string | null | undefined): value is string {
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
            validateMirroredCacheBinding({
              bindingName: targetRecord.bindingName,
              cacheTableProfile: options.cacheTableProfile,
              destinationPath,
              tables,
              target,
              targetRecord,
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
              retryRemoteCacheExport(() =>
                exportRemoteTable(targetRecord, target, tableName, dumpPath, {
                  schemaOnly:
                    shouldMirrorTableSchemaOnly(
                      targetRecord.bindingName,
                      tableName,
                      options.cacheTableProfile,
                    ) || shouldMirrorBinaryGeometryTable(tableName),
                }),
              ),
            )
            dumpPaths.push(dumpPath)
            if (shouldMirrorBinaryGeometryTable(tableName)) {
              binaryTableImports.push({
                ...(await mirrorBinaryGeometryTable(
                  targetRecord,
                  target,
                  tableName,
                  workDir,
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
              tables,
              target,
              targetRecord,
            }),
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
    if (cacheTableProfile === 'divisionStatistic') {
      return []
    }

    if (cacheTableProfile === 'street') {
      return ['divisions', 'divisionsI18n', 'streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n']
    }

    if (
      cacheTableProfile === 'divisionGeometry' ||
      cacheTableProfile === 'planningDivisionGeometry'
    ) {
      return cacheTableProfile === 'planningDivisionGeometry'
        ? ['divisions', 'divisionsI18n', 'divisionAreas', 'divisionBoundaries']
        : ['divisions', 'divisionAreas', 'divisionBoundaries']
    }

    return [
      'divisions',
      'divisionsI18n',
      'streets',
      'streetsI18n',
      'address2d',
      'address2dI18n',
      'divisionAreas',
      'divisionBoundaries',
    ]
  }

  if (/^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'divisionStatistic') {
      return ['divisionStatistics']
    }

    if (cacheTableProfile === 'street') {
      return ['snapshotVersionChanges', 'streets', 'streetsI18n']
    }

    if (cacheTableProfile === 'division') {
      return ['divisions', 'divisionsI18n', 'snapshotVersionChanges']
    }

    if (
      cacheTableProfile === 'divisionGeometry' ||
      cacheTableProfile === 'planningDivisionGeometry'
    ) {
      return cacheTableProfile === 'planningDivisionGeometry'
        ? [
            'divisions',
            'divisionsI18n',
            'divisionAreas',
            'divisionBoundaries',
            'snapshotVersionChanges',
          ]
        : ['divisionAreas', 'divisionBoundaries', 'snapshotVersionChanges']
    }

    return [
      'divisions',
      'divisionsI18n',
      'address2d',
      'address2dI18n',
      'divisionAreas',
      'divisionBoundaries',
      'snapshotVersionChanges',
    ]
  }

  if (/^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)) {
    if (cacheTableProfile === 'divisionStatistic') {
      return ['hkgovCenstatdDistrictLandAreaPopulationDensities']
    }

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
        'hkgovCenstatdDivisionAreas',
        'hkgovCenstatdDivisionAreaDerivatives',
      ]
    }

    if (cacheTableProfile === 'planningDivisionGeometry') {
      return []
    }

    return [
      'overtureDivisions',
      'overtureDivisionAreas',
      'overtureDivisionBoundaries',
      'hkgovHadDivisionAreas',
      'hkgovCenstatdDivisionAreas',
      'hkgovCenstatdDivisionAreaDerivatives',
      'hkgovPlandPlanningCells',
      'hkgovPlandNewTowns',
      'hkgovAlsAddresses2d',
    ]
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
  options: { schemaOnly?: boolean } = {},
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
    ...(options.schemaOnly ? ['--no-data'] : []),
    '--output',
    outputPath,
  ])
}

async function exportRemoteTable(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tableName: string,
  outputPath: string,
  options: { schemaOnly?: boolean } = {},
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
    ...(options.schemaOnly ? ['--no-data'] : []),
    '--output',
    outputPath,
  ])
}

function shouldMirrorTableSchemaOnly(
  bindingName: string,
  tableName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  return (
    cacheTableProfile === 'planningDivisionGeometry' &&
    bindingName === 'DB_HISTORY_HK_BEFORE' &&
    (tableName === 'divisionAreas' ||
      tableName === 'divisionBoundaries' ||
      tableName === 'snapshotVersionChanges')
  )
}

function shouldMirrorBindingSchemaOnly(
  bindingName: string,
  cacheTableProfile?: CacheTableProfile,
) {
  return (
    cacheTableProfile === 'planningDivisionGeometry' &&
    /^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(bindingName)
  )
}

async function importDatabaseDumpsToSqlite(
  dumpPaths: string[],
  destinationPath: string,
  pruneOperations: CachePruneOperation[] = [],
  binaryTableImports: Array<
    Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>
  > = [],
) {
  await runSqliteCacheWorker({
    binaryTableImports,
    destinationPath,
    dumpPaths,
    pruneOperations,
    type: 'import-dumps',
  })
}

/** Tables whose geometry column may be a jsonTextOrBinary / binaryText BLOB. */
function resolveBinaryGeometryColumn(tableName: string) {
  switch (tableName) {
    case 'address2d':
    case 'divisions':
    case 'divisionAreas':
    case 'divisionBoundaries':
    case 'hkgovCenstatdDivisionAreaDerivatives':
      return 'geometry'
    case 'hkgovCenstatdDivisionAreas':
      return 'sourceGeometry'
    default:
      return null
  }
}

function shouldMirrorBinaryGeometryTable(tableName: string) {
  return resolveBinaryGeometryColumn(tableName) !== null
}

async function mirrorBinaryGeometryTable(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tableName: string,
  workDir: string,
): Promise<Pick<RemoteTableImport, 'binaryRowsPath'>> {
  const binaryColumn = resolveBinaryGeometryColumn(tableName)
  if (!binaryColumn) {
    throw new Error(`No binary geometry column is configured for ${tableName}.`)
  }
  const columns = await queryRemoteD1(
    targetRecord,
    target,
    `PRAGMA table_info(${quoteSqlIdentifier(tableName)})`,
  )
  const columnNames = columns.map(column =>
    requireRemoteString(column.name, 'column name'),
  )
  const primaryKeyColumns = columns
    .filter(column => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map(column => requireRemoteString(column.name, 'primary-key column'))
  if (!columnNames.includes(binaryColumn) || primaryKeyColumns.length === 0) {
    throw new Error(
      `Binary cache mirror requires a geometry column and primary key for ${targetRecord.bindingName}.${tableName}.`,
    )
  }

  const selectedColumns = columnNames.map(column =>
    column === binaryColumn
      ? `CASE WHEN typeof(${quoteSqlIdentifier(column)}) = 'blob' THEN NULL ELSE ${quoteSqlIdentifier(column)} END AS ${quoteSqlIdentifier(column)}`
      : quoteSqlIdentifier(column),
  )
  const orderBy = primaryKeyColumns.map(quoteSqlIdentifier).join(', ')
  const rows: BinaryGeometryRow[] = []

  for (let offset = 0; ; offset += REMOTE_GEOMETRY_PAGE_SIZE) {
    const remoteRows = await queryRemoteD1(
      targetRecord,
      target,
      [
        `SELECT ${selectedColumns.join(', ')},`,
        `typeof(${quoteSqlIdentifier(binaryColumn)}) AS "__geometryType",`,
        `length(${quoteSqlIdentifier(binaryColumn)}) AS "__geometryLength"`,
        `FROM ${quoteSqlIdentifier(tableName)}`,
        `ORDER BY ${orderBy}`,
        `LIMIT ${REMOTE_GEOMETRY_PAGE_SIZE} OFFSET ${offset}`,
      ].join(' '),
    )

    for (const remoteRow of remoteRows) {
      const geometryType = requireGeometryType(remoteRow.__geometryType)
      const values = Object.fromEntries(
        columnNames.map(column => [
          column,
          remoteRow[column] === undefined
            ? null
            : normaliseRemoteSqlValue(remoteRow[column]),
        ]),
      )
      const recordId = String(values.id ?? values.sourceRecordId ?? 'unknown-record')
      const snapshotId =
        typeof values.snapshotId === 'string' ? values.snapshotId : null
      const geometryLength = asOptionalRemoteInteger(remoteRow.__geometryLength)
      let geometry: Buffer | null = null
      let geometryDigest: string | null = null

      if (geometryType === 'blob') {
        const where = primaryKeyColumns
          .map(
            column =>
              `${quoteSqlIdentifier(column)} = ${toSqlLiteral(values[column] ?? null)}`,
          )
          .join(' AND ')
        const chunks = await readRemoteGeometryHexChunks(
          targetRecord,
          target,
          tableName,
          binaryColumn,
          where,
          geometryLength ?? 0,
        )
        geometry = reassembleHexChunks(chunks)
        geometryDigest = geometrySha256(geometry)
        values[binaryColumn] = null
      } else if (typeof values[binaryColumn] === 'string') {
        values[binaryColumn] = rejectReplacementCharacter(values[binaryColumn])
      }

      const row: BinaryGeometryRow = {
        binaryColumn,
        geometry,
        geometryDigest,
        geometryLength,
        geometryType,
        recordId,
        snapshotId,
        values,
      }
      assertBinaryGeometryRow(row)
      rows.push(row)
    }

    if (remoteRows.length < REMOTE_GEOMETRY_PAGE_SIZE) break
  }

  const binaryRowsPath = resolve(
    workDir,
    `${targetRecord.bindingName}-${tableName}-binary.json`,
  )
  await writeFile(
    binaryRowsPath,
    JSON.stringify(
      rows.map(row => ({
        ...row,
        geometry: row.geometry?.toString('hex') ?? null,
      })),
    ),
  )
  return { binaryRowsPath }
}

async function readRemoteGeometryHexChunks(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tableName: string,
  binaryColumn: string,
  where: string,
  byteLength: number,
) {
  const chunks: string[] = []
  for (
    let offset = 1;
    offset <= byteLength;
    offset += REMOTE_GEOMETRY_HEX_CHUNK_BYTES
  ) {
    const rows = await queryRemoteD1(
      targetRecord,
      target,
      `SELECT hex(substr(${quoteSqlIdentifier(binaryColumn)}, ${offset}, ${REMOTE_GEOMETRY_HEX_CHUNK_BYTES})) AS "hex" FROM ${quoteSqlIdentifier(tableName)} WHERE ${where}`,
    )
    const hex = rows[0]?.hex
    if (typeof hex !== 'string') {
      throw new Error(
        `Remote geometry chunk is missing for ${targetRecord.bindingName}.${tableName}.`,
      )
    }
    chunks.push(hex)
  }
  return chunks
}

async function validateMirroredCacheBinding(input: {
  bindingName: string
  cacheTableProfile?: CacheTableProfile
  destinationPath: string
  tables: string[]
  target: 'preview' | 'production'
  targetRecord: D1TargetRecord
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
  tables: string[]
  target: 'preview' | 'production'
  targetRecord: D1TargetRecord
}) {
  await assertCachedDatabaseHasExpectedTables(
    input.destinationPath,
    input.bindingName,
    input.cacheTableProfile,
  )
  for (const tableName of input.tables.filter(shouldMirrorBinaryGeometryTable)) {
    const binaryColumn = resolveBinaryGeometryColumn(tableName)
    if (!binaryColumn) continue
    const remote = await mirrorBinaryGeometryTable(
      input.targetRecord,
      input.target,
      tableName,
      dirname(input.destinationPath),
    )
    const binaryRowsPath = remote.binaryRowsPath
    if (!binaryRowsPath) {
      throw new Error(
        `Binary mirror did not produce rows for ${input.bindingName}.${tableName}.`,
      )
    }
    const rows = JSON.parse(
      await readFile(binaryRowsPath, 'utf8'),
    ) as BinaryGeometryRow[]
    await rm(binaryRowsPath, { force: true })
    const sqlite = new SQLiteDatabase(input.destinationPath, { readonly: true })
    try {
      for (const row of rows) {
        const primaryKeys = Object.entries(row.values).filter(
          ([column]) =>
            column === 'id' ||
            column === 'versionHash' ||
            column === 'snapshotId' ||
            column === 'sourceRecordId' ||
            column === 'inputVersionHash' ||
            column === 'transform',
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
    } finally {
      sqlite.close()
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
      ? await mirrorBinaryGeometryTable(targetRecord, target, tableName, workDir)
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

type SqliteCacheWorkerPayload =
  | {
      binaryTableImports?: Array<
        Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>
      >
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

async function queryRemoteD1(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  command: string,
) {
  await mkdir(WRANGLER_CONFIG_HOME, { recursive: true })
  await mkdir(WRANGLER_LOG_PATH, { recursive: true })

  // Invoke Node directly so Bun cannot load repository .env files. The result
  // contains only ordinary SQL values or ASCII hex; BLOBs are never requested.
  const env = { ...process.env }
  if (env.CLOUDFLARE_D1_TOKEN) {
    env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_D1_TOKEN
  } else {
    delete env.CLOUDFLARE_API_TOKEN
  }
  const proc = Bun.spawn(
    [
      'node',
      resolve(REPO_ROOT, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      targetRecord.databaseName,
      '--config',
      WRANGLER_CONFIG_PATH,
      '--env',
      target,
      '--remote',
      '--command',
      command,
      '--json',
    ],
    {
      cwd: '/tmp',
      env: {
        ...env,
        WRANGLER_LOG_PATH: env.WRANGLER_LOG_PATH ?? WRANGLER_LOG_PATH,
        XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? WRANGLER_CONFIG_HOME,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(
      (stderr || stdout || `D1 query failed for ${targetRecord.bindingName}.`).trim(),
    )
  }
  const jsonStart = stdout.search(/^[[{]/m)
  if (jsonStart === -1) {
    throw new Error(
      `Unexpected D1 query response for ${targetRecord.bindingName}: ${stdout}`,
    )
  }
  const payload = JSON.parse(stdout.slice(jsonStart)) as
    | { error?: unknown; results?: Array<Record<string, unknown>>; success?: boolean }
    | Array<{
        error?: unknown
        results?: Array<Record<string, unknown>>
        success?: boolean
      }>
  const result = Array.isArray(payload) ? payload[0] : payload
  if (!result || result.success === false || result.error) {
    throw new Error(
      `D1 query failed for ${targetRecord.bindingName}: ${JSON.stringify(result?.error ?? result)}`,
    )
  }
  return result.results ?? []
}

function requireRemoteString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Remote D1 returned an invalid ${label}.`)
  }
  return value
}

function normaliseRemoteSqlValue(value: unknown): null | number | string {
  if (value === null || typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  throw new Error(`Remote D1 returned a non-SQL value: ${JSON.stringify(value)}`)
}

function requireGeometryType(value: unknown): 'blob' | 'text' | 'null' {
  if (value === 'blob' || value === 'text' || value === 'null') return value
  throw new Error(
    `Remote D1 returned an unsupported geometry storage type: ${String(value)}.`,
  )
}

function asOptionalRemoteInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function toSqlLiteral(value: null | number | string) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

async function mapWithConcurrency<T>(
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
