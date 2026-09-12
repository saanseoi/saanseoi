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
  releaseId?: string,
) {
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), () =>
    refreshRemoteMetaCacheLocked(target, cacheDir, releaseId),
  )
}

/** Caller holds the mirror-wide delivery lock, including recovery before local replay. */
export async function refreshRemoteMetaCacheLocked(
  target: 'preview' | 'production',
  cacheDir: string,
  releaseId?: string,
) {
  assertRemoteCacheDirectory(target, cacheDir)
  await assertSqlDeliveryPlanningAllowed(cacheDir, releaseId)
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
    await assertSqlDeliveryPlanningAllowed(cacheDir, publishResult.releaseId)
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
        'UPDATE releases SET status = ?, updatedAt = ? WHERE id = ?',
      )
      const updateReleaseSet = sqlite.prepare(
        `UPDATE apiReleaseSets SET
          apiVersionId = ?, apiCompositionId = ?, code = ?, regionCode = ?, domainCode = ?,
          cohortKey = ?, revision = ?, effectiveFrom = ?, effectiveTo = ?,
          supersedesApiReleaseSetId = ?, schemaVersion = ?, rulesetVersion = ?, status = ?,
          publishedAt = ?, validFrom = ?, validTo = ?, notes = ?, guide = ?, versionHash = ?,
          createdAt = ?, updatedAt = ?
        WHERE id = ?`,
      )
      const updateSnapshot = sqlite.prepare(
        'UPDATE snapshots SET status = ?, publishedAt = ?, validFrom = ?, validTo = ?, updatedAt = ? WHERE id = ?',
      )
      const insertReleaseSet = sqlite.prepare(`
        INSERT INTO apiReleaseSets (
          id, apiVersionId, apiCompositionId, code, regionCode, domainCode, cohortKey,
          revision, effectiveFrom, effectiveTo, supersedesApiReleaseSetId, schemaVersion,
          rulesetVersion, status, publishedAt, validFrom, validTo, notes, guide, versionHash,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
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
        const result = updateReleaseSet.run(
          releaseSet.apiVersionId,
          releaseSet.apiCompositionId,
          releaseSet.code,
          releaseSet.regionCode,
          releaseSet.domainCode,
          releaseSet.cohortKey,
          releaseSet.revision,
          releaseSet.effectiveFrom,
          releaseSet.effectiveTo,
          releaseSet.supersedesApiReleaseSetId,
          releaseSet.schemaVersion,
          releaseSet.rulesetVersion,
          releaseSet.status,
          releaseSet.publishedAt,
          releaseSet.validFrom,
          releaseSet.validTo,
          releaseSet.notes,
          releaseSet.guide,
          releaseSet.versionHash,
          releaseSet.createdAt,
          releaseSet.updatedAt,
          releaseSet.id,
        )
        if (result.changes !== 1) {
          insertReleaseSet.run(
            releaseSet.id,
            releaseSet.apiVersionId,
            releaseSet.apiCompositionId,
            releaseSet.code,
            releaseSet.regionCode,
            releaseSet.domainCode,
            releaseSet.cohortKey,
            releaseSet.revision,
            releaseSet.effectiveFrom,
            releaseSet.effectiveTo,
            releaseSet.supersedesApiReleaseSetId,
            releaseSet.schemaVersion,
            releaseSet.rulesetVersion,
            releaseSet.status,
            releaseSet.publishedAt,
            releaseSet.validFrom,
            releaseSet.validTo,
            releaseSet.notes,
            releaseSet.guide,
            releaseSet.versionHash,
            releaseSet.createdAt,
            releaseSet.updatedAt,
          )
        }
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
