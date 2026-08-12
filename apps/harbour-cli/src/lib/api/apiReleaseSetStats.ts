import { createHash } from 'node:crypto'

import {
  buildAddressApiReleaseSetStatsRows,
  buildDivisionApiReleaseSetStatsRows,
  createLocaleStatsAccumulator,
  type StatsLocaleGroup,
} from '@repo/core/pipeline/services/stats'
import { replaceApiReleaseSetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { createD1ImportClient } from '@repo/core/d1ImportApi'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'
import { and, currentSchema, eq, sql } from '@repo/db'
import type { ApiReleaseSetScopedStatsRow } from '@repo/db/metaSchema'

import type { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'

type D1ExecBinding = {
  exec?(sql: string): Promise<unknown>
  batch?(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown>
  prepare?(sql: string): {
    run(): Promise<unknown>
  }
}

export type ApiReleaseSetStatsImportOptions = {
  accountId?: string
  apiToken?: string
  isLocal: boolean
  metaBinding?: D1ExecBinding
  metaDatabaseId?: string | null
  pollIntervalMs?: number
}

export type ApiReleaseSetStatsTarget = {
  apiReleaseSetId?: string
  snapshotId?: string
}

type CalculateApiReleaseSetStatsOptions = {
  currentDb: HarbourReadableDb
  family: 'address' | 'division'
  harbourClient: HarbourClient
  importOptions: ApiReleaseSetStatsImportOptions
  metaDb: HarbourReadableDb & HarbourWritableDb
  progress: LocalUploadProgress
  releaseCode?: string
  releaseId: string
  target: ApiReleaseSetStatsTarget
}

type GroupCountRow = {
  count: number
  groupValue: string | number | null
}

const API_RELEASE_SET_STATS_PHASE = 'calculateApiReleaseSetStats'

export function resolveApiReleaseSetStatsTarget(
  publishResult: PublishDatasetResult | void | null | undefined,
): ApiReleaseSetStatsTarget {
  return {
    apiReleaseSetId: publishResult?.apiReleaseSetId,
    snapshotId: publishResult?.snapshotId,
  }
}

export async function calculateAndStoreApiReleaseSetStats(
  options: CalculateApiReleaseSetStatsOptions,
) {
  const { apiReleaseSetId, snapshotId } = options.target

  if (!apiReleaseSetId || !snapshotId) {
    throw new Error(
      'Cannot calculate API release set stats without apiReleaseSetId and snapshotId.',
    )
  }

  const startedAt = Date.now()

  options.progress.beginPhase(
    formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 0, 2),
    {
      current: 0,
      max: 2,
    },
  )
  await options.harbourClient.stageRunning(
    options.releaseId,
    API_RELEASE_SET_STATS_PHASE,
    {
      apiReleaseSetId,
      snapshotId,
      step: 'count',
    },
    options.releaseCode,
  )

  try {
    const rows =
      options.family === 'address'
        ? await buildAddressStatsRows(options.currentDb, snapshotId)
        : await buildDivisionStatsRows(options.currentDb, snapshotId)

    options.progress.update(1, {
      label: formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 1, 2),
    })
    await options.harbourClient.stageRunning(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      {
        apiReleaseSetId,
        snapshotId,
        statsRows: rows.length,
        step: 'write',
      },
      options.releaseCode,
    )

    await storeApiReleaseSetStats(
      options.metaDb,
      options.importOptions,
      apiReleaseSetId,
      rows,
    )

    const stats = {
      apiReleaseSetId,
      durationMs: Date.now() - startedAt,
      snapshotId,
      statsRows: rows.length,
    }

    options.progress.update(2, {
      label: formatRunningPhaseLabel(colorTeal('Calculate'), colorRed('stats'), 2, 2),
    })
    options.progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal('Calculate'),
          colorRed('stats'),
          rows.length,
        ),
        [formatDurationMs(stats.durationMs)],
      ),
    )
    await options.harbourClient.stageCompleted(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      stats,
      options.releaseCode,
    )

    return stats
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    await options.harbourClient.stageFailed(
      options.releaseId,
      API_RELEASE_SET_STATS_PHASE,
      errorMessage,
      {
        apiReleaseSetId,
        durationMs: Date.now() - startedAt,
        snapshotId,
      },
      options.releaseCode,
    )
    throw error
  }
}

async function buildAddressStatsRows(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<ApiReleaseSetScopedStatsRow[]> {
  const [
    address2dCount,
    address2dI18nCount,
    address3dCount,
    address3dI18nCount,
    divisionLinkedCount,
    streetLinkedCount,
  ] = await Promise.all([
    countRows(
      db,
      currentSchema.address2d,
      currentSchema.address2d.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address2dI18n,
      currentSchema.address2dI18n.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address3d,
      currentSchema.address3d.snapshotId,
      snapshotId,
    ),
    countRows(
      db,
      currentSchema.address3dI18n,
      currentSchema.address3dI18n.snapshotId,
      snapshotId,
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.countryId} IS NOT NULL`,
      ),
    ),
    countWhere(
      db,
      currentSchema.address2d,
      and(
        eq(currentSchema.address2d.snapshotId, snapshotId),
        sql`${currentSchema.address2d.streetId} IS NOT NULL`,
      ),
    ),
  ])
  const localeStats = await buildAddressLocaleStats(db, snapshotId, address2dCount)

  return buildAddressApiReleaseSetStatsRows({
    address2dCount,
    address2dI18nCount,
    address3dCount,
    address3dI18nCount,
    divisionLinkedCount,
    localeStats,
    missingDivisionCount: Math.max(0, address2dCount - divisionLinkedCount),
    missingStreetCount: Math.max(0, address2dCount - streetLinkedCount),
    streetLinkedCount,
  })
}

async function buildDivisionStatsRows(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<ApiReleaseSetScopedStatsRow[]> {
  const [divisionCount, divisionI18nCount, byDivisionType, byLevel, localeStats] =
    await Promise.all([
      countRows(
        db,
        currentSchema.divisions,
        currentSchema.divisions.snapshotId,
        snapshotId,
      ),
      countRows(
        db,
        currentSchema.divisionsI18n,
        currentSchema.divisionsI18n.snapshotId,
        snapshotId,
      ),
      countGrouped(
        db,
        currentSchema.divisions,
        currentSchema.divisions.snapshotId,
        snapshotId,
        currentSchema.divisions.type,
      ),
      countGrouped(
        db,
        currentSchema.divisions,
        currentSchema.divisions.snapshotId,
        snapshotId,
        currentSchema.divisions.level,
      ),
      buildDivisionLocaleStats(db, snapshotId),
    ])

  localeStats.total = divisionCount

  return buildDivisionApiReleaseSetStatsRows({
    byDivisionType,
    byLevel,
    divisionCount,
    divisionI18nCount,
    localeStats,
  })
}

async function buildAddressLocaleStats(
  db: HarbourReadableDb,
  snapshotId: string,
  total: number,
) {
  const stats = createLocaleStatsAccumulator()
  stats.total = total

  const rows = await db
    .select({
      count: sql<number>`count(distinct ${currentSchema.address2dI18n.addressId})`,
      groupValue: currentSchema.address2dI18n.locale,
    })
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId))
    .groupBy(currentSchema.address2dI18n.locale)
    .all()

  for (const row of rows) {
    const group = toStatsLocaleGroup(String(row.groupValue))

    if (!group) {
      continue
    }

    const count = Number(row.count ?? 0)
    stats.count.set(group, count)
    stats.nonInferredCoverage.set(group, count)
  }

  return stats
}

async function buildDivisionLocaleStats(db: HarbourReadableDb, snapshotId: string) {
  const stats = createLocaleStatsAccumulator()
  const [coverageRows, nonInferredRows, altRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(distinct ${currentSchema.divisionsI18n.divisionId})`,
        groupValue: currentSchema.divisionsI18n.locale,
      })
      .from(currentSchema.divisionsI18n)
      .where(
        and(
          eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
          sql`${currentSchema.divisionsI18n.name} IS NOT NULL`,
        ),
      )
      .groupBy(currentSchema.divisionsI18n.locale)
      .all(),
    db
      .select({
        count: sql<number>`count(distinct ${currentSchema.divisionsI18n.divisionId})`,
        groupValue: currentSchema.divisionsI18n.locale,
      })
      .from(currentSchema.divisionsI18n)
      .where(
        and(
          eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
          sql`${currentSchema.divisionsI18n.name} IS NOT NULL`,
          eq(currentSchema.divisionsI18n.isLocaleInferred, false),
        ),
      )
      .groupBy(currentSchema.divisionsI18n.locale)
      .all(),
    db
      .select({
        count: sql<number>`count(distinct ${currentSchema.divisionsI18n.divisionId})`,
        groupValue: currentSchema.divisionsI18n.locale,
      })
      .from(currentSchema.divisionsI18n)
      .where(
        and(
          eq(currentSchema.divisionsI18n.snapshotId, snapshotId),
          sql`${currentSchema.divisionsI18n.nameAlts} IS NOT NULL`,
        ),
      )
      .groupBy(currentSchema.divisionsI18n.locale)
      .all(),
  ])

  applyLocaleCountRows(stats.count, coverageRows)
  applyLocaleCountRows(stats.nonInferredCoverage, nonInferredRows)
  applyLocaleCountRows(stats.altCoverage, altRows)

  return stats
}

async function countRows(
  db: HarbourReadableDb,
  table: unknown,
  snapshotIdColumn: any,
  snapshotId: string,
) {
  return countWhere(db, table, eq(snapshotIdColumn, snapshotId))
}

async function countWhere(db: HarbourReadableDb, table: unknown, condition: unknown) {
  const row = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(table)
    .where(condition)
    .get()

  return Number(row?.count ?? 0)
}

async function countGrouped(
  db: HarbourReadableDb,
  table: unknown,
  snapshotIdColumn: any,
  snapshotId: string,
  groupColumn: any,
) {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      groupValue: groupColumn,
    })
    .from(table)
    .where(eq(snapshotIdColumn, snapshotId))
    .groupBy(groupColumn)
    .all()

  return new Map(
    (rows as GroupCountRow[])
      .filter(row => row.groupValue != null)
      .map(row => [String(row.groupValue), Number(row.count ?? 0)]),
  )
}

async function storeApiReleaseSetStats(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  options: ApiReleaseSetStatsImportOptions,
  apiReleaseSetId: string,
  rows: ApiReleaseSetScopedStatsRow[],
) {
  if (options.isLocal) {
    await replaceApiReleaseSetStats(metaDb, apiReleaseSetId, rows)
    return
  }

  if (!options.accountId || !options.apiToken || !options.metaDatabaseId) {
    throw new Error('Remote API release set stats import requires DB_META credentials.')
  }

  const sqlText = buildStatsSql(apiReleaseSetId, rows)
  // D1's import endpoint validates the uploaded object using its MD5 ETag.
  // Keep this aligned with the regular SQL import path; SHA-256 is used for
  // provenance hashes, not for the import upload contract.
  const etag = createHash('md5').update(new TextEncoder().encode(sqlText)).digest('hex')
  const client = createD1ImportClient({
    accountId: options.accountId,
    apiToken: options.apiToken,
    databaseId: options.metaDatabaseId,
  })

  await client.importSql({
    etag,
    pollIntervalMs: options.pollIntervalMs,
    sql: sqlText,
  })
}

function buildStatsSql(apiReleaseSetId: string, rows: ApiReleaseSetScopedStatsRow[]) {
  return [
    `DELETE FROM stats WHERE apiReleaseSetId = ${sqlLiteral(apiReleaseSetId)};`,
    ...rows.map(row =>
      [
        'INSERT INTO stats (id, type, releaseId, snapshotId, apiReleaseSetId, dimension, metric, metricUnit, value, groupBy, groupValue, createdAt, updatedAt) VALUES (',
        [
          crypto.randomUUID(),
          row.type,
          null,
          null,
          apiReleaseSetId,
          row.dimension,
          row.metric,
          row.metricUnit,
          row.value,
          row.groupBy,
          row.groupValue,
          row.createdAt,
          row.updatedAt,
        ]
          .map(sqlLiteral)
          .join(', '),
        ');',
      ].join(''),
    ),
  ].join('\n')
}

function applyLocaleCountRows(
  target: Map<StatsLocaleGroup, number>,
  rows: GroupCountRow[],
) {
  for (const row of rows) {
    const group = toStatsLocaleGroup(String(row.groupValue))

    if (group) {
      target.set(group, Number(row.count ?? 0))
    }
  }
}

function toStatsLocaleGroup(locale: string): StatsLocaleGroup | null {
  if (locale === 'en') {
    return 'en'
  }

  if (['zh', 'zh-hant', 'zh-hk', 'zh-mo', 'zh-tw'].includes(locale)) {
    return 'zh-hant'
  }

  if (['zh-hans', 'zh-cn', 'zh-sg'].includes(locale)) {
    return 'zh-hans'
  }

  return null
}

function sqlLiteral(value: boolean | number | string | null | undefined) {
  if (value == null) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialise non-finite SQL number: ${value}`)
    }

    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${value.replaceAll("'", "''")}'`
}
