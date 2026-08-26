import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'

import type { ReleaseStatsRow } from '@repo/db/metaSchema'
import { metaSchema } from '@repo/db'
import type { MaterialisedReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

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

type StatisticSnapshotMeta = {
  lineages: Array<Record<string, unknown>>
  releaseAssignments: Array<Record<string, unknown>>
  snapshotAssignments: Array<Record<string, unknown>>
  snapshots: Array<Record<string, unknown>>
  sources: Array<Record<string, unknown>>
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

/** Replays locally materialised statistic snapshots to DB_META before publish. */
export async function replayStatisticSnapshotMetaToRemote(
  target: UploadTarget,
  context: MetaContext,
  metaDb: HarbourReadableDb & HarbourWritableDb,
  releaseId: string,
  snapshotIds: readonly string[],
  options: {
    executeSql?: typeof executeSqlText
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  } = {},
) {
  if (!target.remote) return

  const uniqueSnapshotIds = [...new Set(snapshotIds)].sort()
  const snapshots = (
    await Promise.all(
      uniqueSnapshotIds.map(snapshotId =>
        metaDb
          .select()
          .from(metaSchema.metaSnapshots)
          .where(eq(metaSchema.metaSnapshots.id, snapshotId))
          .all(),
      ),
    )
  ).flat()
  if (snapshots.length !== uniqueSnapshotIds.length) {
    throw new Error(`Statistic snapshot metadata is incomplete for ${releaseId}.`)
  }

  const snapshotLineageIds = [
    ...new Set(
      snapshots
        .map(snapshot => snapshot.snapshotLineageId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  const [sources, snapshotAssignments, lineages, releaseAssignments] =
    await Promise.all([
      Promise.all(
        uniqueSnapshotIds.map(snapshotId =>
          metaDb
            .select()
            .from(metaSchema.metaSnapshotSources)
            .where(eq(metaSchema.metaSnapshotSources.snapshotId, snapshotId))
            .all(),
        ),
      ).then(rows => rows.flat()),
      Promise.all(
        uniqueSnapshotIds.map(snapshotId =>
          metaDb
            .select()
            .from(metaSchema.metaSnapshotShardAssignments)
            .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
            .all(),
        ),
      ).then(rows => rows.flat()),
      Promise.all(
        snapshotLineageIds.map(lineageId =>
          metaDb
            .select()
            .from(metaSchema.metaSnapshotLineages)
            .where(eq(metaSchema.metaSnapshotLineages.id, lineageId))
            .all(),
        ),
      ).then(rows => rows.flat()),
      metaDb
        .select()
        .from(metaSchema.metaReleaseShardAssignments)
        .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, releaseId))
        .all(),
    ])
  if (
    !sources.some(source => source.sourceReleaseId === releaseId) ||
    snapshotAssignments.length < uniqueSnapshotIds.length ||
    releaseAssignments.length === 0 ||
    lineages.length !== snapshotLineageIds.length
  ) {
    throw new Error(`Statistic snapshot metadata is incomplete for ${releaseId}.`)
  }

  await replayMetaSql(
    target,
    context,
    buildStatisticSnapshotMetaSqlBatches({
      lineages,
      releaseAssignments,
      snapshotAssignments,
      snapshots,
      sources,
    }),
    options,
  )
}

export function buildStatisticSnapshotMetaSqlBatches(metadata: StatisticSnapshotMeta) {
  return chunkSql([
    ...buildMetaInsertStatements(
      'snapshotLineages',
      [
        'id',
        'code',
        'regionCode',
        'resourceType',
        'variant',
        'identityMode',
        'primaryDatasetId',
        'versionHash',
        'createdAt',
        'updatedAt',
      ],
      metadata.lineages,
      ['id'],
    ),
    ...buildMetaInsertStatements(
      'snapshots',
      [
        'id',
        'snapshotLineageId',
        'parentSnapshotId',
        'resourceType',
        'code',
        'cohortKey',
        'revision',
        'status',
        'publishedAt',
        'validFrom',
        'validTo',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      metadata.snapshots,
      ['id'],
    ),
    ...buildMetaInsertStatements(
      'snapshotSources',
      [
        'snapshotId',
        'datasetId',
        'sourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      metadata.sources,
      ['snapshotId', 'sourceReleaseId'],
    ),
    ...buildMetaInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      metadata.releaseAssignments,
      [],
    ),
    ...buildMetaInsertStatements(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      metadata.snapshotAssignments,
      [],
    ),
  ])
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

async function replayMetaSql(
  target: UploadTarget,
  context: MetaContext,
  batches: readonly string[],
  options: {
    executeSql?: typeof executeSqlText
    importOptions?: Pick<SqlImportExecutionOptions, 'accountId' | 'apiToken'>
  },
) {
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
      `Statistic snapshot metadata replay requires ${missing.join(', ')}.`,
    )
  }
  const execute = options.executeSql ?? executeSqlText
  const destination: SqlImportTargetContext = {
    databaseId: databaseId ?? null,
    name: 'meta',
  }
  for (const sql of batches) {
    await execute(destination, sql, { accountId, apiToken, isLocal: false })
  }
}

function buildMetaInsertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  conflictColumns: readonly string[],
) {
  const suffix = conflictColumns.length
    ? ` ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${columns
        .filter(column => !conflictColumns.includes(column))
        .map(column => `${column} = excluded.${column}`)
        .join(', ')}`
    : ` ON CONFLICT (${columns.join(', ')}) DO NOTHING`
  return [...rows]
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    .map(
      row =>
        `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns
          .map(column => sqlAnyValue(row[column]))
          .join(', ')})${suffix};`,
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

function sqlAnyValue(value: unknown) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Metadata values must be finite.')
    return String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
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
