import { mkdir, open, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import type { UploadTarget } from '../cli/options.ts'
import { prepareReleaseSqlDelivery } from '../pipeline/local/releaseSqlDelivery.ts'
import { sqlDeliveryPhaseDirectory } from '../pipeline/local/sqlDeliveryPhase.ts'
import { writeDeliveryFile } from '../pipeline/local/sqlDeliveryFiles.ts'
import { resolveLocalAddressDbContext } from './localDbCache.ts'
import {
  requireFullAcknowledgedMirror,
  resolveCurrentWriteContext,
} from './currentWriteContext.ts'
import { doCachedFilesExist, readManifest } from './localDbCacheManifest.ts'
import { DB_CACHE_MANIFEST_VERSION } from './localDbCacheConfig.ts'
import { resolveRemoteCacheDir } from './localDbCacheTargets.ts'
import type {
  LocalAddressDbContext,
  LocalDbCacheProgressEvent,
} from './localDbCacheTypes.ts'

/**
 * Reserve the acknowledged mirror and retain a WAL-safe disposable full copy.
 * Geometry preparation may mutate this copy; only acknowledged SQL replay advances
 * the shared mirror. Exact continuation reopens the same copy without resetting it.
 */
export async function prepareGeometryMirror(input: {
  context: LocalAddressDbContext
  releaseId: string
  phase: string
  inputs: Record<string, unknown>
  directory?: string
}) {
  const { context } = input
  const environment = context.state.target
  if (environment === 'local')
    throw new Error('Geometry mirror requires a remote baseline.')
  const directory = input.directory ?? sqlDeliveryPhaseDirectory(input)
  const targets = Object.entries(context.state.bindings).map(
    ([bindingName, value]) => ({
      bindingName,
      ...value,
      localDatabaseId: value.databaseId ?? bindingName,
    }),
  )
  const plan = await prepareReleaseSqlDelivery({
    ...input,
    directory,
    inputs: {
      ...input.inputs,
      bindings: context.state.bindings,
      mirrorContract: 'full-v1',
    },
    generate: async () => {
      const manifest = await requireFullAcknowledgedMirror(
        context.state.dbCacheDir,
        environment,
        targets,
      )
      const scopeKey = `geometry-preparation:${randomUUID()}`
      const cloneDir = resolve(
        context.state.dbCacheDir,
        basename(resolveRemoteCacheDir(environment, scopeKey)),
      )
      await mkdir(cloneDir)
      const files: Record<string, string> = {}
      try {
        for (const [binding, path] of Object.entries(manifest.files)) {
          const destination = join(cloneDir, `${binding}.sqlite`)
          const db = new Database(path, { readonly: true })
          try {
            db.query('VACUUM INTO ?').run(destination)
          } finally {
            db.close()
          }
          const file = await open(destination, 'r')
          try {
            await file.sync()
          } finally {
            await file.close()
          }
          files[binding] = destination
        }
        await writeDeliveryFile(
          cloneDir,
          'manifest.json',
          JSON.stringify({
            ...manifest,
            cacheScopeKey: scopeKey,
            files,
          }),
        )
        return { cloneDir, scopeKey, files, preparedAt: manifest.preparedAt }
      } catch (error) {
        await rm(cloneDir, { recursive: true, force: true })
        throw error
      }
    },
  })
  const cloneDir = plan.outputs?.cloneDir
  const files = plan.outputs?.files
  const scopeKey = plan.outputs?.scopeKey
  if (
    typeof scopeKey !== 'string' ||
    typeof cloneDir !== 'string' ||
    cloneDir !==
      resolve(
        context.state.dbCacheDir,
        basename(resolveRemoteCacheDir(environment, scopeKey)),
      ) ||
    !files ||
    typeof files !== 'object' ||
    Array.isArray(files)
  )
    throw new Error('Invalid retained geometry preparation context.')
  const manifest = await readManifest(join(cloneDir, 'manifest.json'))
  if (
    !manifest ||
    manifest.cacheVersion !== DB_CACHE_MANIFEST_VERSION ||
    manifest.target !== environment ||
    manifest.cacheScopeKey !== scopeKey ||
    manifest.cacheTableProfile !== undefined ||
    manifest.preparedAt !== plan.context.cachePreparedAt ||
    JSON.stringify(manifest.files) !== JSON.stringify(files) ||
    JSON.stringify(manifest.bindings) !== JSON.stringify(context.state.bindings) ||
    Object.entries(manifest.files).some(
      ([binding, path]) => resolve(path) !== resolve(cloneDir, `${binding}.sqlite`),
    ) ||
    !(await doCachedFilesExist(manifest.files, targets))
  )
    throw new Error(
      'Retained geometry preparation mirror is missing or incompatible; refusing to reset it.',
    )
  return { cloneDir, scopeKey, files: manifest.files, manifest }
}

export async function resolveGeometryPreparationContext(
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
  options: {
    releaseId: string
    resourceType: string
    preparedSha256: string
    onProgress?: (event: LocalDbCacheProgressEvent) => Promise<void> | void
  },
) {
  const baseline = await resolveCurrentWriteContext(target, regionCode, shardYear, {
    resumeSqlDeliveryReleaseId: options.releaseId,
    onProgress: options.onProgress,
  })
  if (!target.remote) return baseline
  try {
    const prepared = await prepareGeometryMirror({
      context: baseline,
      releaseId: options.releaseId,
      phase: `geometry-preparation-${options.resourceType.toLowerCase()}`,
      inputs: { regionCode, shardYear, preparedSha256: options.preparedSha256 },
    })
    return await resolveLocalAddressDbContext(target, regionCode, shardYear, {
      resumeSqlDeliveryReleaseId: options.releaseId,
      includeAllHistoryShardYears: true,
      includeAllSourceShardYears: true,
      requireExistingRemoteCache: true,
      // The disposable context is already validated. Its explicit path is not
      // accepted by the public shared-baseline acquisition helper.
      remoteCacheScopeKey: prepared.scopeKey,
    })
  } finally {
    baseline.cleanup()
  }
}
