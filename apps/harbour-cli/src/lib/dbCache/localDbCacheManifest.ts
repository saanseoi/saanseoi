import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  CacheTableProfile,
  D1TargetRecord,
  DbCacheManifest,
  LocalDbCacheProgressEvent,
  RemoteCachePartialCheckpoint,
} from './localDbCacheTypes.ts'
import { isMissingFileError, resolveRemoteCacheDir } from './localDbCacheTargets.ts'
import {
  countRemoteCacheRefreshWorkUnits,
  countRemoteCacheWorkUnits,
  mirrorRemoteTargetToLocal,
  refreshRemoteCacheTables,
} from './localDbCacheMirror.ts'
import {
  DB_CACHE_MANIFEST_VERSION,
  REMOTE_CACHE_PARTIAL_DIR,
} from './localDbCacheConfig.ts'
import { hasExpectedTables } from './localDbCacheProfiles.ts'
import { assertSqlDeliveryPlanningAllowed } from '../pipeline/local/sqlDeliveryPending.ts'

export async function ensureRemoteCachePaths(
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
  options: {
    resumeSqlDeliveryReleaseId?: string
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
    requireExistingRemoteCache?: boolean
    refreshRemoteCache?: boolean
    refreshRemoteTables?: boolean
    remoteCacheScopeKey?: string
    cacheTableProfile?: CacheTableProfile
  } = {},
) {
  const bindings = Object.fromEntries(
    targets.map(record => [
      record.bindingName,
      {
        databaseId: record.databaseId,
        databaseName: record.databaseName,
      },
    ]),
  )
  const cacheDir = resolveRemoteCacheDir(target, options.remoteCacheScopeKey)
  await assertSqlDeliveryPlanningAllowed(cacheDir, options.resumeSqlDeliveryReleaseId)
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
    targets.every(
      record =>
        existingManifest.bindings?.[record.bindingName]?.databaseId ===
          record.databaseId &&
        existingManifest.bindings?.[record.bindingName]?.databaseName ===
          record.databaseName,
    ) &&
    existingManifest.cacheScopeKey === options.remoteCacheScopeKey &&
    isCacheTableProfileCompatible(
      existingManifest.cacheTableProfile,
      options.cacheTableProfile,
    ) &&
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
        bindings: { ...existingManifest.bindings, ...bindings },
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

  const reusableFiles = await resolveReusableCachedFiles(
    cacheDir,
    options.refreshRemoteCache ? {} : (existingManifest?.files ?? {}),
    targets,
    options.cacheTableProfile,
    target,
    options.remoteCacheScopeKey,
  )

  if (
    options.requireExistingRemoteCache &&
    Object.keys(reusableFiles).length === targets.length
  ) {
    const manifest: DbCacheManifest = {
      bindings,
      cacheVersion: DB_CACHE_MANIFEST_VERSION,
      cacheScopeKey: options.remoteCacheScopeKey,
      cacheTableProfile: options.cacheTableProfile,
      files: reusableFiles,
      preparedAt: new Date().toISOString(),
      target,
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    await rm(resolve(cacheDir, REMOTE_CACHE_PARTIAL_DIR), {
      force: true,
      recursive: true,
    }).catch(() => undefined)
    await options.onProgress?.({
      action: 'reuse-cache',
      bindingName: 'cache',
      current: totalUnits,
      target,
      total: totalUnits,
    })
    return reusableFiles
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

  const targetsToMirror = targets.filter(
    targetRecord => !reusableFiles[targetRecord.bindingName],
  )
  const mirroredFiles =
    targetsToMirror.length > 0
      ? await mirrorRemoteTargetToLocal(target, targetsToMirror, cacheDir, {
          cacheTableProfile: options.cacheTableProfile,
          cacheScopeKey: options.remoteCacheScopeKey,
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
    bindings,
    cacheVersion: DB_CACHE_MANIFEST_VERSION,
    cacheScopeKey: options.remoteCacheScopeKey,
    cacheTableProfile: options.cacheTableProfile,
    files,
    preparedAt: new Date().toISOString(),
    target,
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await rm(resolve(cacheDir, REMOTE_CACHE_PARTIAL_DIR), {
    force: true,
    recursive: true,
  }).catch(() => undefined)
  await rm(invalidatedManifestPath, { force: true }).catch(() => undefined)
  return files
}

async function resolveReusableCachedFiles(
  cacheDir: string,
  files: Record<string, string>,
  targets: D1TargetRecord[],
  cacheTableProfile?: CacheTableProfile,
  targetEnvironment?: 'preview' | 'production',
  cacheScopeKey?: string,
) {
  const reusableFiles: Record<string, string> = {}

  for (const targetRecord of targets) {
    const partial = await readRemoteCachePartialCheckpoint(
      cacheDir,
      targetRecord.bindingName,
    )
    const partialMatches =
      partial &&
      partial.cacheVersion === DB_CACHE_MANIFEST_VERSION &&
      partial.target === targetEnvironment &&
      isCacheTableProfileCompatible(partial.cacheTableProfile, cacheTableProfile) &&
      partial.cacheScopeKey === cacheScopeKey
    const candidatePaths = [
      files[targetRecord.bindingName],
      partialMatches ? partial.filePath : null,
    ].filter(isNonEmptyString)

    for (const filePath of candidatePaths) {
      if (
        await isValidCachedFile(filePath, targetRecord.bindingName, cacheTableProfile)
      ) {
        reusableFiles[targetRecord.bindingName] = filePath
        break
      }
    }
  }

  return reusableFiles
}

async function readRemoteCachePartialCheckpoint(cacheDir: string, bindingName: string) {
  try {
    const raw = await readFile(
      resolve(cacheDir, REMOTE_CACHE_PARTIAL_DIR, `${bindingName}.json`),
      'utf8',
    )
    return JSON.parse(raw) as RemoteCachePartialCheckpoint
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

export async function writeRemoteCachePartialCheckpoint(input: {
  bindingName: string
  cacheDir: string
  cacheScopeKey?: string
  cacheTableProfile?: CacheTableProfile
  filePath: string
  target: 'preview' | 'production'
}) {
  const partialDir = resolve(input.cacheDir, REMOTE_CACHE_PARTIAL_DIR)
  await mkdir(partialDir, { recursive: true })
  const checkpoint: RemoteCachePartialCheckpoint = {
    bindingName: input.bindingName,
    ...(input.cacheScopeKey ? { cacheScopeKey: input.cacheScopeKey } : {}),
    ...(input.cacheTableProfile ? { cacheTableProfile: input.cacheTableProfile } : {}),
    cacheVersion: DB_CACHE_MANIFEST_VERSION,
    filePath: input.filePath,
    target: input.target,
    validatedAt: new Date().toISOString(),
  }
  await writeFile(
    resolve(partialDir, `${input.bindingName}.json`),
    JSON.stringify(checkpoint, null, 2),
  )
}

export async function removeRemoteCachePartialCheckpoint(
  cacheDir: string,
  bindingName: string,
) {
  await rm(resolve(cacheDir, REMOTE_CACHE_PARTIAL_DIR, `${bindingName}.json`), {
    force: true,
  }).catch(() => undefined)
}

export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** An unprofiled mirror is the reusable superset; named profiles are subsets. */
function isCacheTableProfileCompatible(
  cachedProfile: CacheTableProfile | undefined,
  requestedProfile: CacheTableProfile | undefined,
) {
  return cachedProfile === undefined || cachedProfile === requestedProfile
}

export async function readManifest(manifestPath: string) {
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

export async function readInvalidatedManifest(manifestPath: string) {
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

export async function doCachedFilesExist(
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

export async function isValidCachedFile(
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
