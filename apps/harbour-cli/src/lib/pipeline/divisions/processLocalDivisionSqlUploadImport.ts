import { readFileSync } from 'node:fs'
import type { DatasetProcessingMessage } from '@repo/core'
import { resolveShardForTypeRegionYear } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { MetaDatabase } from '@repo/db'
import { buildSourceReleaseId } from '@repo/core/pipeline/db/source'
import {
  buildSqlPipelineArtefactKey,
  writeTextArtefact,
} from '@repo/core/pipeline/services/pipelineArtefacts'
import type { UploadTarget } from '../../cli/options.ts'
import { resolvePipelineEnvironment } from '../../cli/options.ts'
import {
  executeSqlText,
  importSqlArtefactKeys,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../local/sqlImport.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import {
  invalidateRemoteDbCache,
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
  type resolveLocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import type {
  DivisionSqlArtefactManifest,
  DivisionSqlImportFile,
  DivisionSqlState,
  ExtraSqlImportOperation,
} from './processLocalDivisionSqlUploadTypes.ts'
import {
  HARBOUR_WORKERS_WRANGLER_PATH,
  PRIMARY_HISTORY_OWNER_KEY,
  PRIMARY_SOURCE_OWNER_KEY,
} from './processLocalDivisionSqlUploadConfig.ts'
import {
  buildAdvanceSourceReleaseStatements,
  buildCloseHistoryVersionStatements,
  buildCloseSourceVersionStatements,
} from './processLocalDivisionSqlUploadRows.ts'

export async function runDivisionSqlImportOperations(
  operations: ReadonlyArray<() => Promise<unknown>>,
  serial: boolean,
) {
  if (serial) {
    for (const operation of operations) await operation()
    return
  }

  await Promise.all(operations.map(operation => operation()))
}

export async function replayDivisionSqlIntoRemoteCache(
  target: UploadTarget,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  bucket: LocalPipelineBucket,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
  manifest: DivisionSqlArtefactManifest,
  extraSourceSqlOperations: ExtraSqlImportOperation[],
  extraHistorySqlOperations: ExtraSqlImportOperation[],
  importOptions: SqlImportExecutionOptions,
  releaseCode: string,
) {
  const targetName = target.environment === 'production' ? 'production' : 'preview'
  const cacheImportOptions: SqlImportExecutionOptions = {
    ...importOptions,
    accountId: undefined,
    apiToken: undefined,
    isLocal: true,
  }

  try {
    await replayRemoteCacheWithRetry(
      targetName,
      dbContext.state.dbCacheDir,
      releaseCode,
      async () => {
        await Promise.all([
          importSqlArtefactKeys(
            bucket,
            importTargets.source,
            [manifest.sourceKey],
            cacheImportOptions,
            async () => undefined,
          ).then(async () => {
            for (const operation of extraSourceSqlOperations) {
              await executeSqlText(operation.target, operation.sql, cacheImportOptions)
            }
          }),
          importSqlArtefactKeys(
            bucket,
            importTargets.history,
            [manifest.historyKey],
            cacheImportOptions,
            async () => undefined,
          ).then(async () => {
            for (const operation of extraHistorySqlOperations) {
              await executeSqlText(operation.target, operation.sql, cacheImportOptions)
            }
          }),
          (async () => {
            if (manifest.currentInitKey) {
              await importSqlArtefactKeys(
                bucket,
                importTargets.current,
                [manifest.currentInitKey],
                cacheImportOptions,
                async () => undefined,
              )
            }

            await importSqlArtefactKeys(
              bucket,
              importTargets.current,
              [manifest.currentKey],
              cacheImportOptions,
              async () => undefined,
            )
          })(),
        ])
      },
    )

    return true
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Remote upload succeeded, but updating the ${targetName} local cache failed. ${reason}`,
    )
  }
}

export async function refreshRemoteMetaCacheAfterReplay(
  targetName: 'preview' | 'production',
  cacheDir: string,
) {
  try {
    await refreshRemoteMetaCache(targetName, cacheDir)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    await invalidateRemoteDbCache(targetName, cacheDir, reason)
    throw new Error(
      `Remote upload succeeded, but refreshing the ${targetName} local meta cache failed. The cache was invalidated and future uploads will stop until it is rebuilt explicitly. ${reason}`,
    )
  }
}

export function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

export function buildExtraHistorySqlOperations(
  state: DivisionSqlState,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
) {
  const changedExistingIds = state.records
    .filter(record => record.currentChanged && record.currentExists)
    .map(record => record.id)
  const missingIds = [...state.currentRows.keys()].filter(id => !state.seenIds.has(id))
  const changedIdsByOwner = groupIdsByOwnerShard(
    state.currentRows,
    changedExistingIds,
    PRIMARY_HISTORY_OWNER_KEY,
  )
  const missingIdsByOwner = groupIdsByOwnerShard(
    state.currentRows,
    missingIds,
    PRIMARY_HISTORY_OWNER_KEY,
  )
  const now = new Date().toISOString()
  const operations: ExtraSqlImportOperation[] = []

  for (const [ownerKey, target] of importTargets.historyByOwnerKey) {
    if (ownerKey === PRIMARY_HISTORY_OWNER_KEY) {
      continue
    }

    const statements = [
      ...buildCloseHistoryVersionStatements(changedIdsByOwner.get(ownerKey) ?? [], now),
      ...buildCloseHistoryVersionStatements(missingIdsByOwner.get(ownerKey) ?? [], now),
    ]

    if (statements.length === 0) {
      continue
    }

    operations.push({
      sql: `${statements.join('\n\n')}\n`,
      target,
    })
  }

  return operations
}

export function buildExtraSourceSqlOperations(
  message: DatasetProcessingMessage,
  state: DivisionSqlState,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
) {
  const changedIds = state.records
    .filter(record => !record.isSupplemental && record.sourceChanged)
    .map(record => record.id)
  const unchangedIds = state.records
    .filter(
      record =>
        !record.isSupplemental &&
        !record.sourceChanged &&
        state.currentSourceRows.has(record.id),
    )
    .map(record => record.id)
  const publisherIds = new Set(
    state.records.filter(record => !record.isSupplemental).map(record => record.id),
  )
  const missingIds = [...state.currentSourceRows.keys()].filter(
    id => !publisherIds.has(id),
  )
  const changedIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    changedIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const unchangedIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    unchangedIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const missingIdsByOwner = groupIdsByOwnerShard(
    state.currentSourceRows,
    missingIds,
    PRIMARY_SOURCE_OWNER_KEY,
  )
  const releaseId = buildSourceReleaseId(message)
  const now = new Date().toISOString()
  const operations: ExtraSqlImportOperation[] = []

  for (const [ownerKey, target] of importTargets.sourceByOwnerKey) {
    if (ownerKey === PRIMARY_SOURCE_OWNER_KEY) {
      continue
    }

    const statements = [
      ...buildCloseSourceVersionStatements(
        changedIdsByOwner.get(ownerKey) ?? [],
        message.sourceVersion,
        now,
      ),
      ...buildAdvanceSourceReleaseStatements(
        unchangedIdsByOwner.get(ownerKey) ?? [],
        releaseId,
        now,
      ),
      ...buildCloseSourceVersionStatements(
        missingIdsByOwner.get(ownerKey) ?? [],
        message.sourceVersion,
        now,
      ),
    ]

    if (statements.length === 0) {
      continue
    }

    operations.push({
      sql: `${statements.join('\n\n')}\n`,
      target,
    })
  }

  return operations
}

export async function writeDivisionSqlArtefacts(
  bucket: LocalPipelineBucket,
  message: DatasetProcessingMessage,
  files: {
    current: DivisionSqlImportFile
    currentInit: DivisionSqlImportFile | null
    history: DivisionSqlImportFile
    meta: DivisionSqlImportFile
    source: DivisionSqlImportFile
  },
): Promise<DivisionSqlArtefactManifest> {
  const manifest: DivisionSqlArtefactManifest = {
    currentInitKey: null,
    currentKey: buildSqlPipelineArtefactKey(message, 'current', files.current.filename),
    historyKey: buildSqlPipelineArtefactKey(message, 'history', files.history.filename),
    metaKey: buildSqlPipelineArtefactKey(message, 'meta', files.meta.filename),
    sourceKey: buildSqlPipelineArtefactKey(message, 'source', files.source.filename),
  }

  await writeTextArtefact(
    bucket,
    manifest.sourceKey,
    files.source.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.historyKey,
    files.history.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.currentKey,
    files.current.sql,
    'application/sql; charset=utf-8',
  )
  await writeTextArtefact(
    bucket,
    manifest.metaKey,
    files.meta.sql,
    'application/sql; charset=utf-8',
  )

  if (files.currentInit) {
    manifest.currentInitKey = buildSqlPipelineArtefactKey(
      message,
      'current',
      files.currentInit.filename,
    )
    await writeTextArtefact(
      bucket,
      manifest.currentInitKey,
      files.currentInit.sql,
      'application/sql; charset=utf-8',
    )
  }

  return manifest
}

export async function resolveDivisionImportTargets(
  metaDb: MetaDatabase,
  dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  message: DatasetProcessingMessage,
  environment: 'preview' | 'production',
) {
  const metaRepoDb = metaDb as unknown as HarbourReadableDb
  const shardYear = resolveShardYear(message.cohortKey, message.sourceVersion)
  const [currentShard, historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(metaRepoDb, 'current', environment),
    resolveShardForTypeRegionYear(
      metaRepoDb,
      'history',
      environment,
      message.regionCode,
      shardYear,
    ),
    resolveShardForTypeRegionYear(
      metaRepoDb,
      'source',
      environment,
      message.regionCode,
      shardYear,
    ),
  ])

  return {
    current: {
      binding: dbContext.currentBinding,
      databaseId: currentShard?.databaseId ?? null,
      name: 'current',
    } satisfies SqlImportTargetContext,
    history: {
      binding: dbContext.historyBinding,
      databaseId: historyShard?.databaseId ?? null,
      name: 'history',
    } satisfies SqlImportTargetContext,
    meta: {
      binding: dbContext.metaBinding,
      databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    } satisfies SqlImportTargetContext,
    source: {
      binding: dbContext.sourceBinding,
      databaseId: sourceShard?.databaseId ?? null,
      name: 'source',
    } satisfies SqlImportTargetContext,
    historyByOwnerKey: new Map(
      dbContext.historyTargets.map(target => [
        buildHistoryOwnerKey(message.regionCode, shardYear, target.bindingName),
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'history',
        } satisfies SqlImportTargetContext,
      ]),
    ),
    sourceByOwnerKey: new Map(
      dbContext.sourceTargets.map(target => [
        buildSourceOwnerKey(message.regionCode, shardYear, target.bindingName),
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'source',
        } satisfies SqlImportTargetContext,
      ]),
    ),
  }
}

function collectOwnerShardKeys(
  ownerShardKeys: string[] | undefined,
  fallbackKey: string,
) {
  return ownerShardKeys && ownerShardKeys.length > 0 ? ownerShardKeys : [fallbackKey]
}

export function groupIdsByOwnerShard<
  TRow extends {
    ownerShardKeys?: string[]
  },
>(rows: Map<string, TRow>, ids: Iterable<string>, fallbackKey: string) {
  const idsByOwnerKey = new Map<string, string[]>()

  for (const id of ids) {
    const row = rows.get(id)

    if (!row) {
      continue
    }

    for (const ownerKey of collectOwnerShardKeys(row.ownerShardKeys, fallbackKey)) {
      const ownerIds = idsByOwnerKey.get(ownerKey) ?? []
      ownerIds.push(id)
      idsByOwnerKey.set(ownerKey, ownerIds)
    }
  }

  return idsByOwnerKey
}

export function buildHistoryOwnerKey(
  regionCode: string,
  shardYear: string,
  bindingName: string,
) {
  return bindingName ===
    `DB_HISTORY_${regionCode.toUpperCase()}_${resolveShardScope(shardYear)}`
    ? PRIMARY_HISTORY_OWNER_KEY
    : `history-${bindingName.slice(bindingName.lastIndexOf('_') + 1)}`
}

export function buildSourceOwnerKey(
  regionCode: string,
  shardYear: string,
  bindingName: string,
) {
  return bindingName ===
    `DB_SOURCE_${regionCode.toUpperCase()}_${resolveShardScope(shardYear)}`
    ? PRIMARY_SOURCE_OWNER_KEY
    : `source-${bindingName.slice(bindingName.lastIndexOf('_') + 1)}`
}

function resolveShardScope(shardYear: string) {
  const year = Number.parseInt(shardYear, 10)

  return Number.isInteger(year) && year < 2025 ? 'BEFORE' : shardYear
}

export function buildDivisionSqlRunId(message: DatasetProcessingMessage) {
  const releaseId = message.releaseId ?? message.datasetId
  const shard = message.shardYear ?? message.sourceVersion.slice(0, 4)

  return [
    'division',
    message.source,
    message.regionCode,
    shard,
    releaseId,
    message.sourceVersion,
  ]
    .join('-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
}

export function buildSqlImportFile(
  target: DivisionSqlImportFile['target'],
  filename: string,
  statements: string[],
) {
  const sql = `${statements.filter(Boolean).join('\n\n')}\n`

  return {
    bytes: new TextEncoder().encode(sql).byteLength,
    filename,
    sql,
    statementCount: statements.reduce(
      (count, statement) => count + statement.split(';').filter(Boolean).length,
      0,
    ),
    target,
  } satisfies DivisionSqlImportFile
}

export function requireString(value: string | undefined, label: string) {
  if (!value?.trim()) {
    throw new Error(`Missing ${label} for local SQL processing.`)
  }

  return value
}

export function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const cohortYear = cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  const sourceYear = sourceVersion.slice(0, 4)

  if (/^\d{4}$/.test(sourceYear)) {
    return sourceYear
  }

  throw new Error(
    `Could not resolve shard year from cohortKey=${cohortKey} and sourceVersion=${sourceVersion}.`,
  )
}

export function resolveTargetName(target: UploadTarget) {
  if (!target.remote) {
    return 'local'
  }

  return target.environment === 'production' ? 'production' : 'preview'
}

export function resolveImportEnvironment(
  target: UploadTarget,
): 'preview' | 'production' {
  return resolvePipelineEnvironment(target)
}

export function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

  if (fromEnv) {
    return fromEnv
  }

  const rawConfig = readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')
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

  if (typeof accountId === 'string' && accountId.trim()) {
    return accountId.trim()
  }

  return undefined
}

export function resolveCloudflareD1ApiToken() {
  const token = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  return token || undefined
}

export function assertRemoteDivisionImportPrerequisites(
  target: UploadTarget,
  importTargets: Awaited<ReturnType<typeof resolveDivisionImportTargets>>,
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

  const targets = [
    importTargets.current,
    importTargets.history,
    importTargets.meta,
    importTargets.source,
  ]

  for (const targetContext of targets) {
    if (!targetContext.databaseId?.trim()) {
      missing.push(`${targetContext.name}.databaseId`)
    }
  }

  if (missing.length === 0) {
    return
  }

  throw new Error(
    [
      `Remote SQL import prerequisites are incomplete for ${resolveTargetName(target)}.`,
      `Missing: ${missing.join(', ')}.`,
      'Define CLOUDFLARE_D1_TOKEN in your shell or repo .env before running preview/production SQL uploads.',
    ].join(' '),
  )
}
