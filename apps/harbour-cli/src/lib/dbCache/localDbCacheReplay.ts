import { mkdir, mkdtemp, writeFile, rm, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { resolveD1Targets, resolveRemoteCacheDir } from './localDbCacheTargets.ts'
import {
  CACHE_ROOT,
  REMOTE_CACHE_REPLAY_RETRY_DELAY_MS,
  REMOTE_CACHE_REPLAY_RETRY_LIMIT,
  REMOTE_META_CACHE_REFRESH_RETRY_DELAY_MS,
  REMOTE_META_CACHE_REFRESH_RETRY_LIMIT,
} from './localDbCacheConfig.ts'
import { exportRemoteDatabase, importDatabaseDumpsToSqlite } from './localDbCacheIo.ts'
import { assertCachedDatabaseHasExpectedTables } from './localDbCacheProfiles.ts'
import type { RemoteCacheReplayJournal } from './localDbCacheTypes.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  readPendingSqlDelivery,
} from '../pipeline/local/sqlDeliveryPending.ts'
import { withDeliveryLock } from '../pipeline/local/sqlDeliveryFiles.ts'
import { readManifest } from './localDbCacheManifest.ts'

export async function refreshRemoteMetaCache(
  target: 'preview' | 'production',
  cacheDir: string,
  resourceReleaseId?: string,
) {
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), () =>
    refreshRemoteMetaCacheLocked(target, cacheDir, resourceReleaseId),
  )
}

/** Caller holds the mirror-wide delivery lock, including recovery before local replay. */
export async function refreshRemoteMetaCacheLocked(
  target: 'preview' | 'production',
  cacheDir: string,
  resourceReleaseId?: string,
) {
  assertRemoteCacheDirectory(target, cacheDir)
  await assertSqlDeliveryPlanningAllowed(cacheDir, resourceReleaseId)
  const targetRecord = (await resolveD1Targets(target)).find(
    record => record.bindingName === 'DB_META',
  )

  if (!targetRecord) {
    throw new Error(`Could not resolve DB_META for ${target}.`)
  }
  const manifest = await readManifest(join(cacheDir, 'manifest.json'))
  if (
    manifest?.target !== target ||
    manifest.bindings?.DB_META?.databaseId !== targetRecord.databaseId ||
    manifest.bindings?.DB_META?.databaseName !== targetRecord.databaseName
  ) {
    throw new Error(
      'Metadata refresh target differs from the acknowledged mirror binding.',
    )
  }

  await mkdir(CACHE_ROOT, { recursive: true })
  const workDir = await mkdtemp(resolve(CACHE_ROOT, `.refresh-meta-${target}-`))
  const dumpPath = resolve(workDir, 'DB_META.sql')
  const destinationPath = resolve(cacheDir, 'DB_META.sqlite')
  const refreshedPath = resolve(workDir, 'DB_META.sqlite')

  try {
    await retryRemoteCacheExport(() =>
      exportRemoteDatabase(targetRecord, target, dumpPath),
    )
    await importDatabaseDumpsToSqlite([dumpPath], refreshedPath)
    await assertCachedDatabaseHasExpectedTables(refreshedPath, 'DB_META')
    const refreshed = new SQLiteDatabase(refreshedPath)
    try {
      refreshed.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    } finally {
      refreshed.close()
    }
    await rename(refreshedPath, destinationPath)
  } finally {
    await rm(workDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

/** Applies the publish response to the local mirror without another D1 export. */
export async function applyPublishMetadataDeltaToRemoteCache(
  target: 'preview' | 'production',
  cacheDir: string,
  publishResult: PublishDatasetResult,
) {
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), async () => {
    await assertSqlDeliveryPlanningAllowed(cacheDir, publishResult.resourceReleaseId)
    return applyPublishMetadataDeltaLocked(target, cacheDir, publishResult)
  })
}

async function applyPublishMetadataDeltaLocked(
  target: 'preview' | 'production',
  cacheDir: string,
  publishResult: PublishDatasetResult,
) {
  const delta = publishResult.metadataDelta
  if (!delta) {
    throw new Error('Publish response did not include a metadata delta.')
  }

  const metaPath = resolve(cacheDir, 'DB_META.sqlite')
  assertRemoteCacheDirectory(target, cacheDir)
  const sqlite = new SQLiteDatabase(metaPath)
  try {
    sqlite.transaction(() => {
      const updateRelease = sqlite.prepare(
        'UPDATE resourceReleases SET status = ?, updatedAt = ? WHERE id = ?',
      )
      const updateSnapshot = sqlite.prepare(
        'UPDATE snapshots SET status = ?, publishedAt = ?, validFrom = ?, validTo = ?, updatedAt = ? WHERE id = ?',
      )
      const updatedAt = new Date().toISOString()
      for (const release of delta.releases) {
        const result = updateRelease.run(release.status, updatedAt, release.id)
        if (result.changes !== 1) {
          throw new Error(`Local meta cache is missing release ${release.id}.`)
        }
      }
      for (const snapshot of delta.snapshots ?? []) {
        const result = updateSnapshot.run(
          snapshot.status,
          snapshot.publishedAt,
          snapshot.validFrom,
          snapshot.validTo,
          updatedAt,
          snapshot.id,
        )
        if (result.changes !== 1) {
          throw new Error(`Local meta cache is missing snapshot ${snapshot.id}.`)
        }
      }
      for (const releaseSet of delta.apiReleaseSets ?? []) {
        const upsert = (table: string, row: Record<string, string | number | null>) => {
          const columns = Object.keys(row)
          sqlite
            .prepare(
              `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns
                .filter(column => column !== 'id')
                .map(column => `${column}=excluded.${column}`)
                .join(',')}`,
            )
            .run(...Object.values(row))
        }
        upsert('apiReleaseSets', {
          id: releaseSet.apiReleaseSetId,
          code: releaseSet.code,
          regionCode: releaseSet.regionCode,
          domainCode: releaseSet.domainCode,
          cohortKey: releaseSet.cohortKey,
          revision: releaseSet.revision,
          effectiveFrom: releaseSet.effectiveFrom,
          schemaVersion: releaseSet.schemaVersion,
          rulesetVersion: releaseSet.rulesetVersion,
          versionHash: releaseSet.contentVersionHash,
          createdAt: releaseSet.contentCreatedAt,
          updatedAt: releaseSet.contentUpdatedAt,
        })
        upsert('apiVersionReleaseSets', {
          id: releaseSet.id,
          apiReleaseSetId: releaseSet.apiReleaseSetId,
          apiVersionId: releaseSet.apiVersionId,
          apiCompositionId: releaseSet.apiCompositionId,
          previousRevisionApiReleaseSetId: releaseSet.previousRevisionApiReleaseSetId,
          status: releaseSet.status,
          publishedAt: releaseSet.publishedAt,
          validFrom: releaseSet.validFrom,
          validTo: releaseSet.validTo,
          notes: releaseSet.notes,
          guide: releaseSet.guide,
          versionHash: releaseSet.versionHash,
          createdAt: releaseSet.createdAt,
          updatedAt: releaseSet.updatedAt,
        })
      }
    })()
  } finally {
    sqlite.close()
  }
}

export async function retryRemoteCacheExport(exportDatabase: () => Promise<void>) {
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
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), async () => {
    await assertSqlDeliveryPlanningAllowed(cacheDir)
    return invalidateRemoteDbCacheLocked(target, cacheDir, reason)
  })
}

/** Caller holds the mirror-wide delivery lock. Pending plans are always retained. */
export async function invalidateRemoteDbCacheLocked(
  target: 'preview' | 'production',
  cacheDir: string,
  reason?: string,
) {
  await assertSqlDeliveryPlanningAllowed(cacheDir)
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
  if (await readPendingSqlDelivery(cacheDir)) {
    throw new Error(
      `Local SQL replay failed; the retained delivery and mirror are available for sql:resume. ${reason}`,
    )
  }
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
