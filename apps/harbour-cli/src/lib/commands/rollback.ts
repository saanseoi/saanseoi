import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { and, desc, eq, metaSchema, ne } from '@repo/db'
import { buildLatestReleaseRollbackSql } from '@repo/core/pipeline/rollback'
import {
  resolveActiveReleaseSetForType,
  resolveDatasetRecord,
  resolveReleaseSetForRelease,
  resolveSnapshotForRelease,
} from '@repo/core/db/metaRepository'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ResourceType } from '@repo/core'
import { note, outro } from '@clack/prompts'

import { describeTarget, formatField } from '../display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'

type ReleaseRecord = Awaited<ReturnType<typeof resolveDatasetRecord>>

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const ROLLBACK_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/rollbacks')
const HARBOUR_API_WRANGLER_PATH = resolve(REPO_ROOT, 'apps/harbour-api/wrangler.jsonc')

export async function runRollbackReleaseCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: {
    dryRun: boolean
    printUsage: () => void
  },
) {
  const releaseSpecifier = getStringOption(args, ['release']) ?? args.positionals[0]

  if (!releaseSpecifier) {
    options.printUsage()
    throw new Error('Missing release identifier. Pass `--release <release-id|code>`.')
  }

  const shardHints = resolveRollbackShardHints(args, releaseSpecifier)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    shardHints.regionCode,
    shardHints.shardYear,
    {
      refreshRemoteCache: target.remote,
    },
  )

  try {
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb
    const release = await resolveDatasetRecord(metaDb, {
      releaseCode: releaseSpecifier,
      releaseId: releaseSpecifier,
    })

    if (!release) {
      throw new Error(`Release not found: ${releaseSpecifier}`)
    }

    const resourceType = release.type as ResourceType
    const releaseSet = await resolveReleaseSetForRelease(
      metaDb,
      release.releaseId,
      resourceType,
    )
    const activeReleaseSet = await resolveActiveReleaseSetForType(metaDb, resourceType)
    const snapshot = await resolveSnapshotForRelease(
      metaDb,
      release.releaseId,
      resourceType,
    )

    if (!releaseSet || !activeReleaseSet || releaseSet.id !== activeReleaseSet.id) {
      throw new Error(
        `Rollback only supports the active latest ${resourceType} release. ${release.releaseCode} is not active.`,
      )
    }

    if (!snapshot) {
      throw new Error(`Snapshot not found for release ${release.releaseCode}.`)
    }

    const previousReleaseId = await resolvePreviousPublishedReleaseId(
      dbContext.metaDb,
      release.releaseId,
    )
    const previousRelease = previousReleaseId
      ? await resolveDatasetRecord(metaDb, { releaseId: previousReleaseId })
      : null
    const previousReleaseSet = previousReleaseId
      ? await resolveReleaseSetForRelease(metaDb, previousReleaseId, resourceType)
      : null

    await assertRollbackPreconditions(release, previousRelease)

    const rollbackSql = buildLatestReleaseRollbackSql({
      apiReleaseSetId: releaseSet.id,
      previousApiReleaseSetId: previousReleaseSet?.id ?? null,
      previousReleaseId,
      releaseId: release.releaseId,
      snapshotId: snapshot.id,
      source: release.source,
      sourceVersion: release.sourceVersion,
      type: resourceType,
    })
    const rollbackRoot = resolve(
      ROLLBACK_ROOT,
      resolveTargetName(target),
      release.releaseCode,
    )
    const artifacts = [
      {
        name: 'source',
        sql: rollbackSql.source,
        target: resolveSourceTarget(dbContext),
      },
      {
        name: 'history',
        sql: rollbackSql.history,
        target: resolveHistoryTarget(dbContext),
      },
      {
        name: 'current',
        sql: rollbackSql.current,
        target: resolveCurrentTarget(dbContext),
      },
      { name: 'meta', sql: rollbackSql.meta, target: resolveMetaTarget(dbContext) },
    ] as const

    await mkdir(rollbackRoot, { recursive: true })

    for (const artifact of artifacts) {
      await writeFile(resolve(rollbackRoot, `${artifact.name}.sql`), artifact.sql)
    }

    if (!options.dryRun) {
      const importOptions: SqlImportExecutionOptions = {
        accountId: resolveCloudflareAccountId(target),
        apiToken: resolveCloudflareD1ApiToken(),
        isLocal: !target.remote,
      }

      assertRemoteRollbackImportPrerequisites(target, artifacts, importOptions)

      for (const artifact of artifacts) {
        await executeSqlText(artifact.target, artifact.sql, importOptions)
      }
    }

    note(
      [
        formatField('target', describeTarget(target).label),
        formatField('releaseCode', release.releaseCode),
        formatField('releaseId', release.releaseId),
        formatField('previousReleaseId', previousReleaseId ?? '-'),
        formatField('artifacts', rollbackRoot),
        formatField('imported', String(!options.dryRun)),
      ].join('\n'),
      'ROLLBACK RELEASE',
    )
    outro('Harbour rollback complete')
  } finally {
    dbContext.cleanup()
  }
}

async function resolvePreviousPublishedReleaseId(
  metaDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['metaDb'],
  releaseId: string,
) {
  const journalRow =
    (await metaDb
      .select({
        releaseId: metaSchema.metaPublishedDataJournal.releaseId,
      })
      .from(metaSchema.metaPublishedDataJournal)
      .where(
        and(
          eq(metaSchema.metaPublishedDataJournal.relatedReleaseId, releaseId),
          ne(metaSchema.metaPublishedDataJournal.action, 'published'),
        ),
      )
      .orderBy(desc(metaSchema.metaPublishedDataJournal.createdAt))
      .limit(1)
      .get()) ?? null

  if (journalRow?.releaseId) {
    return journalRow.releaseId
  }

  const releaseRow =
    (await metaDb
      .select({
        releaseId: metaSchema.metaReleases.id,
      })
      .from(metaSchema.metaReleases)
      .where(eq(metaSchema.metaReleases.supersededByReleaseId, releaseId))
      .limit(1)
      .get()) ?? null

  return releaseRow?.releaseId ?? null
}

async function assertRollbackPreconditions(
  release: NonNullable<ReleaseRecord>,
  previousRelease: ReleaseRecord,
) {
  if (release.status !== 'published') {
    throw new Error(
      `Rollback only supports published latest releases. ${release.releaseCode} is ${release.status}.`,
    )
  }

  if (previousRelease && previousRelease.datasetId !== release.datasetId) {
    throw new Error(
      `Previous release ${previousRelease.releaseCode} belongs to a different dataset.`,
    )
  }
}

function resolveRollbackShardHints(args: ParsedArgs, releaseSpecifier: string) {
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

function resolveMetaTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.metaBinding,
    databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    name: 'meta',
  }
}

function resolveCurrentTarget(
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): SqlImportTargetContext {
  return {
    binding: dbContext.currentBinding,
    databaseId: dbContext.state.bindings.DB_CURRENT?.databaseId ?? null,
    name: 'current',
  }
}

function resolveHistoryTarget(
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

function resolveSourceTarget(
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

function assertRemoteRollbackImportPrerequisites(
  target: UploadTarget,
  artifacts: ReadonlyArray<{ target: SqlImportTargetContext }>,
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

  for (const artifact of artifacts) {
    if (!artifact.target.databaseId?.trim()) {
      missing.push(`${artifact.target.name}.databaseId`)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Remote rollback import prerequisites missing: ${missing.join(', ')}.`,
    )
  }
}

function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

function resolveCloudflareAccountId(target: UploadTarget) {
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

function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}
