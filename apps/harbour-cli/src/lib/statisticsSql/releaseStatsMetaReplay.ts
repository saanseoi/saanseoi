import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ReleaseStatsRow } from '@repo/db/metaSchema'
import type { MaterialisedReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'

import type { UploadTarget } from '../cli/options.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const SQL_CHUNK_BYTE_LIMIT = 96 * 1024

type MetaContext = {
  state: {
    bindings: {
      DB_META?: { databaseId?: string | null }
    }
  }
}

/**
 * Builds deterministic DB_META statements for facts already materialised in
 * the local target cache. This intentionally replaces only release-owned
 * rows, preserving snapshot, API-release-set, and processing statistics.
 */
export function buildReleaseStatsMetaSqlBatches(
  releaseId: string,
  rows: readonly ReleaseStatsRow[],
) {
  const statements = [
    `DELETE FROM "stats" WHERE "releaseId" = ${sqlValue(releaseId)} AND "type" = 'release';`,
    ...[...rows]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(
        row =>
          'INSERT INTO "stats" ("id", "type", "releaseId", "snapshotId", "apiReleaseSetId", "dimension", "metric", "metricUnit", "value", "groupBy", "groupValue", "createdAt", "updatedAt") VALUES (' +
          [
            row.id,
            row.type,
            row.releaseId,
            row.snapshotId,
            row.apiReleaseSetId,
            row.dimension,
            row.metric,
            row.metricUnit,
            row.value,
            row.groupBy,
            row.groupValue,
            row.createdAt,
            row.updatedAt,
          ]
            .map(sqlValue)
            .join(', ') +
          ');',
      ),
  ]
  return chunkSql(statements)
}

/** Replays local materialised release facts into the selected remote DB_META. */
export async function replayReleaseStatsMetaToRemote(
  target: UploadTarget,
  context: MetaContext,
  releaseId: string,
  rows: readonly ReleaseStatsRow[],
  options: {
    executeSql?: typeof executeSqlText
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  } = {},
) {
  if (!target.remote) return

  const accountId =
    options.importOptions?.accountId ?? resolveCloudflareAccountId(target)
  const apiToken =
    options.importOptions?.apiToken ?? process.env.CLOUDFLARE_D1_TOKEN?.trim()
  const databaseId = context.state.bindings.DB_META?.databaseId
  const missing = [
    !accountId?.trim() && 'CLOUDFLARE_ACCOUNT_ID',
    !apiToken?.trim() && 'CLOUDFLARE_D1_TOKEN',
    !databaseId?.trim() && 'meta.databaseId',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `Release statistics metadata replay requires ${missing.join(', ')}.`,
    )
  }

  const execute = options.executeSql ?? executeSqlText
  const destination: SqlImportTargetContext = {
    databaseId: databaseId ?? null,
    name: 'meta',
  }
  for (const sql of buildReleaseStatsMetaSqlBatches(releaseId, rows)) {
    await execute(destination, sql, { accountId, apiToken, isLocal: false })
  }
}

export function buildReleaseProcessingActionsMetaSqlBatches(
  releaseId: string,
  materialised: MaterialisedReleaseProcessingActions,
) {
  const statements = [
    `DELETE FROM "releaseProcessingActions" WHERE "releaseId" = ${sqlValue(releaseId)};`,
    `DELETE FROM "stats" WHERE "releaseId" = ${sqlValue(releaseId)} AND "type" = 'processing';`,
    ...[...materialised.actions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(
        action =>
          'INSERT INTO "releaseProcessingActions" ("id", "releaseId", "action", "mode", "summary", "affectedRecordCount", "evidence", "createdAt", "updatedAt") VALUES (' +
          [
            action.id,
            action.releaseId,
            action.action,
            action.mode,
            action.summary,
            action.affectedRecordCount,
            JSON.stringify(action.evidence),
            action.createdAt,
            action.updatedAt,
          ]
            .map(sqlValue)
            .join(', ') +
          ');',
      ),
    ...[...materialised.stats]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(insertStatsRow),
  ]
  return chunkSql(statements)
}

export async function replayReleaseProcessingActionsMetaToRemote(
  target: UploadTarget,
  context: MetaContext,
  releaseId: string,
  materialised: MaterialisedReleaseProcessingActions,
  options: {
    executeSql?: typeof executeSqlText
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  } = {},
) {
  if (!target.remote) return
  const accountId =
    options.importOptions?.accountId ?? resolveCloudflareAccountId(target)
  const apiToken =
    options.importOptions?.apiToken ?? process.env.CLOUDFLARE_D1_TOKEN?.trim()
  const databaseId = context.state.bindings.DB_META?.databaseId
  const missing = [
    !accountId?.trim() && 'CLOUDFLARE_ACCOUNT_ID',
    !apiToken?.trim() && 'CLOUDFLARE_D1_TOKEN',
    !databaseId?.trim() && 'meta.databaseId',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `Release processing-action metadata replay requires ${missing.join(', ')}.`,
    )
  }
  const execute = options.executeSql ?? executeSqlText
  const destination: SqlImportTargetContext = {
    databaseId: databaseId ?? null,
    name: 'meta',
  }
  for (const sql of buildReleaseProcessingActionsMetaSqlBatches(
    releaseId,
    materialised,
  )) {
    await execute(destination, sql, { accountId, apiToken, isLocal: false })
  }
}

function insertStatsRow(row: ReleaseStatsRow) {
  return (
    'INSERT INTO "stats" ("id", "type", "releaseId", "snapshotId", "apiReleaseSetId", "dimension", "metric", "metricUnit", "value", "groupBy", "groupValue", "createdAt", "updatedAt") VALUES (' +
    [
      row.id,
      row.type,
      row.releaseId,
      row.snapshotId,
      row.apiReleaseSetId,
      row.dimension,
      row.metric,
      row.metricUnit,
      row.value,
      row.groupBy,
      row.groupValue,
      row.createdAt,
      row.updatedAt,
    ]
      .map(sqlValue)
      .join(', ') +
    ');'
  )
}

function chunkSql(statements: string[]) {
  const chunks: string[] = []
  let chunk = ''
  for (const statement of statements) {
    if (Buffer.byteLength(statement) > SQL_CHUNK_BYTE_LIMIT) {
      throw new Error(
        'A release statistics metadata SQL statement exceeds the D1 limit.',
      )
    }
    if (
      chunk &&
      Buffer.byteLength(chunk) + Buffer.byteLength(statement) + 1 > SQL_CHUNK_BYTE_LIMIT
    ) {
      chunks.push(chunk)
      chunk = statement
    } else {
      chunk = chunk ? `${chunk}\n${statement}` : statement
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

function sqlValue(value: string | number | null) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Release statistics values must be finite.')
    return String(value)
  }
  return `'${value.replaceAll("'", "''")}'`
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const config = JSON.parse(readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')) as {
    env?: Record<string, { account_id?: string }>
  }
  const environment = target.environment === 'production' ? 'production' : 'preview'
  return (
    config.env?.[environment]?.account_id ?? process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  )
}
