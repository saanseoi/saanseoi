import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import type {
  SqlImportExecutionOptions,
  SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import type { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

const HARBOUR_API_WRANGLER_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')

export function resolveRollbackShardHints(args: ParsedArgs, releaseSpecifier: string) {
  const explicitRegion = getStringOption(args, ['region'])
  const explicitShardYear = getStringOption(args, ['shard-year', 'year'])

  if (explicitRegion && explicitShardYear) {
    return {
      regionCode: explicitRegion,
      shardYear: explicitShardYear,
    }
  }

  const parsed = releaseSpecifier.match(
    /(?:^|[-_])(?<region>hk|mo)[-_](?<date>20\d{2}-\d{2}-\d{2})/i,
  )

  if (parsed?.groups?.region && parsed.groups.date) {
    return {
      regionCode: parsed.groups.region.toLowerCase(),
      shardYear: parsed.groups.date.slice(0, 4),
    }
  }

  throw new Error(
    'Could not infer rollback shard. Pass --region hk|mo and --shard-year YYYY.',
  )
}

export function resolveMetaTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.metaBinding,
    databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    name: 'meta',
  }
}

export function resolveCurrentTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.currentBinding,
    databaseId: dbContext.state.bindings.DB_CURRENT?.databaseId ?? null,
    name: 'current',
  }
}

export function resolveHistoryTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  const target = dbContext.historyTargets.at(-1)

  if (!target) {
    throw new Error('Could not resolve rollback history target.')
  }

  return {
    binding: target.binding,
    databaseId: target.databaseId,
    name: 'history',
  }
}

export function resolveSourceTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  const target = dbContext.sourceTargets.at(-1)

  if (!target) {
    throw new Error('Could not resolve rollback source target.')
  }

  return {
    binding: target.binding,
    databaseId: target.databaseId,
    name: 'source',
  }
}

export function assertRemoteRollbackImportPrerequisites(
  target: UploadTarget,
  artefacts: ReadonlyArray<{ target: SqlImportTargetContext }>,
  options: SqlImportExecutionOptions,
) {
  if (!target.remote) {
    return
  }

  const missing: string[] = []

  if (!options.accountId?.trim()) {
    missing.push('CLOUDFLARE_ACCOUNT_ID')
  }
  if (!options.apiToken?.trim()) {
    missing.push('CLOUDFLARE_D1_TOKEN')
  }

  for (const artefact of artefacts) {
    if (!artefact.target.databaseId?.trim()) {
      missing.push(`${artefact.target.name}.databaseId`)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Remote rollback import prerequisites missing: ${missing.join(', ')}.`,
    )
  }
}

export function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

export function resolveRemoteTargetName(
  target: UploadTarget,
): 'preview' | 'production' {
  if (!target.remote) {
    throw new Error('Rollback remote target requested for a local target.')
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

export function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

  if (fromEnv) {
    return fromEnv
  }

  const rawConfig = readFileSync(HARBOUR_API_WRANGLER_PATH, 'utf8')
  const config = JSON.parse(rawConfig) as {
    vars?: Record<string, unknown>
    env?: {
      preview?: {
        vars?: Record<string, unknown>
      }
      production?: {
        vars?: Record<string, unknown>
      }
    }
  }
  const targetName = resolveTargetName(target)
  const vars =
    targetName === 'production'
      ? config.env?.production?.vars
      : targetName === 'preview'
        ? config.env?.preview?.vars
        : config.vars
  const accountId = vars?.CLOUDFLARE_ACCOUNT_ID

  return typeof accountId === 'string' && accountId.trim()
    ? accountId.trim()
    : undefined
}

export function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}
