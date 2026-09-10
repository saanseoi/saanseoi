import { readFileSync } from 'node:fs'
import { nativeSourcePayloadHashInput } from '@repo/core/pipeline/services/sourcePayload'
import { resolve } from 'node:path'

import { prepareUpload } from '@repo/core/uploadLocal'
import type { UploadInspection } from '@repo/core'
import type { ProvenanceStore, RuleDeclaration } from '@repo/core/provenance'
import {
  buildSourceReleaseCode,
  getDatasetById,
  updateDatasetStatus,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'
import { prepareDivisionVersionInsertContext } from '@repo/core/pipeline/db/division'
import { readSnapshotAssemblySql } from '@repo/core/pipeline/db/snapshotAssembly'
import type { DatasetProcessingMessage } from '@repo/core'
import { eq, metaSchema } from '@repo/db'
import type { MetaDatabase } from '@repo/db'

import {
  invalidateRemoteDbCache,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  type LocalAddressDbContext,
} from '../../dbCache/localDbCache.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { deliverProducerAudit } from '../../api/producerAuditDelivery.ts'
import { retainProducerAudit } from '../../api/producerAudit.ts'
import { landsdSettlementSelectionAudit } from '../../sources/hkgov/landsd/settlementSelection'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { createLocalControlClient } from './localControlClient.ts'
import { executeSqlText, type SqlImportTargetContext } from './sqlImport.ts'
import { dispatchUpload } from '../../upload/upload.ts'
import { syncStagedReleaseIntoLocalMetaCache } from './syncStagedRelease.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
const HARBOUR_WORKERS_WRANGLER_PATH = resolve(
  REPO_ROOT,
  'apps/harbour-workers/wrangler.jsonc',
)
const SQL_CHUNK_BYTE_LIMIT = 1_000_000
const SQL_STATEMENT_BYTE_LIMIT = 96 * 1024
const RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')

/** The native source ledger is an audited import, even when no curation runs. */
export const nativeSourceImportRule: RuleDeclaration = {
  kind: 'processing-rule',
  schemaVersion: 1,
  id: 'saanseoi.native-source-import.v1',
  scope: 'bulk',
  basis: 'code',
  summary: 'Import validated publisher assertions into the native source ledger.',
  inputs: ['publisher-records'],
  outputs: ['native-source-records'],
  parameters: { sqlChunkByteLimit: SQL_CHUNK_BYTE_LIMIT },
  implementation: {
    path: 'apps/harbour-cli/src/lib/pipeline/local/nativeSourceSql.ts',
    symbol: 'nativeSourceImportRule',
  },
}

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
  /** Restore the native source ledger for a published converted release. */
  recoverPublishedRelease?: boolean
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
  const registered = await resolveNativeSourceRelease(target, input, registerOptions)
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
  let published = false
  let publishResult: unknown

  try {
    localCacheMutationStarted = true
    await syncStagedReleaseIntoLocalMetaCache(
      metaDb as unknown as MetaDatabase,
      {
        datasetCode: input.datasetCode,
        releaseCode,
        releaseId,
        rawObjectKey: input.archiveObjectKey,
      },
      {
        cohortKey: input.cohortKey,
        regionCode: 'hk',
        source: input.source,
        sourceVersion: input.sourceVersion,
        theme: input.theme,
        type: input.type,
      },
    )
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
    const nativeMetaSql = await prepareNativeDivisionMetaSql(
      metaDb,
      input,
      releaseId,
      releaseCode,
      resolvePipelineEnvironment(target),
    )
    const remoteMetaReplay = target.remote
      ? resolveNativeMetaReplay(target, context)
      : null
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

    if (remoteMetaReplay) {
      await executeSqlChunks(remoteMetaReplay.target, nativeMetaSql, {
        accountId: remoteMetaReplay.accountId,
        apiToken: remoteMetaReplay.apiToken,
        isLocal: false,
      })
    }

    await retainNativeSourceAudit(target, {
      archiveSha256: input.archiveSha256,
      datasetCode: input.datasetCode,
      releaseCode,
      releaseId,
      rowCount: input.rowCount,
      sourceVersion: input.sourceVersion,
      tables: input.tables,
    })

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
    publishResult = await client.publishDataset(releaseId, releaseCode)
    published = true
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

  if (published && target.remote) {
    await refreshRemoteMetaCache(
      target.environment === 'production' ? 'production' : 'preview',
      context.state.dbCacheDir,
    )
  }

  return publishResult
}

async function prepareNativeDivisionMetaSql(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  input: NativeSourceRelease,
  releaseId: string,
  releaseCode: string,
  environment: 'preview' | 'production',
) {
  const message: DatasetProcessingMessage = {
    datasetId: releaseId,
    datasetCode: input.datasetCode,
    releaseId,
    releaseCode,
    rawObjectKey: input.archiveObjectKey,
    regionCode: 'hk',
    cohortKey: input.cohortKey,
    source: input.source,
    sourceVersion: input.sourceVersion,
    theme: input.theme,
    type: 'division',
  }
  const prepared = await prepareDivisionVersionInsertContext(
    metaDb,
    message,
    environment,
  )
  const snapshot = await metaDb
    .select()
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, prepared.snapshotId))
    .limit(1)
    .get()
  if (!snapshot)
    throw new Error(`Native division snapshot is missing: ${prepared.snapshotId}.`)

  if (!snapshot.snapshotLineageId) {
    throw new Error(
      `Native division snapshot lineage is missing: ${prepared.snapshotId}.`,
    )
  }
  const snapshotLineageId = String(snapshot.snapshotLineageId)
  const [lineages, sources, releaseAssignments, snapshotAssignments] =
    await Promise.all([
      metaDb
        .select()
        .from(metaSchema.metaSnapshotLineages)
        .where(eq(metaSchema.metaSnapshotLineages.id, snapshotLineageId))
        .all(),
      metaDb
        .select()
        .from(metaSchema.metaSnapshotSources)
        .where(eq(metaSchema.metaSnapshotSources.snapshotId, prepared.snapshotId))
        .all(),
      metaDb
        .select()
        .from(metaSchema.metaReleaseShardAssignments)
        .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, releaseId))
        .all(),
      metaDb
        .select()
        .from(metaSchema.metaSnapshotShardAssignments)
        .where(
          eq(metaSchema.metaSnapshotShardAssignments.snapshotId, prepared.snapshotId),
        )
        .all(),
    ])
  if (
    lineages.length !== 1 ||
    !sources.some(row => row.resourceReleaseId === releaseId) ||
    releaseAssignments.length === 0 ||
    snapshotAssignments.length === 0
  ) {
    throw new Error(`Native division snapshot metadata is incomplete for ${releaseId}.`)
  }

  const assemblySql = await readSnapshotAssemblySql(metaDb, prepared.snapshotId, true)
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
      lineages,
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
        'geometryStatus',
        'revision',
        'status',
        'publishedAt',
        'validFrom',
        'validTo',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      [snapshot],
      ['id'],
    ),
    ...buildMetaInsertStatements(
      'snapshotSources',
      [
        'snapshotId',
        'datasetId',
        'resourceReleaseId',
        'role',
        'selectedByRule',
        'selectionMode',
        'anchorReleaseId',
        'sourceCohortKey',
        'createdAt',
      ],
      sources,
      ['snapshotId', 'resourceReleaseId'],
    ),
    ...assemblySql,
    ...buildMetaInsertStatements(
      'releaseShardAssignments',
      ['releaseId', 'dataShardId'],
      releaseAssignments,
      [],
    ),
    ...buildMetaInsertStatements(
      'snapshotShardAssignments',
      ['snapshotId', 'dataShardId'],
      snapshotAssignments,
      [],
    ),
  ])
}

function buildMetaInsertStatements(
  table: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
  conflictColumns: readonly string[],
) {
  if (rows.length === 0) return []
  const suffix = conflictColumns.length
    ? ` ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(', ')}) DO UPDATE SET ${columns
        .filter(column => !conflictColumns.includes(column))
        .map(
          column => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`,
        )
        .join(', ')}`
    : ' ON CONFLICT DO NOTHING'
  return rows.map(
    row =>
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(column => sqlValue(row[column])).join(', ')})${suffix};`,
  )
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

async function retainNativeSourceAudit(
  target: UploadTarget,
  input: {
    archiveSha256: string
    datasetCode: string
    releaseCode: string
    releaseId: string
    rowCount: number
    sourceVersion: string
    tables: NativeSourceTable[]
  },
) {
  const selectionRules =
    input.datasetCode === 'ds-hk-hkgov-landsd-division'
      ? [
          landsdSettlementSelectionAudit(
            input.tables.flatMap(table =>
              table.name === 'hkgovLandsdPlaceNames'
                ? table.rows.map(row => {
                    if (
                      !row.rawProperties ||
                      typeof row.rawProperties !== 'object' ||
                      Array.isArray(row.rawProperties)
                    )
                      throw new Error(
                        'LandsD selection audit requires native publisher properties.',
                      )
                    return row.rawProperties as Record<string, unknown>
                  })
                : [],
            ),
          ),
        ]
      : []
  const directory = resolve(
    RELEASE_ROOT,
    target.remote ? 'remote' : 'local',
    input.releaseCode,
    'provenance-native-source',
  )
  await deliverProducerAudit({
    target,
    directory,
    identity: JSON.stringify({
      archiveSha256: input.archiveSha256,
      datasetCode: input.datasetCode,
      rowCount: input.rowCount,
      sourceVersion: input.sourceVersion,
      ...(selectionRules.length ? { selectionRules } : {}),
      tables: input.tables.map(table => ({
        name: table.name,
        rows: table.rows.length,
      })),
    }),
    retain: (store: ProvenanceStore) =>
      retainProducerAudit(store, {
        releaseId: input.releaseId,
        datasetCode: input.datasetCode,
        rules: [
          ...selectionRules,
          {
            declaration: nativeSourceImportRule,
            inputs: { 'publisher-records': input.rowCount },
            outputs: { 'native-source-records': input.rowCount },
            recordsAffected: input.rowCount,
            decisions: Object.fromEntries(
              input.tables.map(table => [`table:${table.name}`, table.rows.length]),
            ),
          },
        ],
        guards: [
          {
            id: 'native-source-row-count',
            summary:
              'Every validated publisher record is imported into the source ledger.',
            consequence: 'block-ingestion',
            status: 'passed',
            checked: input.rowCount,
            failed: 0,
            reason: `Imported ${input.rowCount} validated publisher records across ${input.tables.length} source table(s).`,
          },
        ],
        individuals: [],
      }),
  })
}

async function resolveNativeSourceRelease(
  target: UploadTarget,
  input: NativeSourceRelease,
  registerOptions: Parameters<typeof prepareUpload>[0],
) {
  if (input.recoverPublishedRelease && !target.remote) {
    const shardYear = resolveShardYear(input.cohortKey, input.sourceVersion)
    const context = await resolveLocalAddressDbContext(target, 'hk', shardYear, {
      cacheTableProfile: 'nativeSource',
    })
    try {
      const releaseCode = buildSourceReleaseCode(input.datasetCode, input.sourceVersion)
      const existing = await getDatasetById(
        context.metaDb as unknown as HarbourReadableDb,
        releaseCode,
      )
      if (
        existing?.status === 'published' &&
        existing.datasetCode === input.datasetCode
      ) {
        return { releaseCode: existing.releaseCode, releaseId: existing.releaseId }
      }
    } finally {
      context.cleanup()
    }
  }

  const prepared = await prepareUpload(registerOptions)
  return dispatchUpload(
    target,
    registerOptions,
    prepared,
    prepared.plan.schemaFingerprint,
    { allowReprocessPublished: true, force: true },
  )
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

function resolveNativeMetaReplay(
  target: UploadTarget,
  context: Pick<LocalAddressDbContext, 'state'>,
) {
  const remoteTarget: SqlImportTargetContext = {
    databaseId: context.state.bindings.DB_META?.databaseId ?? null,
    name: 'meta',
  }
  const accountId = resolveCloudflareAccountId(target)
  const apiToken = process.env.CLOUDFLARE_D1_TOKEN?.trim()
  if (!remoteTarget.databaseId || !accountId || !apiToken) {
    throw new Error(
      'Native source DB_META import requires meta.databaseId, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_D1_TOKEN.',
    )
  }
  return { accountId, apiToken, target: remoteTarget }
}

export async function versionNativeSourceRows<T extends NativeSourceRow>(
  rows: T[],
  releaseId: string,
  releaseCode: string,
  hashPublisherContentOnly = false,
  separatePublisherEnvelope = false,
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
        // Archive provenance changes between releases even for identical features.
        versionHash: await createHash(
          separatePublisherEnvelope
            ? nativeSourcePayloadHashInput({
                ...payload,
                rawProperties: payload.rawProperties,
              })
            : hashPublisherContentOnly
              ? Object.fromEntries(
                  Object.entries(payload).filter(([key]) => key !== 'sources'),
                )
              : payload,
        ),
      }
    }),
  )
}

export async function buildNativeSourceSql(
  tables: NativeSourceTable[],
  releaseId: string,
  releaseCode: string,
) {
  const statements: string[] = []
  for (const table of tables) {
    assertIdentifier(table.name, 'table')
    const rows = await versionNativeSourceRows(
      table.rows,
      releaseId,
      releaseCode,
      table.name === 'hkgovLandsdRoadCentrelines',
      [
        'hkgovLandsdPlaceNames',
        'hkgovPlandPlanningCells',
        'hkgovPlandNewTowns',
        'hkgovHadDivisionAreas',
        'hkgovCenstatdStatistics',
        'hkgovCenstatdDistrictLandAreaPopulationDensities',
      ].includes(table.name),
    )
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
      statements.push(...nativeRowStatements(table.name, row))
    }
  }
  return chunkSql(statements)
}

function nativeRowStatements(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row)
  // A replay restores the same assertion without replacing its first-seen date.
  const updates = columns
    .filter(
      column =>
        !['sourceRecordId', 'versionHash', 'createdAt', 'validFromRelease'].includes(
          column,
        ),
    )
    .map(column => `"${column}" = excluded."${column}"`)
    .join(', ')
  const insert = (values: Record<string, unknown>) =>
    `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(column => sqlValue(values[column])).join(', ')}) ON CONFLICT ("sourceRecordId", "versionHash") DO UPDATE SET ${updates};`
  const direct = insert(row)
  if (Buffer.byteLength(direct) <= SQL_STATEMENT_BYTE_LIMIT) return [direct]

  const placeholder = { ...row, isCurrent: false } as Record<string, unknown>
  const largeValues: Array<[string, string]> = []
  for (const column of columns) {
    const value = row[column]
    if (['sourceRecordId', 'versionHash'].includes(column) || value === null) continue
    if (typeof value !== 'string' && typeof value !== 'object') continue
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (Buffer.byteLength(sqlValue(text)) < 4096) continue
    largeValues.push([column, text])
    placeholder[column] = ''
  }
  const where = `"sourceRecordId" = ${sqlValue(row.sourceRecordId)} AND "versionHash" = ${sqlValue(row.versionHash)}`
  const statements = [insert(placeholder)]
  for (const [column, value] of largeValues) {
    // Iterate code points so a chunk never splits a UTF-8 character. Even
    // four-byte characters and escaped quotes fit comfortably under the cap.
    let part = ''
    const append = () =>
      statements.push(
        `UPDATE "${table}" SET "${column}" = "${column}" || ${sqlValue(part)} WHERE ${where};`,
      )
    for (const character of value) {
      part += character
      if (part.length >= 16000) {
        append()
        part = ''
      }
    }
    if (part) append()
  }
  statements.push(`UPDATE "${table}" SET "isCurrent" = 1 WHERE ${where};`)
  return statements
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
