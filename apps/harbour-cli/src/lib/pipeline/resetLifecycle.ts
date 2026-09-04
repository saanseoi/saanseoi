import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import { invalidateRemoteDbCache } from '../dbCache/localDbCache.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'

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
  cacheRoot: string
  context: LocalAddressDbContext
  extraCachePaths?: readonly string[]
  keepCache: boolean
  target: UploadTarget
  remoteCacheErrorMessage: string
}) {
  const importOptions = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_D1_TOKEN,
    isLocal: !options.target.remote,
  }
  for (const artefact of options.artefacts) {
    await executeSqlText(artefact.target, artefact.sql, importOptions)
  }

  if (options.target.remote) {
    try {
      for (const artefact of options.artefacts) {
        await executeSqlText(artefact.target, artefact.sql, { isLocal: true })
      }
    } catch (error) {
      await invalidateRemoteDbCache(
        options.target.environment === 'production' ? 'production' : 'preview',
        options.context.state.dbCacheDir,
        `${options.remoteCacheErrorMessage}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new Error(
        `${options.remoteCacheErrorMessage}; the local cache was invalidated.`,
      )
    }
  }

  if (options.keepCache) return

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
