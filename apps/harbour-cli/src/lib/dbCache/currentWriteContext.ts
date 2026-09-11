import { join, resolve } from 'node:path'
import type { UploadTarget } from '../cli/options.ts'
import { withDeliveryLock } from '../pipeline/local/sqlDeliveryFiles.ts'
import { assertSqlDeliveryPlanningAllowed } from '../pipeline/local/sqlDeliveryPending.ts'
import { resolveLocalAddressDbContext } from './localDbCache.ts'
import { DB_CACHE_MANIFEST_VERSION } from './localDbCacheConfig.ts'
import { doCachedFilesExist, readManifest } from './localDbCacheManifest.ts'
import { resolveD1Targets, resolveRemoteCacheDir } from './localDbCacheTargets.ts'
import type { D1TargetRecord, LocalDbCacheProgressEvent } from './localDbCacheTypes.ts'

/** A table-complete schema cannot certify data completeness after a profiled export. */
export async function requireFullAcknowledgedMirror(
  cacheDir: string,
  target: 'preview' | 'production',
  targets: D1TargetRecord[],
) {
  const manifest = await readManifest(join(cacheDir, 'manifest.json'))
  if (
    !manifest ||
    manifest.cacheVersion !== DB_CACHE_MANIFEST_VERSION ||
    manifest.target !== target ||
    manifest.cacheScopeKey !== undefined ||
    manifest.cacheTableProfile !== undefined ||
    !manifest.preparedAt ||
    targets.some(
      record =>
        !manifest.files[record.bindingName] ||
        resolve(manifest.files[record.bindingName]!) !==
          resolve(cacheDir, `${record.bindingName}.sqlite`),
    ) ||
    !(await doCachedFilesExist(manifest.files, targets))
  ) {
    throw new Error(
      `Current-write planning requires a complete shared ${target} mirror at ${cacheDir}. Seed or rebuild the full mirror explicitly; a family profile or release planning cache is not an acknowledged baseline.`,
    )
  }
  return manifest
}

/** Every family plans against the same complete, retained source/history baseline. */
export async function resolveCurrentWriteContext(
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
  options: {
    resumeSqlDeliveryReleaseId?: string
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
  } = {},
) {
  const open = () =>
    resolveLocalAddressDbContext(target, regionCode, shardYear, {
      ...options,
      includeAllHistoryShardYears: true,
      includeAllSourceShardYears: true,
      refreshRemoteTables: false,
      requireExistingRemoteCache: target.remote,
    })
  if (!target.remote) return open()
  const environment = target.environment === 'production' ? 'production' : 'preview'
  const cacheDir = resolveRemoteCacheDir(environment)
  return withDeliveryLock(join(cacheDir, 'sql-delivery-lock'), async () => {
    await assertSqlDeliveryPlanningAllowed(cacheDir, options.resumeSqlDeliveryReleaseId)
    const manifest = await requireFullAcknowledgedMirror(
      cacheDir,
      environment,
      await resolveD1Targets(environment),
    )
    const context = await open()
    context.state.preparedAt = manifest.preparedAt
    return context
  })
}
