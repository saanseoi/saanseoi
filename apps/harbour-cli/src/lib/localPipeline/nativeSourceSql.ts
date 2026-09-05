import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { prepareUpload } from '@repo/core/uploadLocal'
import type { UploadInspection } from '@repo/core'
import { updateDatasetStatus } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'

import {
  invalidateRemoteDbCache,
  resolveLocalAddressDbContext,
  type LocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createLocalControlClient } from './localControlClient.ts'
import { executeSqlText, type SqlImportTargetContext } from './sqlImport.ts'
import { dispatchUpload } from '../upload/upload.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const SQL_CHUNK_BYTE_LIMIT = 1_000_000
const SQL_STATEMENT_BYTE_LIMIT = 96 * 1024

export type NativeSourceRow = Record<string, unknown> & {
  sourceRecordId: string
}

export type NativeSourceTable = {
  /** SQLite source-schema table, never a converted publisher artefact. */
  name: string
  /** Root assertions retain their own provenance; dependent rows inherit it. */
  provenance: 'required' | 'inherited'
  /** The archive is a complete replacement snapshot for this source table. */
  replaceCurrentRows?: boolean
  rows: NativeSourceRow[]
}

export type NativeSourceRelease = {
  archivePath: string
  archiveSha256: string
  archiveObjectKey: string
  cohortKey: string
  datasetCode: string
  releaseNotesUrl: string
  rowCount: number
  source: string
  sourceVersion: string
  tables: NativeSourceTable[]
  theme: 'streets' | 'stats' | 'divisions'
  type: 'street' | 'divisionStatistic' | 'divisionArea' | 'division'
}

/**
 * Registers and imports validated publisher rows without creating a Parquet
 * hand-off. SQL is applied to the local DB cache first, then the same SQL is
 * imported to the selected D1 source shard for preview/production.
 */
export async function processNativeSourceSqlRelease(
  target: UploadTarget,
  input: NativeSourceRelease,
) {
  assertRelease(input)
  const inspection = nativeInspection(input)
  const registerOptions = {
    cohortKey: input.cohortKey,
    datasetCode: input.datasetCode,
    filePath: input.archivePath,
    inspection,
    rawObjectKey: input.archiveObjectKey,
    regionCode: 'hk',
    releaseNotesUrl: input.releaseNotesUrl,
    source: input.source,
    sourceVersion: input.sourceVersion,
    theme: input.theme,
    type: input.type,
  }
  const prepared = await prepareUpload(registerOptions)
  const registered = await dispatchUpload(
    target,
    registerOptions,
    prepared,
    prepared.plan.schemaFingerprint,
    { allowReprocessPublished: true, force: true },
  )
  const releaseId = requireString(registered.releaseId, 'releaseId')
  const releaseCode = requireString(registered.releaseCode, 'releaseCode')
  const shardYear = resolveShardYear(input.cohortKey, input.sourceVersion)
  // Native source tables are not part of the canonical street/division cache
  // profiles. Mirror their source records into the local planning cache.
  const context = await resolveLocalAddressDbContext(target, 'hk', shardYear, {
    cacheTableProfile: 'nativeSource',
  })
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = target.remote
    ? createHarbourControlClient(target)
    : createLocalControlClient(metaDb, {
        publishClient: {
          async publishDataset(id) {
            await updateDatasetStatus(metaDb, id, 'published')
          },
          async stageCompleted() {},
          async stageFailed() {},
          async stageRunning() {},
        },
      })
  let localCacheMutationStarted = false

  try {
    await client.stageRunning(
      releaseId,
      'processDataset',
      {
        archiveObjectKey: input.archiveObjectKey,
        archiveSha256: input.archiveSha256,
        sourceRows: input.rowCount,
      },
      releaseCode,
    )
    const sql = await buildNativeSourceSql(input.tables, releaseId, releaseCode)
    const remoteReplay = target.remote
      ? resolveNativeRemoteReplay(target, context, shardYear)
      : null
    localCacheMutationStarted = true
    await executeSqlChunks(
      { binding: context.sourceBinding, databaseId: null, name: 'source' },
      sql,
      { isLocal: true },
    )

    if (remoteReplay) {
      await executeSqlChunks(remoteReplay.target, sql, {
        accountId: remoteReplay.accountId,
        apiToken: remoteReplay.apiToken,
        isLocal: false,
      })
    }

    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        archiveObjectKey: input.archiveObjectKey,
        archiveSha256: input.archiveSha256,
        importedRows: input.rowCount,
        tables: input.tables.map(table => ({
          name: table.name,
          rows: table.rows.length,
        })),
      },
      releaseCode,
    )
    return await client.publishDataset(releaseId, releaseCode)
  } catch (error) {
    if (target.remote && localCacheMutationStarted) {
      await invalidateRemoteDbCache(
        target.environment === 'production' ? 'production' : 'preview',
        context.state.dbCacheDir,
        error instanceof Error ? error.message : String(error),
      ).catch(() => undefined)
    }
    await client
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    context.cleanup()
  }
}

function resolveNativeRemoteReplay(
  target: UploadTarget,
  context: Pick<LocalAddressDbContext, 'sourceTargets'>,
  shardYear: string,
) {
  const sourceTarget = context.sourceTargets.find(item => item.year === shardYear)
  const remoteTarget: SqlImportTargetContext = {
    databaseId: sourceTarget?.databaseId ?? null,
    name: 'source',
  }
  const accountId = resolveCloudflareAccountId(target)
  const apiToken = process.env.CLOUDFLARE_D1_TOKEN?.trim()
  if (!remoteTarget.databaseId || !accountId || !apiToken) {
    throw new Error(
      'Native source D1 import requires source.databaseId, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_D1_TOKEN.',
    )
  }
  return { accountId, apiToken, target: remoteTarget }
}

export async function versionNativeSourceRows(
  rows: NativeSourceRow[],
  releaseId: string,
  releaseCode: string,
) {
  const now = new Date().toISOString()
  return Promise.all(
    rows.map(async row => {
      const payload = { ...row }
      return {
        ...payload,
        createdAt: now,
        isCurrent: true,
        releaseId,
        updatedAt: now,
        validFromRelease: releaseCode,
        validToRelease: null,
        versionHash: await createHash(payload),
      }
    }),
  )
}

async function buildNativeSourceSql(
  tables: NativeSourceTable[],
  releaseId: string,
  releaseCode: string,
) {
  const statements: string[] = []
  for (const table of tables) {
    assertIdentifier(table.name, 'table')
    const rows = await versionNativeSourceRows(table.rows, releaseId, releaseCode)
    const ids = [...new Set(rows.map(row => row.sourceRecordId))]
    const currentRowScopes = table.replaceCurrentRows ? [[]] : chunk(ids, 250)
    for (const idsChunk of currentRowScopes) {
      const idCondition = table.replaceCurrentRows
        ? ''
        : ` AND "sourceRecordId" IN (${idsChunk.map(sqlValue).join(', ')})`
      statements.push(
        `UPDATE "${table.name}" SET "isCurrent" = 0, "validToRelease" = ${sqlValue(releaseCode)}, "updatedAt" = ${sqlValue(new Date().toISOString())} WHERE "isCurrent" = 1${idCondition};`,
      )
    }
    for (const row of rows) {
      const columns = Object.keys(row)
      columns.forEach(column => {
        assertIdentifier(column, 'column')
      })
      statements.push(
        `INSERT INTO "${table.name}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(column => sqlValue((row as Record<string, unknown>)[column])).join(', ')});`,
      )
    }
  }
  return chunkSql(statements)
}

async function executeSqlChunks(
  target: SqlImportTargetContext,
  chunks: string[],
  options: { accountId?: string; apiToken?: string; isLocal: boolean },
) {
  for (const sql of chunks) await executeSqlText(target, sql, options)
}

function nativeInspection(input: NativeSourceRelease): UploadInspection {
  const fields = new Map<string, { name: string; nullable: boolean; type: string }>()
  for (const table of input.tables) {
    for (const row of table.rows) {
      for (const [name, value] of Object.entries(row)) {
        const current = fields.get(name)
        fields.set(name, {
          name,
          nullable: current?.nullable || value === null,
          type: current?.type ?? nativeType(value),
        })
      }
    }
  }
  return {
    distinctCountryValues: [],
    distinctRegionValues: ['hk'],
    distinctThemeValues: [input.theme],
    distinctTypeValues: [input.type],
    rowCount: input.rowCount,
    schema: [...fields.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  }
}

function nativeType(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value) || typeof value === 'object') return 'json'
  return typeof value
}

function assertRelease(input: NativeSourceRelease) {
  if (!/^[a-f0-9]{64}$/i.test(input.archiveSha256)) {
    throw new Error('Native source release requires a SHA-256 archive hash.')
  }
  if (!input.tables.length || input.tables.some(table => table.rows.length === 0)) {
    throw new Error(
      'Native source release requires at least one non-empty source table.',
    )
  }
  for (const table of input.tables) {
    if (table.provenance !== 'required') continue
    if (table.rows.some(row => !hasSourceReferences(row.sources))) {
      throw new Error(
        `Source record table ${table.name} requires a non-empty sources array with a dataset on every reference.`,
      )
    }
  }
  const actualRowCount = input.tables
    .filter(table => !table.name.endsWith('I18n'))
    .reduce((total, table) => total + table.rows.length, 0)
  if (actualRowCount !== input.rowCount) {
    throw new Error(
      `Native source row count mismatch: expected ${input.rowCount}, found ${actualRowCount}.`,
    )
  }
}

function hasSourceReferences(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(hasSourceReference)
}

function hasSourceReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const dataset = (value as Record<string, unknown>).dataset
  return typeof dataset === 'string' && dataset.trim().length > 0
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot import a non-finite number.')
    return String(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replaceAll("'", "''")}'`
}

function assertIdentifier(value: string, label: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Unsafe ${label} identifier: ${value}.`)
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function chunkSql(statements: string[]) {
  const chunks: string[] = []
  let current = ''
  for (const statement of statements) {
    if (Buffer.byteLength(statement) > SQL_STATEMENT_BYTE_LIMIT) {
      throw new Error('A native source SQL statement exceeds the D1 limit.')
    }
    if (
      current &&
      Buffer.byteLength(current) + Buffer.byteLength(statement) + 1 >
        SQL_CHUNK_BYTE_LIMIT
    ) {
      chunks.push(current)
      current = ''
    }
    current += `${statement}\n`
  }
  if (current) chunks.push(current)
  return chunks
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const candidate = cohortKey.slice(0, 4)
  const fallback = sourceVersion.slice(0, 4)
  const year = /^\d{4}$/.test(candidate) ? candidate : fallback
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`Could not resolve a source shard year from ${sourceVersion}.`)
  }
  return year
}

function resolveCloudflareAccountId(target: UploadTarget) {
  const fromEnvironment = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (fromEnvironment) return fromEnvironment
  const config = JSON.parse(readFileSync(HARBOUR_WORKERS_WRANGLER_PATH, 'utf8')) as {
    env?: Record<string, { vars?: Record<string, unknown> }>
    vars?: Record<string, unknown>
  }
  const variables =
    target.environment === 'production'
      ? config.env?.production?.vars
      : target.environment === 'preview'
        ? config.env?.preview?.vars
        : config.vars
  const accountId = variables?.CLOUDFLARE_ACCOUNT_ID
  return typeof accountId === 'string' && accountId.trim()
    ? accountId.trim()
    : undefined
}

function requireString(value: string | undefined, label: string) {
  if (!value?.trim()) throw new Error(`Missing ${label} from release registration.`)
  return value
}
