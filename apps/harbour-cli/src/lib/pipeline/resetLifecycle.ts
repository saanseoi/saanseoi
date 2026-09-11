import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withDeliveryLock } from './local/sqlDeliveryFiles.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  discardAbandonedSqlDelivery,
} from './local/sqlDeliveryPending.ts'
import { invalidateSqlDeliveryReleases } from './local/sqlDeliveryGeneration.ts'

import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import { invalidateRemoteDbCacheLocked } from '../dbCache/localDbCacheReplay.ts'
import { withRemoteCacheMutation } from '../dbCache/remoteCacheMutation.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { executeSqlText, type SqlImportTargetContext } from './local/sqlImport.ts'

export type ResetSqlArtefact = {
  sql: string
  target: SqlImportTargetContext
}

/** Keep option validation identical across family-specific reset commands. */
export function validateResetArguments(
  args: ParsedArgs,
  printUsage: () => void,
  command: string,
  allowedOptions: readonly string[],
) {
  const allowed = new Set(['target', ...allowedOptions])
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !allowed.has(key))
  ) {
    printUsage()
    throw new Error(
      `\`${command}\` accepts only ${[...allowed].map(option => `--${option}`).join(', ')}.`,
    )
  }
}

/** Execute a family reset against its remote database and replay its exact SQL
 * into the persistent local mirror when one exists. */
export async function executeResetSqlArtefacts(options: {
  artefacts: readonly ResetSqlArtefact[]
  cacheReleaseCodes: readonly string[]
  cacheReleaseIds: readonly string[]
  cacheRoot: string
  context: LocalAddressDbContext
  extraCachePaths?: readonly string[]
  keepCache: boolean
  discardAbandonedSqlDelivery?: boolean
  target: UploadTarget
  remoteCacheErrorMessage: string
  validateUnderLock?: () => Promise<void>
  beforeSql?: () => Promise<void>
  afterSql?: () => Promise<void>
}) {
  return withDeliveryLock(
    join(options.context.state.dbCacheDir, 'sql-delivery-lock'),
    async () => {
      // Context acquisition and user confirmation can precede this by minutes.
      // Recheck ownership under the writer lock immediately before destructive SQL.
      if (options.discardAbandonedSqlDelivery) {
        await discardAbandonedSqlDelivery(options.context.state.dbCacheDir)
      } else {
        await assertSqlDeliveryPlanningAllowed(options.context.state.dbCacheDir)
      }
      await options.validateUnderLock?.()
      await invalidateSqlDeliveryReleases(
        options.context.state.dbCacheDir,
        options.cacheReleaseIds,
      )
      await options.beforeSql?.()
      await executeResetSqlArtefactsLocked(options)
      await options.afterSql?.()
    },
  )
}

async function executeResetSqlArtefactsLocked(
  options: Parameters<typeof executeResetSqlArtefacts>[0],
) {
  const importOptions = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_D1_TOKEN,
    isLocal: !options.target.remote,
  }
  const execute = async () => {
    for (const artefact of options.artefacts) {
      await executeSqlText(artefact.target, artefact.sql, importOptions)
    }
    if (!options.target.remote) return
    try {
      for (const artefact of options.artefacts) {
        await executeSqlText(artefact.target, artefact.sql, { isLocal: true })
      }
    } catch (error) {
      await invalidateRemoteDbCacheLocked(
        options.target.environment === 'production' ? 'production' : 'preview',
        options.context.state.dbCacheDir,
        `${options.remoteCacheErrorMessage}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new Error(
        `${options.remoteCacheErrorMessage}; the local cache was invalidated.`,
      )
    }
  }
  if (options.target.remote) {
    await withRemoteCacheMutation(
      options.context.state.dbCacheDir,
      'Dataset reset has not completed remote execution and local replay; rebuild the cache before continuing.',
      execute,
    )
  } else {
    await execute()
  }

  if (options.keepCache) return

  for (const releaseId of options.cacheReleaseIds) {
    await rm(
      resolve(
        import.meta.dir,
        '../../../../../.local/harbour-sql/deliveries',
        options.target.remote ? options.target.environment : 'local',
        `release-${encodeURIComponent(releaseId)}`,
      ),
      { force: true, recursive: true },
    )
  }

  for (const path of options.extraCachePaths ?? []) {
    await rm(path, { force: true, recursive: true })
  }
  for (const directory of options.target.remote
    ? [options.target.environment, 'remote']
    : ['local']) {
    for (const releaseCode of options.cacheReleaseCodes) {
      await rm(resolve(options.cacheRoot, directory, releaseCode), {
        force: true,
        recursive: true,
      })
    }
  }
}
